// Validation/normalisation STRICTE de la sortie brute du LLM — jamais un cast direct du JSON reçu.
// Reconstruction champ par champ : tout ce qui n'est pas explicitement listé ici est ignoré ; toute
// valeur invalide est normalisée (jamais rejetée en bloc si le reste de la pensée est exploitable),
// sauf `texte` manquant qui fait écarter CETTE pensée précise (pas toute la réponse).
import {
  CaptureContract,
  CaptureEventInfo,
  CaptureParseErrorCategory,
  CaptureRecurrenceInfo,
  CaptureReminderInfo,
  ExtractedPensee,
} from '../_shared/captureContract.ts';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'unclear'] as const;

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
    // CHANTIER CAPTURE — EVENT TIME, incrément 1 (2026-09-18) : même discipline que reminder.time —
    // invalide/absent → null, jamais une heure par défaut inventée. Indépendant de `hasDate`/`date`
    // (une heure ne "valide" jamais une date, et inversement) — même principe que event/reminder.
    time: normalizeTimeString(obj.time),
    heardExpression: typeof obj.heardExpression === 'string' ? obj.heardExpression : null,
    confidence: normalizeConfidence(obj.confidence),
  };
}

/**
 * CHANTIER RAPPELS RÉCURRENTS — incrément 2 (2026-09-18). Validation STRICTE, délibérément différente
 * du style permissif de normalizeEvent/normalizeReminder (qui ramènent un champ scalaire invalide à
 * `null`/`false` sans jamais faire échouer le reste) : une récurrence est une structure composite où
 * une incohérence partielle (ex. `frequency:'daily'` avec `daysOfWeek:[2,4]`) ne peut PAS être
 * "réparée" champ par champ sans deviner l'intention réelle de l'utilisateur. Toute incohérence fait
 * donc rejeter la récurrence EN BLOC — jamais une reconstruction partielle — en retombant sur le
 * représentant canonique de "aucune récurrence" (`null`, voir captureContract.ts). Le reste de la
 * pensée (texte, event, reminder.hasReminder/date/time) n'est JAMAIS affecté par ce rejet : la
 * récurrence complète le reminder, elle ne le conditionne pas.
 */
