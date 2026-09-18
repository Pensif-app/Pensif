// CHANTIER CAPTURE INTELLIGENTE — appel réseau vers l'Edge Function `capture`. Aucune clé de
// fournisseur STT/LLM ici (elles restent exclusivement des secrets Supabase côté Edge Function) —
// ce fichier ne connaît que l'audio local et la session Supabase déjà utilisée partout ailleurs
// dans l'app (`supabase.functions.invoke` attache automatiquement le JWT de la session courante).
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CaptureResult } from '../data/captureTypes';
import { mapCaptureBlockedCodeToMessage } from '../data/captureUsageMessages';

export type CaptureUploadInput = {
  uri: string;
  filename: string;
  mimeType: string;
};

/** Construit le contexte temporel attendu par le backend — TOUJOURS des composants locaux
 *  explicites (jamais `toISOString()`, qui convertirait en UTC), même discipline que
 *  reminderDate.ts. Le serveur dérive lui-même le jour de semaine (voir context.ts côté backend) —
 *  on ne l'envoie plus. */
function buildLocalDateTime(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  } catch {
    return 'Europe/Paris';
  }
}

export class CaptureApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

/**
 * CHANTIER "Capture robustness — observabilité client DEV" (2026-09-18). Log TEMPORAIRE, `__DEV__`
 * uniquement (jamais en production) — permet de savoir IMMÉDIATEMENT, au prochain test réel, si le
 * serveur a renvoyé un `parseError` (le problème est alors déjà côté serveur/LLM, voir logs
 * `capture_llm_attempt`) ou si les données sont perdues APRÈS (côté client, entre la réponse reçue et
 * l'affichage). Volontairement TRÈS LIMITÉ : jamais le transcript, jamais le texte d'une pensée,
 * jamais le contenu LLM brut, jamais une donnée contact — uniquement un booléen, un compte, et le nom
 * (non sensible) du provider LLM ayant traité la requête. À retirer une fois le diagnostic terminé
 * (voir consigne "logging DEV temporaire").
 */
function logCaptureResultDev(result: CaptureResult): void {
  if (!__DEV__) return;
  console.log('[Pensif][capture-debug] capture result:', {
    parseErrorPresent: result.parseError !== null,
    // CHANTIER "Capture bloquante — diagnostic parseError" (2026-09-18), priorité 3 : étiquette
    // technique grossière (jamais de transcript/prompt/contenu LLM/donnée contact) — `undefined`
    // (backend pas encore redéployé avec ce champ) normalisé à `null`, même discipline que
    // `reminder.recurrence` ailleurs dans ce contrat.
    parseErrorCategory: result.parseErrorCategory ?? null,
    penseesCount: result.pensees.length,
    llmProvider: result.meta?.llmProvider ?? null,
    // CHANTIER "Capture diagnostic V19 — root cause Anthropic" (2026-09-18) : structure des pensées
    // extraites, jamais leur CONTENU — uniquement des booléens/longueurs/étiquettes de forme (aucun
    // "texte", aucun "heardExpression", aucun contenu LLM brut, aucune donnée contact). Sert à
    // corréler une extraction structurellement plausible (reminder/recurrence bien formés) avec un
    // rejet post-STT par isCaptureExploitable (voir captureExploitability.ts) qui, lui, se juge sur
    // le CONTENU du texte — jamais visible ici, volontairement.
    penseeDiagnostics: result.pensees.map((p) => ({
      textPresent: p.texte.trim().length > 0,
      textLength: p.texte.length,
      reminderHasReminder: p.reminder.hasReminder,
      reminderTimePresent: p.reminder.time !== null,
      recurrencePresent: p.reminder.recurrence != null,
      recurrenceDetected: p.reminder.recurrence?.detected ?? false,
      recurrenceFrequency: p.reminder.recurrence?.frequency ?? null,
      occurrenceCountPresent: p.reminder.recurrence?.occurrenceCount != null,
    })),
  });
}

