// CHANTIER RAPPELS RÉCURRENTS — incrément 1 (2026-09-18). Module 100% PUR : aucun import
// react-native/expo/AsyncStorage/réseau, testable sous `npx tsx` comme calendar.ts/messageSuggestion.ts.
// Ne touche à AUCUN écran, AUCUNE notification, AUCUN contrat Capture — uniquement le calcul.
//
// Principe fondamental : `reminderAt` (Pensee, types.ts) reste la date/heure ABSOLUE de la PREMIÈRE
// occurrence, inchangé. Ce module calcule les occurrences SUIVANTES à partir de cet ancrage + d'une
// `ReminderRecurrence` — jamais une seconde source de vérité pour l'heure (toujours celle de
// `reminderAt`, jamais redemandée/recalculée par occurrence).
//
// Toutes les comparaisons de jours sont faites en composants LOCAUX (année/mois/jour via les
// constructeurs `Date` locaux et `addDays`/`isoOf` de dateLocal.ts) — jamais `toISOString().slice(...)`
// ni `getUTCFullYear`/`getUTCMonth`/`getUTCDate`, qui décaleraient le jour affiché selon le fuseau de
// l'utilisateur (même discipline que calendar.ts et reminderDate.ts, déjà en place dans ce projet).
import { ReminderRecurrence, ReminderRecurrenceFrequency } from './types';
// CHANTIER "persistance reminderRecurrence" (2026-09-18) — importe désormais `dateLocal.ts` (module
// bas niveau) plutôt que `calendar.ts`, pour permettre à `calendar.ts` d'importer en retour
// `normalizeReminderRecurrence` (ce fichier) sans créer de dépendance circulaire. Mêmes primitives,
// même implémentation — calendar.ts les réexporte toujours telles quelles.
import { addDays, isoOf } from './dateLocal';

const VALID_FREQUENCIES: readonly ReminderRecurrenceFrequency[] = ['daily', 'weekly'];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour calendrier LOCAL — jamais une chaîne ISO, jamais UTC. `month` est 0-indexé (convention
 *  `Date`/`LocalDate` déjà utilisée par captureReview.ts et PenseeDetailScreen.tsx). */
export type LocalDateParts = { year: number; month: number; day: number };

/** Même validation calendaire que capture/validate.ts (rejette "2026-02-30"), mais en LOCAL plutôt
 *  qu'en UTC : ce module raisonne exclusivement sur des jours locaux, jamais un instant serveur. */
function isValidLocalCalendarDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Validation/normalisation STRICTE d'une règle — jamais un cast direct d'une valeur non fiable
 * (entrée utilisateur future, JSON désérialisé, contrat Capture à venir). `null` si la règle est
 * invalide à N'IMPORTE quel titre — jamais une correction silencieuse d'une valeur incohérente (même
 * principe que capture/validate.ts : une donnée douteuse est écartée, jamais devinée).
 *
 * Règles de validation :
 * - `frequency` doit être 'daily' ou 'weekly', rien d'autre.
 * - `daysOfWeek` (si fourni) doit être un tableau d'entiers 0-6 — dédupliqué et trié par ordre
 *   croissant dans le résultat. Pour 'daily', toujours normalisé à `[]` (canonique, non exploité —
 *   voir ReminderRecurrence, types.ts). Pour 'weekly', DOIT contenir au moins un jour (une règle
 *   hebdomadaire sans aucun jour n'a pas de sens, jamais silencieusement acceptée comme "jamais").
 * - `occurrenceCount` (si fourni, non `null`) doit être un entier >= 1.
 * - `untilDate` (si fourni, non `null`) doit être une date calendaire locale réellement valide,
 *   au format 'YYYY-MM-DD'.
 * - `occurrenceCount` et `untilDate` peuvent coexister : voir computeNextReminderOccurrences, qui
 *   s'arrête à la première des deux bornes atteintes (décision volontaire de ce module — l'UX de
 *   review future, hors périmètre ici, pourra choisir de n'en exposer qu'une seule à la fois).
 */