function normalizeCaptureRecurrence(raw: unknown): CaptureRecurrenceInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  // `detected=false` (ou absent/non-booléen) → aucune récurrence, quoi que portent les autres
  // champs : jamais une "fausse règle remplie" qui survivrait à ce garde — voir consigne explicite.
  if (obj.detected !== true) return null;

  if (!RECURRENCE_FREQUENCIES.includes(obj.frequency as (typeof RECURRENCE_FREQUENCIES)[number])) return null;
  const frequency = obj.frequency as (typeof RECURRENCE_FREQUENCIES)[number];

  // heardExpression : OBLIGATOIRE et non vide dès que detected=true — sans trace de ce qui a été
  // entendu, une récurrence "true" n'est pas exploitable/vérifiable plus tard (voir type, captureContract.ts).
  if (typeof obj.heardExpression !== 'string' || !obj.heardExpression.trim()) return null;
  const heardExpression = obj.heardExpression;

  let daysOfWeek: number[] | null;
  if (frequency === 'daily') {
    // 'daily' implique les 7 jours — un tableau non vide ici serait une incohérence avec la
    // fréquence annoncée (ex. le LLM a confondu daily et weekly), jamais silencieusement ignoré.
    if (obj.daysOfWeek !== undefined && obj.daysOfWeek !== null && !(Array.isArray(obj.daysOfWeek) && obj.daysOfWeek.length === 0)) {
      return null;
    }
    daysOfWeek = [];
  } else if (frequency === 'weekly') {
    if (!Array.isArray(obj.daysOfWeek) || obj.daysOfWeek.length === 0) return null;
    if (!obj.daysOfWeek.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) return null;
    // "jours UNIQUES" (consigne explicite) — un doublon est une incohérence rejetée, jamais
    // silencieusement dédupliquée (contrairement au module client pur, incrément 1, plus permissif
    // par nature sur une donnée déjà construite par l'app elle-même, pas par un LLM non fiable).
    const asNumbers = obj.daysOfWeek as number[];
    if (new Set(asNumbers).size !== asNumbers.length) return null;
    // CANONICALISATION (incrément 2B, 2026-09-18) — tri croissant APRÈS validation (rejet des
    // doublons/valeurs invalides déjà fait ci-dessus) : uniquement une représentation de sortie,
    // jamais un ajout/suppression/interprétation d'un jour. Le LLM peut renvoyer l'ordre dans lequel
    // les jours ont été prononcés (ex. "samedi et dimanche" → [6,0]) ; la sortie validée reste
    // toujours dans l'ordre canonique [0..6] pour que tout consommateur futur (client, tests) puisse
    // s'y fier sans re-trier lui-même.
    daysOfWeek = [...asNumbers].sort((a, b) => a - b);
  } else {
    // 'unclear' — la portée n'est PAS déterminable : daysOfWeek DOIT être null, jamais une valeur
    // partielle qui laisserait croire à une portée résolue.
    if (obj.daysOfWeek !== null && obj.daysOfWeek !== undefined) return null;
    daysOfWeek = null;
  }

  let occurrenceCount: number | null = null;
  if (obj.occurrenceCount !== undefined && obj.occurrenceCount !== null) {
    const oc = obj.occurrenceCount;
    if (!Number.isInteger(oc) || (oc as number) < 1) return null;
    occurrenceCount = oc as number;
  }

  let untilDate: string | null = null;
  if (obj.untilDate !== undefined && obj.untilDate !== null) {
    if (typeof obj.untilDate !== 'string' || !isValidCalendarDate(obj.untilDate)) return null;
    untilDate = obj.untilDate;
  }

  return { detected: true, frequency, daysOfWeek, occurrenceCount, untilDate, heardExpression };
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
    // Récurrence : complète le reminder, ne le conditionne jamais — une récurrence rejetée
    // (normalizeCaptureRecurrence → null) laisse hasReminder/date/time totalement intacts ci-dessus.
    recurrence: normalizeCaptureRecurrence(obj.recurrence),
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

// CHANTIER "Capture bloquante — diagnostic parseError" (2026-09-18), priorité 3 : toute sortie
// `ok: false` d'ICI (validateLlmOutput) correspond par construction à un JSON structurellement
// reçu mais rejeté par CETTE validation stricte — jamais un échec réseau/HTTP du LLM (ça, c'est
// LlmExtractionError, voir providers/llm/types.ts, intercepté séparément par index.ts). D'où la
// catégorie FIXE `'validation'`, jamais dérivée dynamiquement ici.
export type ValidationOutcome =
  | { ok: true; pensees: ExtractedPensee[] }
  | { ok: false; parseError: string; category: CaptureParseErrorCategory };

/**
 * Point d'entrée : valide la sortie BRUTE (non fiable) du LLM. Ne lève jamais — retourne un
 * résultat explicite pour que l'appelant (index.ts) puisse toujours répondre `200` avec un repli
 * sur le transcript brut plutôt qu'une erreur dure (voir CaptureContract.parseError).
 */
export function validateLlmOutput(raw: unknown): ValidationOutcome {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, parseError: 'Réponse du LLM non exploitable (pas un objet JSON)', category: 'validation' };
  }
  const penseesRaw = (raw as Record<string, unknown>).pensees;
  if (!Array.isArray(penseesRaw)) {
    return { ok: false, parseError: 'Réponse du LLM non exploitable (champ "pensees" absent ou non-tableau)', category: 'validation' };
  }
  const pensees = penseesRaw.map(normalizeExtractedPensee).filter((p): p is ExtractedPensee => p !== null);
  if (pensees.length === 0) {
    return {
      ok: false,
      parseError: 'Aucune pensée exploitable dans la réponse du LLM (texte manquant sur toutes les entrées)',
      category: 'validation',
    };
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
    return { transcript, meta, pensees: outcome.pensees, parseError: null, parseErrorCategory: null };
  }
  return { transcript, meta, pensees: [], parseError: outcome.parseError, parseErrorCategory: outcome.category };
}
