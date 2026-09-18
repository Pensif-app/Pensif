// Orchestrateur HTTP de l'Edge Function `capture` — CHANTIER CAPTURE INTELLIGENTE.
// Auth JWT obligatoire → parsing requête (multipart audio réel / JSON transcript de test,
// jamais les deux mélangés) → STT (sauf mode transcript) → LLM → validation stricte → réponse.
// `handleRequest` accepte des dépendances injectables (voir CaptureDeps) pour rester testable sans
// réseau réel ni vrai projet Supabase (voir index.test.ts).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildTemporalContext, InvalidContextError } from './context.ts';
import { getSttProvider, UnknownSttProviderError } from './providers/stt/index.ts';
import { getLlmProvider, UnknownLlmProviderError } from './providers/llm/index.ts';
import { SttProvider } from './providers/stt/types.ts';
import { LlmExtractionError, LlmProvider } from './providers/llm/types.ts';
import { buildCaptureContract, validateLlmOutput } from './validate.ts';
import { CaptureParseErrorCategory } from '../_shared/captureContract.ts';
import { CAPTURE_USAGE_ERROR_CODE, CaptureUsageResult, defaultRegisterCaptureUsage } from './rateLimit.ts';
import { resolveSupabasePublishableKey } from '../_shared/supabaseEnv.ts';
import { normalizeBrandMentions } from './textNormalization.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export type CaptureSession = { userId: string };

/** Vérification RÉELLE (réseau) — n'est jamais appelée par les tests, qui injectent une version
 *  factice via `CaptureDeps.verifySession` (voir index.test.ts). */
async function defaultVerifySession(req: Request): Promise<CaptureSession | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Préfère SUPABASE_PUBLISHABLE_KEYS (moderne, dictionnaire JSON — voir supabaseEnv.ts) ; retombe
  // sur SUPABASE_ANON_KEY (legacy) pour un projet pas encore migré.
  const anonKey = resolveSupabasePublishableKey();
  if (!supabaseUrl || !anonKey) return null;
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

export type CaptureDeps = {
  verifySession: (req: Request) => Promise<CaptureSession | null>;
  getSttProvider: (name: string) => SttProvider;
  getLlmProvider: (name: string) => LlmProvider;
  /** Protection serveur invisible (§2) — DOIT être appelée avant tout appel STT/LLM et retourner
   *  autre chose que 'ok' bloque la requête sans jamais atteindre Groq/OpenAI (voir plus bas). */
  registerCaptureUsage: (userId: string) => Promise<CaptureUsageResult>;
};

const defaultDeps: CaptureDeps = {
  verifySession: defaultVerifySession,
  getSttProvider,
  getLlmProvider,
  registerCaptureUsage: defaultRegisterCaptureUsage,
};

