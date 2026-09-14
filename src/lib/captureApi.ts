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

  try {
    const { data, error } = await supabase.functions.invoke('capture', { body: form });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let message = 'Erreur du serveur de capture';
        try {
          const body = await error.context.json();
          if (body?.error === 'capture_blocked') {
            // Protection serveur invisible (§2) — traduit TOUJOURS en message générique, jamais le
            // code interne (CAPTURE_RATE_LIMIT_MINUTE, etc.) ni la réponse brute du serveur, même si
            // celle-ci contenait un jour un champ "message" par erreur.
            message = mapCaptureBlockedCodeToMessage(body.code);
          } else if (typeof body?.message === 'string') {
            message = body.message;
          }
        } catch {
          // corps non-JSON — on garde le message générique
        }
        throw new CaptureApiError(message, error.context.status);
      }
      throw new CaptureApiError(error.message ?? 'Échec de la capture');
    }
    return data as CaptureResult;
  } catch (e) {
    if (e instanceof CaptureApiError) throw e;
    throw new CaptureApiError(e instanceof Error ? e.message : String(e));
  }
}
