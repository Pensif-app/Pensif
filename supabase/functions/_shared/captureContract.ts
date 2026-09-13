// CHANTIER CAPTURE INTELLIGENTE — types du contrat de sortie de l'Edge Function `capture`.
// Copie miroir DÉLIBÉRÉE de src/data/captureTypes.ts (l'app RN) : Deno Edge Functions ne partagent
// pas de bundle avec l'app mobile, ce fichier est donc la source de vérité côté serveur — toute
// évolution du contrat doit être répercutée manuellement des deux côtés.

export type CaptureEventInfo = {
  hasDate: boolean;
  date: string | null; // 'YYYY-MM-DD'
  heardExpression: string | null;
  confidence: number;
};

export type CaptureReminderInfo = {
  hasReminder: boolean;
  date: string | null; // 'YYYY-MM-DD'
  time: string | null; // 'HH:mm' (24h)
  heardExpression: string | null;
  confidence: number;
};

export type ExtractedPensee = {
  texte: string;
  heardContactName: string | null;
  event: CaptureEventInfo;
  reminder: CaptureReminderInfo;
  confidence: number;
};

export type CaptureContract = {
  transcript: string;
  meta?: { sttProvider?: string; llmProvider?: string };
  pensees: ExtractedPensee[];
  parseError: string | null;
};

/** Contexte temporel dérivé côté serveur (voir context.ts) — jamais fourni tel quel par le client
 *  au-delà de `timezone`/`localDateTime` (le client n'envoie plus `weekday`, pour éviter deux
 *  sources de vérité potentiellement contradictoires). */
export type TemporalContext = {
  timezone: string;
  localDateTime: string; // 'YYYY-MM-DDTHH:mm:ss', naïf, sans Z/offset
  weekday: string; // dérivé, un des 7 noms FR en minuscules
};