export async function handleRequest(req: Request, deps: CaptureDeps = defaultDeps): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const session = await deps.verifySession(req);
  if (!session) {
    return jsonResponse({ error: 'unauthorized', message: 'Session Supabase manquante ou invalide' }, 401);
  }

  const contentType = req.headers.get('content-type') ?? '';

  let transcriptFromRequest: string | null = null;
  let audioBytes: Uint8Array | null = null;
  let audioMimeType: string | null = null;
  let audioFilename: string | null = null;
  let rawContext: unknown;

  try {
    if (contentType.startsWith('multipart/form-data')) {
      const form = await req.formData();
      if (form.get('transcript') !== null) {
        return jsonResponse(
          { error: 'bad_request', message: 'Le champ "transcript" n’est pas accepté en multipart — utilisez application/json pour le mode test.' },
          400,
        );
      }
      const audioField = form.get('audio');
      if (!(audioField instanceof File)) {
        return jsonResponse({ error: 'bad_request', message: 'Champ "audio" manquant ou invalide (multipart/form-data)' }, 400);
      }
      const contextField = form.get('context');
      if (typeof contextField !== 'string') {
        return jsonResponse({ error: 'bad_request', message: 'Champ "context" manquant (chaîne JSON attendue en multipart)' }, 400);
      }
      audioBytes = new Uint8Array(await audioField.arrayBuffer());
      audioMimeType = audioField.type || 'application/octet-stream';
      // BUG CORRIGÉ : le nom de fichier réel (avec son extension) doit être transmis jusqu'à
      // l'adaptateur STT — certains fournisseurs (OpenAI Whisper) détectent le format audio par
      // l'extension du nom de fichier, pas seulement par le Content-Type multipart.
      audioFilename = audioField.name || 'audio';
      try {
        rawContext = JSON.parse(contextField);
      } catch {
        return jsonResponse({ error: 'bad_request', message: 'Champ "context" n’est pas un JSON valide' }, 400);
      }
    } else if (contentType.startsWith('application/json')) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: 'bad_request', message: 'Corps de requête JSON invalide' }, 400);
      }
      if (typeof body !== 'object' || body === null) {
        return jsonResponse({ error: 'bad_request', message: 'Corps de requête JSON invalide' }, 400);
      }
      const { transcript, audio, context } = body as Record<string, unknown>;
      if (audio !== undefined) {
        return jsonResponse(
          { error: 'bad_request', message: 'Le champ "audio" n’est pas accepté en JSON — utilisez multipart/form-data pour l’audio réel.' },
          400,
        );
      }
      if (typeof transcript !== 'string' || !transcript.trim()) {
        return jsonResponse({ error: 'bad_request', message: 'Champ "transcript" manquant ou vide (mode test sans audio)' }, 400);
      }
      transcriptFromRequest = transcript;
      rawContext = context;
    } else {
      return jsonResponse(
        { error: 'bad_request', message: 'Content-Type non supporté (attendu multipart/form-data ou application/json)' },
        400,
      );
    }
  } catch (e) {
    return jsonResponse({ error: 'bad_request', message: `Requête illisible : ${e instanceof Error ? e.message : String(e)}` }, 400);
  }

  let temporalContext;
  try {
    temporalContext = buildTemporalContext(rawContext);
  } catch (e) {
    if (e instanceof InvalidContextError) return jsonResponse({ error: 'bad_request', message: e.message }, 400);
    throw e;
  }

  const sttProviderName = Deno.env.get('STT_PROVIDER') ?? 'mock';
  const sttModel = Deno.env.get('STT_MODEL') ?? '';
  const llmProviderName = Deno.env.get('LLM_PROVIDER') ?? 'mock';
  const llmModel = Deno.env.get('LLM_MODEL') ?? '';

  let sttProvider: SttProvider;
  let llmProvider: LlmProvider;
  try {
    sttProvider = deps.getSttProvider(sttProviderName);
    llmProvider = deps.getLlmProvider(llmProviderName);
  } catch (e) {
    if (e instanceof UnknownSttProviderError || e instanceof UnknownLlmProviderError) {
      return jsonResponse({ error: 'server_misconfigured', message: e.message }, 500);
    }
    throw e;
  }

  // PROTECTION SERVEUR INVISIBLE (§2) — contrôlée ICI, avant tout appel STT/LLM (payant), jamais
  // côté client. Une capture ne compte QUE si elle franchit réellement ce contrôle et entre dans le
  // pipeline IA (voir register_capture_usage, schema.sql) : un 400 plus haut (requête malformée,
  // contexte invalide...) n'a jamais atteint ce point, donc ne consomme rien. Un échec provider
  // APRÈS ce point compte quand même — volontaire (protection des coûts avant tout, voir consigne).
  let usageResult: CaptureUsageResult;
  try {
    usageResult = await deps.registerCaptureUsage(session.userId);
  } catch (e) {
    return jsonResponse({ error: 'server_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
  if (usageResult !== 'ok') {
    // Codes structurés SEULS exposés au client — jamais un seuil, un compteur restant ni le mot
    // "quota" (voir captureUsageMessages.ts côté app, qui traduit ce code en message générique).
    return jsonResponse({ error: 'capture_blocked', code: CAPTURE_USAGE_ERROR_CODE[usageResult] }, 429);
  }

  let transcript: string;
  if (transcriptFromRequest !== null) {
    transcript = transcriptFromRequest;
  } else {
    try {
      transcript = await sttProvider.transcribe({ bytes: audioBytes!, mimeType: audioMimeType!, filename: audioFilename! }, { model: sttModel });
    } catch (e) {
      return jsonResponse({ error: 'stt_failed', message: e instanceof Error ? e.message : String(e) }, 502);
    }
  }
  // CHANTIER "Capture robustness — Pensif/Pansif" (2026-09-18) — appliquée ICI, un seul point,
  // AVANT le LLM (pour qu'il voie le nom de marque correctement orthographié) ET avant
  // `buildCaptureContract` (pour que le transcript renvoyé au client — y compris dans le repli
  // "texte brut" d'un parseError — porte déjà la correction). Voir textNormalization.ts : substitution
  // ciblée UNIQUEMENT sur le mot "pansif", jamais sur l'adjectif français "pensif".
  transcript = normalizeBrandMentions(transcript);

  const meta = { sttProvider: sttProvider.name, llmProvider: llmProvider.name };

  let rawLlmOutput: unknown;
  try {
    rawLlmOutput = await llmProvider.extract(transcript, temporalContext, { model: llmModel });
  } catch (e) {
    // Un échec RÉSEAU/API du LLM n'empêche pas de renvoyer le transcript déjà obtenu — le client
    // sait déjà replier sur un simple mémo (voir captureReview.ts, buildInitialCards).
    // CHANTIER "Capture bloquante — diagnostic parseError" (2026-09-18), priorité 3 : `LlmExtractionError`
    // porte sa catégorie précise (voir providers/llm/types.ts, toLlmFailureCategory dans openai.ts) ;
    // toute autre exception (provider qui ne la lève pas encore) retombe sur `'unknown'`, jamais une
    // catégorie devinée.
    const category: CaptureParseErrorCategory = e instanceof LlmExtractionError ? e.category : 'unknown';
    const outcome = { ok: false as const, parseError: `Extraction LLM indisponible : ${e instanceof Error ? e.message : String(e)}`, category };
    return jsonResponse(buildCaptureContract(transcript, meta, outcome), 200);
  }

  const outcome = validateLlmOutput(rawLlmOutput);
  return jsonResponse(buildCaptureContract(transcript, meta, outcome), 200);
}

// `import.meta.main` : ne démarre le serveur QUE si ce fichier est exécuté directement (déploiement
// réel) — jamais quand il est simplement importé par les tests (index.test.ts), qui n'ont ni besoin
// ni la permission réseau pour ouvrir un vrai listener.
if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