export function normalizeReminderRecurrence(raw: unknown): ReminderRecurrence | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (!VALID_FREQUENCIES.includes(obj.frequency as ReminderRecurrenceFrequency)) return null;
  const frequency = obj.frequency as ReminderRecurrenceFrequency;

  const rawDays = obj.daysOfWeek;
  if (rawDays !== undefined && rawDays !== null && !Array.isArray(rawDays)) return null;
  const daysArray: unknown[] = Array.isArray(rawDays) ? rawDays : [];
  if (!daysArray.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) return null;
  const daysOfWeek = frequency === 'daily' ? [] : Array.from(new Set(daysArray as number[])).sort((a, b) => a - b);
  if (frequency === 'weekly' && daysOfWeek.length === 0) return null;

  let occurrenceCount: number | null = null;
  if (obj.occurrenceCount !== undefined && obj.occurrenceCount !== null) {
    const oc = obj.occurrenceCount;
    if (!Number.isInteger(oc) || (oc as number) < 1) return null;
    occurrenceCount = oc as number;
  }

  let untilDate: string | null = null;
  if (obj.untilDate !== undefined && obj.untilDate !== null) {
    if (typeof obj.untilDate !== 'string' || !isValidLocalCalendarDateString(obj.untilDate)) return null;
    untilDate = obj.untilDate;
  }

  return { frequency, daysOfWeek, occurrenceCount, untilDate };
}

/**
 * Une date locale correspond-elle au MOTIF de la règle (jour de la semaine) ? Ne tient PAS compte
 * de `occurrenceCount`/`untilDate` ici — cette fonction répond uniquement à "ce jour-ci est-il de la
 * bonne nature", les bornes sont appliquées séparément par computeNextReminderOccurrences (deux
 * responsabilités volontairement séparées, chacune testable isolément).
 */
export function reminderRecurrenceMatchesDate(rule: ReminderRecurrence, date: LocalDateParts): boolean {
  if (rule.frequency === 'daily') return true;
  const weekday = new Date(date.year, date.month, date.day).getDay();
  return rule.daysOfWeek.includes(weekday);
}

/** Aucune règle réelle ('daily' au minimum, 'weekly' avec >=1 jour) ne peut produire d'occurrence
 *  moins d'une fois par semaine — 100 occurrences couvre donc largement toute utilisation raisonnable
 *  d'une série "sans fin" (ni occurrenceCount ni untilDate) sans jamais boucler indéfiniment. */
const DEFAULT_UNBOUNDED_LIMIT = 100;
/** Garde-fou DUR (~10 ans de scan jour par jour) contre toute boucle pathologique — ne devrait
 *  jamais être atteint en pratique compte tenu de DEFAULT_UNBOUNDED_LIMIT, mais protège quand même
 *  contre un appelant qui passerait un `limit` déraisonnablement grand. */
const MAX_DAY_SCAN = 3700;

/**
 * Calcule les occurrences d'une règle à partir de `reminderAt` (première occurrence — son
 * année/mois/jour LOCAUX servent de point de départ du balayage ; son heure/minute/seconde LOCALES
 * sont réutilisées TELLES QUELLES pour chaque occurrence, jamais redemandées). Balaie jour par jour
 * en avant (`addDays`, local — jamais UTC), s'arrête à la première borne atteinte parmi :
 * `rule.occurrenceCount`, `rule.untilDate` (inclusif), ou `options.limit` (défaut
 * `DEFAULT_UNBOUNDED_LIMIT` pour une règle sans aucune des deux bornes ci-dessus).
 *
 * `options.from` (optionnel) filtre le résultat aux occurrences >= cet instant SANS renuméroter la
 * série : `occurrenceCount` reste calculé depuis la vraie première occurrence, pas depuis `from` —
 * une série "5 occurrences" appelée avec `from` après la 2e n'en renvoie que 3, jamais 5 nouvelles.
 *
 * Si le premier jour balayé (celui de `reminderAt`) ne correspond pas au motif de la règle (ex. une
 * règle "chaque lundi" ancrée par erreur sur un mardi), le balayage avance simplement jusqu'au
 * premier jour qui correspond — dégradation défensive, jamais un tableau vide/une exception pour ce
 * cas (par construction, l'appelant est censé ancrer `reminderAt` sur un jour valide pour sa règle,
 * mais ce module ne le suppose jamais aveuglément).
 */