/** Traduit une erreur `supabase.functions.invoke` (HTTP ou réseau) en `CaptureApiError` — factorisé
 *  entre `uploadAudioForCapture` (audio réel) et `reextractCapture` (texte déjà obtenu, voir plus
 *  bas) : même gestion d'erreur, jamais deux implémentations divergentes. */
async function invokeCaptureFunction(body: FormData | Record<string, unknown>): Promise<CaptureResult> {
  if (!supabase) throw new CaptureApiError('Supabase non configuré');
  try {
    const { data, error } = await supabase.functions.invoke('capture', { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let message = 'Erreur du serveur de capture';
        try {
          const errBody = await error.context.json();
          if (errBody?.error === 'capture_blocked') {
            // Protection serveur invisible (§2) — traduit TOUJOURS en message générique, jamais le
            // code interne (CAPTURE_RATE_LIMIT_MINUTE, etc.) ni la réponse brute du serveur, même si
            // celle-ci contenait un jour un champ "message" par erreur.
            message = mapCaptureBlockedCodeToMessage(errBody.code);
          } else if (typeof errBody?.message === 'string') {
            message = errBody.message;
          }
        } catch {
          // corps non-JSON — on garde le message générique
        }
        throw new CaptureApiError(message, error.context.status);
      }
      throw new CaptureApiError(error.message ?? 'Échec de la capture');
    }
    const result = data as CaptureResult;
    logCaptureResultDev(result);
    return result;
  } catch (e) {
    if (e instanceof CaptureApiError) throw e;
    throw new CaptureApiError(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Envoie l'audio enregistré à l'Edge Function `capture` (multipart/form-data — jamais de base64,
 * voir consigne du chantier). Le nom de fichier réel (avec extension) est toujours transmis tel
 * quel — jamais renommé en "audio" sans extension (voir le bug déjà rencontré côté adaptateur STT).
 */
export async function uploadAudioForCapture(input: CaptureUploadInput): Promise<CaptureResult> {
  if (!supabase) throw new CaptureApiError('Supabase non configuré');

  // BUG CORRIGÉ (découvert lors du test réel) : Expo SDK 57 remplace le `fetch` global par sa
  // propre implémentation ("Winter"), dont le convertisseur FormData interne (convertFormData.ts)
  // ne reconnaît PAS la forme historique React Native `{ uri, name, type }` — seulement un vrai
  // `Blob` (ou un objet avec `.bytes()`). Passer l'objet `{uri,...}` provoque une erreur immédiate
  // ("Unsupported FormDataPart implementation") avant même l'envoi réseau. On lit donc le fichier
  // local via `fetch` (qui, lui, sait lire une URI `file://`) pour obtenir un vrai Blob, qu'on
  // attache ensuite avec la signature web standard `append(name, blob, filename)` — aucune nouvelle
  // dépendance native requise (juste `fetch`/`Blob`, déjà globaux).
  const audioResponse = await fetch(input.uri);
  const audioBlob = await audioResponse.blob();

  const context = { timezone: detectTimezone(), localDateTime: buildLocalDateTime(new Date()) };
  const form = new FormData();
  form.append('audio', audioBlob, input.filename);
  form.append('context', JSON.stringify(context));

  return invokeCaptureFunction(form);
}

/**
 * CHANTIER "Capture robustness — filet de sécurité" (2026-09-18), point 7. Relance UNIQUEMENT
 * l'étape d'extraction LLM sur un transcript DÉJÀ obtenu (ex. après un double échec LLM, voir
 * `CaptureCard.analysisFailed`/`reanalyzeFailedCard`, captureReview.ts) — jamais un nouvel
 * enregistrement audio/STT, en réutilisant le mode "transcript JSON" déjà supporté nativement par
 * l'Edge Function `capture` (voir index.ts : `transcript`/`context` en JSON, bascule directe vers le
 * LLM sans STT — ce chemin existe déjà en production, ce n'est pas un nouvel endpoint).
 */
export async function reextractCapture(transcript: string): Promise<CaptureResult> {
  const context = { timezone: detectTimezone(), localDateTime: buildLocalDateTime(new Date()) };
  return invokeCaptureFunction({ transcript, context });
}
