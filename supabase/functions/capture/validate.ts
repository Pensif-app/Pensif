// Validation/normalisation STRICTE de la sortie brute du LLM — jamais un cast direct du JSON reçu.
// Reconstruction champ par champ : tout ce qui n'est pas explicitement listé ici est ignoré ; toute
// valeur invalide est normalisée (jamais rejetée en bloc si le reste de la pensée est exploitable),
// sauf `texte` manquant qui fait écarter CETTE pensée précise (pas toute la réponse).
import { CaptureContract, CaptureEventInfo, CaptureReminderInfo, ExtractedPensee } from '../_shared/captureContract.ts';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  // Calcul calendaire pur (comme context.ts) — vérifie que le jour existe réellement dans ce mois
  // (ex. rejette "2026-02-30"), sans jamais interpréter cette date comme un instant.
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return asUtc.getUTCFullYear() === year && asUtc.getUTCMonth() === month - 1 && asUtc.getUTCDate() === day;
}

/** `null` si absent/mal formé — jamais une erreur qui ferait écarter toute la pensée : une date ou
 *  une heure invalide devient simplement une information manquante, à compléter par l'utilisateur
 *  sur l'écran de validation (voir captureReview.ts côté app). */
function normalizeDateString(value: unknown): string | null {
  return typeof value === 'string' && isValidCalendarDate(value) ? value : null;
}

function normalizeTimeString(value: unknown): string | null {
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : null;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeHeardContactName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEvent(raw: unknown): CaptureEventInfo {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const date = normalizeDateString(obj.date);
  return {
    hasDate: Boolean(obj.hasDate) && date !== null,
    date,
    heardExpression: typeof obj.heardExpression === 'string' ? obj.heardExpression : null,
    confidence: normalizeConfidence(obj.confidence),
  };
}

function normalizeReminder(raw: unknown): CaptureReminderInfo {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    // hasReminder reste tel qu'exprimé par le LLM même si date/time sont absents/invalides :
    // l'intention "je veux un rappel" ne doit jamais être silencieusement effacée, seulement
    // marquée incomplète (voir captureReview.ts : bloque l'enregistrement tant que non complétée).
    hasReminder: Boolean(obj.hasReminder),
    date: normalizeDateString(obj.date),
    time: normalizeTimeString(obj.time), // invalide → null, jamais une heure par défaut inventée
    heardExpression: typeof obj.heardExpression === 'string' ? obj.heardExpression : null,
    confidence: normalizeConfidence(obj.confidence),
  };
}

/** `null` si cette entrée n'a pas de `texte` exploitable — l'appelant doit alors l'écarter du
 *  tableau plutôt que de rejeter toute la réponse. */
function normalizeExtractedPensee(raw: unknown): ExtractedPensee | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const texte = typeof obj.texte === 'string' ? obj.texte.trim() : '';
  if (!texte) return null;
  return {
    texte,
    heardContactName: normalizeHeardContactName(obj.heardContactName),
    event: normalizeEvent(obj.event),
    reminder: normalizeReminder(obj.reminder),
    confidence: normalizeConfidence(obj.confidence),
  };
}

export type ValidationOutcome =
  | { ok: true; pensees: ExtractedPensee[] }
  | { ok: false; parseError: string };

/**
 * Point d'entrée : valide la sortie BRUTE (non fiable) du LLM. Ne lève jamais — retourne un
 * résultat explicite pour que l'appelant (index.ts) puisse toujours répondre `200` avec un repli
 * sur le transcript brut plutôt qu'une erreur dure (voir CaptureContract.parseError).
 */
export function validateLlmOutput(raw: unknown): ValidationOutcome {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, parseError: 'Réponse du LLM non exploitable (pas un objet JSON)' };
  }
  const penseesRaw = (raw as Record<string, unknown>).pensees;
  if (!Array.isArray(penseesRaw)) {
    return { ok: false, parseError: 'Réponse du LLM non exploitable (champ "pensees" absent ou non-tableau)' };
  }
  const pensees = penseesRaw.map(normalizeExtractedPensee).filter((p): p is ExtractedPensee => p !== null);
  if (pensees.length === 0) {
    return { ok: false, parseError: 'Aucune pensée exploitable dans la réponse du LLM (texte manquant sur toutes les entrées)' };
  }
  return { ok: true, pensees };
}

/** Construit le CaptureContract final à renvoyer au client — utilisé aussi bien pour le cas
 *  succès (validation réussie) que pour le repli transcript-brut (`parseError` non nul, voir
 *  index.ts), jamais deux logiques de construction différentes. */
export function buildCaptureContract(
  transcript: string,
  meta: { sttProvider?: string; llmProvider?: string },
  outcome: ValidationOutcome,
): CaptureContract {
  if (outcome.ok) {
    return { transcript, meta, pensees: outcome.pensees, parseError: null };
  }
  return { transcript, meta, pensees: [], parseError: outcome.parseError };
}