export function computeNextReminderOccurrences(
  rule: ReminderRecurrence,
  reminderAt: Date,
  options: { from?: Date; limit?: number } = {},
): Date[] {
  const limit = options.limit ?? DEFAULT_UNBOUNDED_LIMIT;

  const hour = reminderAt.getHours();
  const minute = reminderAt.getMinutes();
  const second = reminderAt.getSeconds();

  const occurrences: Date[] = [];
  let cursor = new Date(reminderAt.getFullYear(), reminderAt.getMonth(), reminderAt.getDate());
  let matchedCount = 0;
  let scanned = 0;

  while (scanned < MAX_DAY_SCAN && occurrences.length < limit) {
    scanned += 1;
    const parts: LocalDateParts = { year: cursor.getFullYear(), month: cursor.getMonth(), day: cursor.getDate() };

    if (rule.untilDate) {
      const cursorIso = isoOf(parts.year, parts.month, parts.day);
      if (cursorIso > rule.untilDate) break; // comparaison lexicographique 'YYYY-MM-DD' = comparaison calendaire correcte
    }

    if (reminderRecurrenceMatchesDate(rule, parts)) {
      matchedCount += 1;
      occurrences.push(new Date(parts.year, parts.month, parts.day, hour, minute, second, 0));
      if (rule.occurrenceCount !== null && matchedCount >= rule.occurrenceCount) break;
    }

    cursor = addDays(cursor, 1);
  }

  if (!options.from) return occurrences;
  const fromMs = options.from.getTime();
  return occurrences.filter((o) => o.getTime() >= fromMs);
}

/** Heure/minute LOCALES (jamais UTC) — même convention que `LocalDateParts` ci-dessus. */
export type LocalTimeParts = { hour: number; minute: number };

/**
 * CHANTIER SEEDS TEMPORELS 2 (2026-09-18) — détermine la PROCHAINE occurrence compatible avec `rule`
 * à partir de `now` (jour civil local) et `time` (heure/minute LOCALES du rappel — connue ou de
 * fallback, choisie par l'APPELANT : ce module ne décide jamais lui-même d'une heure, il ne fait que
 * positionner le bon JOUR une fois l'heure fournie). Réutilise EXACTEMENT `reminderRecurrenceMatchesDate`
 * (même définition du motif que `computeNextReminderOccurrences` ci-dessus, jamais une deuxième
 * logique de calendrier indépendante) et `addDays` (jamais un décalage UTC).
 *
 * Règle de frontière (voir consigne du chantier) : le jour COURANT n'est proposé QUE si `time` n'est
 * pas encore atteinte à l'instant `now` — comparaison STRICTE (`>`), jamais `>=` : à exactement
 * l'heure du rappel, l'occurrence du jour est considérée déjà PASSÉE (jamais un rappel proposé à une
 * heure déjà atteinte). Balaie au maximum 8 jours (day0 inclus) — couvre largement un cycle
 * hebdomadaire complet ; toute règle acceptée par `normalizeReminderRecurrence` ('daily', ou 'weekly'
 * avec au moins un jour) correspond forcément à au moins un jour sur 7, le fallback défensif en fin
 * de boucle ne devrait donc jamais être atteint en pratique.
 *
 * PURE — ne lit ni n'écrit aucun état applicatif, `now`/`time` sont toujours fournis par l'appelant
 * (jamais `new Date()` interne ici, pour rester testable avec un `now` injecté/fixe).
 */
export function nextReminderRecurrenceSeedDate(rule: ReminderRecurrence, time: LocalTimeParts, now: Date): LocalDateParts {
  const nowMs = now.getTime();
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const MAX_SCAN_DAYS = 8;

  for (let i = 0; i < MAX_SCAN_DAYS; i++) {
    const parts: LocalDateParts = { year: cursor.getFullYear(), month: cursor.getMonth(), day: cursor.getDate() };
    if (reminderRecurrenceMatchesDate(rule, parts)) {
      const candidate = new Date(parts.year, parts.month, parts.day, time.hour, time.minute, 0, 0);
      if (candidate.getTime() > nowMs) return parts;
    }
    cursor = addDays(cursor, 1);
  }

  // Défensif seulement (voir docstring) — dernier jour balayé, jamais atteint par une règle valide.
  return { year: cursor.getFullYear(), month: cursor.getMonth(), day: cursor.getDate() };
}
