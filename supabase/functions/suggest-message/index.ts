// Orchestrateur HTTP — Edge Function `suggest-message`. CHANTIER RÉPONSES INTELLIGENTES, incrément 1
// (2026-09-16). TOTALEMENT séparée de `capture` (aucun fichier importé depuis ce dossier, aucune
// infrastructure partagée hormis `_shared/supabaseEnv.ts`, générique) : un problème/incident sur
// l'une ne peut jamais affecter l'autre, et redéployer l'une ne redéploie jamais l'autre.
//
// Flux : auth JWT obligatoire → parsing JSON → validation stricte du contexte (jamais confiance dans
// ce que le client envoie, même si c'est notre propre app) → anti-abus (rafale courte, pas de
// plafond mensuel) → appel LLM → validation stricte de la sortie → réponse `{ message }`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getLlmProvider, UnknownLlmProviderError } from './providers/llm/index.ts';
import { LlmProvider } from './providers/llm/types.ts';
import { buildSuggestMessageContract, validateLlmOutput, validateRequestContext } from './validate.ts';
import {
  defaultRegisterMessageSuggestionUsage,
  MESSAGE_SUGGESTION_USAGE_ERROR_CODE,
  MessageSuggestionUsageResult,
} from './rateLimit.ts';
import { resolveSupabasePublishableKey } from '../_shared/supabaseEnv.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export type SuggestMessageSession = { userId: string };

/** Vérification RÉELLE (réseau) — jamais appelée par les tests (voir index.test.ts). Fonction
 *  DUPLIQUÉE depuis capture/index.ts (même principe générique de vérification de JWT Supabase),
 *  jamais importée depuis ce dossier — isolation totale demandée par la consigne. */
async function defaultVerifySession(req: Request): Promise<SuggestMessageSession | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = resolveSupabasePublishableKey();
  if (!supabaseUrl || !anonKey) return null;
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

export type SuggestMessageDeps = {
  verifySession: (req: Request) => Promise<SuggestMessageSession | null>;
  getLlmProvider: (name: string) => LlmProvider;
  registerMessageSuggestionUsage: (userId: string) => Promise<MessageSuggestionUsageResult>;
};

const defaultDeps: SuggestMessageDeps = {
  verifySession: defaultVerifySession,
  getLlmProvider,
  registerMessageSuggestionUsage: defaultRegisterMessageSuggestionUsage,
};

export async function handleRequest(req: Request, deps: SuggestMessageDeps = defaultDeps): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const session = await deps.verifySession(req);
  if (!session) {
    return jsonResponse({ error: 'unauthorized', message: 'Session Supabase manquante ou invalide' }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'Corps de requête JSON invalide' }, 400);
  }

  const validated = validateRequestContext(rawBody);
  if (!validated.ok) {
    return jsonResponse({ error: 'bad_request', message: validated.message }, 400);
  }

  // CORRECTIF (2026-09-16) — noms DÉDIÉS, jamais `LLM_PROVIDER`/`LLM_MODEL` génériques : les secrets
  // Supabase sont partagés au niveau du PROJET ENTIER, pas isolés par fonction. Utiliser les mêmes
  // noms que capture/index.ts aurait fait dépendre le modèle de cette fonction de la configuration
  // de Capture (et inversement) — trouvé lors de l'audit pré-déploiement, jamais déployé avec ce bug.
  const llmProviderName = Deno.env.get('SUGGEST_MESSAGE_LLM_PROVIDER') ?? 'mock';
  const llmModel = Deno.env.get('SUGGEST_MESSAGE_LLM_MODEL') ?? '';

  let llmProvider: LlmProvider;
  try {
    llmProvider = deps.getLlmProvider(llmProviderName);
  } catch (e) {
    if (e instanceof UnknownLlmProviderError) return jsonResponse({ error: 'server_misconfigured', message: e.message }, 500);
    throw e;
  }

  // ANTI-ABUS — vérifié APRÈS la validation du contexte (une requête malformée ne consomme jamais le
  // quota, voir même principe que Capture) mais AVANT tout appel LLM payant.
  let usageResult: MessageSuggestionUsageResult;
  try {
    usageResult = await deps.registerMessageSuggestionUsage(session.userId);
  } catch (e) {
    return jsonResponse({ error: 'server_error', message: e instanceof Error ? e.message : String(e) }, 500);
  }
  if (usageResult !== 'ok') {
    // Code structuré SEUL exposé — jamais un seuil ni le mot "quota" (voir
    // messageSuggestionUsageMessages.ts côté app, incrément 2).
    return jsonResponse({ error: 'message_suggestion_blocked', code: MESSAGE_SUGGESTION_USAGE_ERROR_CODE[usageResult] }, 429);
  }

  let rawLlmOutput: unknown;
  try {
    rawLlmOutput = await llmProvider.generate(validated.context, validated.tone, { model: llmModel });
  } catch (e) {
    return jsonResponse({ error: 'llm_failed', message: e instanceof Error ? e.message : String(e) }, 502);
  }

  const outcome = validateLlmOutput(rawLlmOutput);
  const contract = buildSuggestMessageContract(outcome);
  if (!contract) {
    return jsonResponse({ error: 'llm_output_invalid', message: !outcome.ok ? outcome.parseError : '' }, 502);
  }
  return jsonResponse(contract, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
