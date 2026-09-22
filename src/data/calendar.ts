import { CalEvent, Contact, FamilyRole, Pensee } from './types';
// CHANTIER "persistance reminderRecurrence" (2026-09-18) — `addDays`/`isoOf` extraites vers
// `dateLocal.ts` (module bas niveau, sans dépendance vers ce fichier ni vers reminderRecurrence.ts)
// pour permettre à `normalizePensee` (plus bas) d'importer `normalizeReminderRecurrence` sans créer
// de cycle (reminderRecurrence.ts importe aussi `dateLocal.ts`, jamais `calendar.ts`). Réexportées
// ici TELLES QUELLES (même implémentation, aucune reformulation) pour que les nombreux consommateurs
// existants qui les importent depuis `./calendar` n'aient rien à changer.
import { addDays, isoOf, pad2 } from './dateLocal';
import { nextPenseeReminderOccurrence, normalizeReminderRecurrence } from './reminderRecurrence';
export { addDays, isoOf } from './dateLocal';

export const monthAbbrev = ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
export const monthFull = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
export const weekdayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const weekdayFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const dIso = (d: Date) => isoOf(d.getFullYear(), d.getMonth(), d.getDate());
/** 'YYYY-MM-DD' → "12 sept." */
export function frDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${monthAbbrev[parseInt(m, 10) - 1]}`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
export function mondayOffset(y: number, m: number) {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}
export function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function isPastDate(y: number, m: number, d: number, today: Date) {
  return new Date(y, m, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}
export function mondayOf(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Algorithme de Gauss/Meeus pour le dimanche de Pâques — sert de base aux jours fériés mobiles. */
export function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function nthSunday(year: number, month: number, n: number) {
  const offset = (7 - new Date(year, month, 1).getDay()) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
function lastSunday(year: number, month: number) {
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - last.getDay());
}

const holidaysCache: Record<number, Record<string, string>> = {};
export function frenchHolidays(year: number) {
  if (holidaysCache[year]) return holidaysCache[year];
  const easter = easterDate(year);
  const h: Record<string, string> = {};
  h[isoOf(year, 0, 1)] = "Jour de l'An";
  h[dIso(addDays(easter, 1))] = 'Lundi de Pâques';
  h[isoOf(year, 4, 1)] = 'Fête du Travail';
  h[isoOf(year, 4, 8)] = 'Victoire 1945';
  h[dIso(addDays(easter, 39))] = 'Ascension';
  h[dIso(addDays(easter, 50))] = 'Lundi de Pentecôte';
  h[isoOf(year, 6, 14)] = 'Fête nationale';
  h[isoOf(year, 7, 15)] = 'Assomption';
  h[isoOf(year, 10, 1)] = 'Toussaint';
  h[isoOf(year, 10, 11)] = 'Armistice 1918';
  h[isoOf(year, 11, 25)] = 'Noël';
  holidaysCache[year] = h;
  return h;
}

const familyCache: Record<number, Record<string, string>> = {};
export function familyFetes(year: number) {
  if (familyCache[year]) return familyCache[year];
  let mere = lastSunday(year, 4);
  const pentecote = addDays(easterDate(year), 50);
  if (sameDate(mere, pentecote)) mere = nthSunday(year, 5, 1); // report au 1er dimanche de juin
  const f: Record<string, string> = {};
  f[dIso(nthSunday(year, 2, 1))] = 'Fête des Grands-mères';
  f[dIso(mere)] = 'Fête des Mères';
  f[dIso(nthSunday(year, 5, 3))] = 'Fête des Pères';
  f[dIso(nthSunday(year, 9, 1))] = 'Fête des Grands-pères';
  familyCache[year] = f;
  return f;
}

/** Fait le lien entre le libellé d'une fête calendaire et le "Lien précis" attendu sur une fiche. */
export const FAMILY_FETE_ROLE: Record<string, FamilyRole> = {
  'Fête des Mères': 'Mère',
  'Fête des Pères': 'Père',
  'Fête des Grands-mères': 'Grand-mère',
  'Fête des Grands-pères': 'Grand-père',
};

/** Table simplifiée du calendrier des prénoms (non exhaustive) — juste pour illustrer le bonus "fête du prénom". */
export const namedayTable: Record<string, string> = {
  lea: '03-22', odile: '12-13', sofia: '05-25', sophie: '05-25',
  marie: '08-15', jean: '12-27', pierre: '06-29', paul: '06-29',
  nicolas: '12-06', anne: '07-26', francois: '10-04', marc: '04-25',
  claire: '08-11', thomas: '07-03',
};

export function normalizeName(s: string) {
  const decomposed = (s || '').normalize('NFD');
  let out = '';
  for (let i = 0; i < decomposed.length; i++) {
    const code = decomposed.charCodeAt(i);
    if (code < 0x300 || code > 0x36f) out += decomposed[i];
  }
  return out.toLowerCase().trim();
}

export function contactName(contacts: Contact[], id: string) {
  const c = contacts.find((x) => x.id === id);
  return c ? `${c.prenom} ${c.nom}`.trim() : '';
}

/** Formate un délai personnalisé (en minutes) en "X sem Y j Z h W min avant" (ignore les unités nulles). */
export function formatCustomOffset(totalMinutes: number): string {
  const weeks = Math.floor(totalMinutes / (7 * 24 * 60));
  const days = Math.floor((totalMinutes % (7 * 24 * 60)) / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (weeks) parts.push(`${weeks} sem`);
  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  if (minutes || parts.length === 0) parts.push(`${minutes} min`);
  return `${parts.join(' ')} avant`;
}

/** Nombre de jours avant la prochaine occurrence (anniversaire) d'une date 'YYYY-MM-DD'. 0 = aujourd'hui. */
export function daysUntilNext(dateStr: string, today: Date) {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next < todayMid) next = new Date(today.getFullYear() + 1, month, day);
  return Math.round((next.getTime() - todayMid.getTime()) / 86400000);
}

/**
 * Libellé lisible du prochain anniversaire, sans jamais montrer l'année de naissance — "Anniversaire
 * aujourd'hui"/"demain", sinon "Anniversaire dans N jours · 3 nov.". Réutilise daysUntilNext/frDate
 * telles quelles (même définition d'occurrence annuelle partout) plutôt que de la recalculer —
 * utilisé par ContactsScreen et FicheScreen (voir CHANTIER PROCHES + FICHE V1).
 */
export function birthdayCountdownLabel(dateStr: string, today: Date): string {
  const days = daysUntilNext(dateStr, today);
  if (days === 0) return "Anniversaire aujourd'hui";
  if (days === 1) return 'Anniversaire demain';
  return `Anniversaire dans ${days} jours · ${frDate(dateStr)}`;
}

/** Année (calendaire) de la prochaine occurrence — ou celle d'aujourd'hui — d'une date récurrente
 *  'YYYY-MM-DD' (seuls mois/jour comptent). Sert à rattacher un état ponctuel (ex. "cadeau prévu")
 *  à UNE édition annuelle précise plutôt qu'à la date de naissance elle-même, pour qu'il redevienne
 *  automatiquement faux dès que l'occurrence suivante commence — sans job de réinitialisation. */
export function occurrenceYear(dateStr: string, today: Date): number {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisYear = new Date(today.getFullYear(), month, day);
  return thisYear < todayMid ? today.getFullYear() + 1 : today.getFullYear();
}

/** Âge que la personne aura à sa prochaine occurrence d'anniversaire (déduit de l'année de `dateStr`). */
export function ageTurning(dateStr: string, today: Date): number {
  const parts = dateStr.split('-');
  const birthYear = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next < todayMid) next = new Date(today.getFullYear() + 1, month, day);
  return next.getFullYear() - birthYear;
}

/**
 * Date/heure exacte de la prochaine occurrence — ou celle d'aujourd'hui — d'une date récurrente
 * 'YYYY-MM-DD' (seuls mois/jour comptent, comme daysUntilNext/ageTurning/occurrenceYear ci-dessus :
 * même définition d'une "occurrence annuelle", réutilisée telle quelle par notifications.ts au lieu
 * d'être recodée séparément). `hour`/`minute` positionnent l'heure locale du déclenchement.
 * Pour obtenir l'occurrence SUIVANTE (celle d'après), rappeler cette fonction avec `addDays(résultat, 1)`
 * comme `today` — pas besoin d'une fonction dédiée.
 */
export function nextOccurrenceDate(dateStr: string, today: Date, hour = 9, minute = 0): Date {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let d = new Date(today.getFullYear(), month, day, hour, minute, 0);
  if (d < todayMid) d = new Date(today.getFullYear() + 1, month, day, hour, minute, 0);
  return d;
}

/**
 * Prochaine date (>= today) où la fête familiale `label` (ex. 'Fête des Mères') tombe — les fêtes
 * familiales ne sont pas de simples récurrences MM-DD (Pâques fait varier certaines d'une année sur
 * l'autre), d'où une recherche jour par jour plutôt qu'un calcul direct. `maxDaysAhead` borne la
 * recherche (défaut ~13 mois, large marge pour toujours trouver au moins une occurrence).
 */
export function nextFamilyFeteDate(label: string, today: Date, maxDaysAhead = 400): Date | null {
  for (let offset = 0; offset <= maxDaysAhead; offset++) {
    const d = addDays(today, offset);
    if (familyFetes(d.getFullYear())[dIso(d)] === label) return d;
  }
  return null;
}

export type PeriodPensee = Pensee & { date: string; endDate: string };

/** Pensées de période (surlignage) qui touchent au moins un jour du mois affiché. */
export function periodsInMonth(pensees: Pensee[], year: number, month: number): PeriodPensee[] {
  const monthStart = isoOf(year, month, 1);
  const monthEnd = isoOf(year, month, daysInMonth(year, month));
  return pensees.filter(
    (p): p is PeriodPensee => Boolean(p.date) && Boolean(p.endDate) && p.date! <= monthEnd && p.endDate! >= monthStart,
  );
}

/** Écart en jours (calendaires, pas d'heures) entre une date ISO 'YYYY-MM-DD' quelconque et
 *  aujourd'hui — négatif si `iso` est dans le passé. Générique (contrairement à daysUntilNext, qui
 *  ne connaît que des dates récurrentes MM-DD) : utilisé pour les pensées, qui ne se répètent pas. */
export function daysBetween(iso: string, today: Date): number {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const target = new Date(y, m - 1, d);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - todayMid.getTime()) / 86400000);
}

/**
 * Ancre calendrier effective d'une pensée (CHANTIER PENSÉES V2, étendu au fallback reminderAt-only
 * — voir "corriger l'affichage Calendrier") : la période/le jour explicite (`date`/`endDate`) si
 * présent — toujours prioritaire, `reminderAt` ne fait alors que porter l'heure de notification,
 * jamais déplacer l'ancre — sinon le jour LOCAL du rappel s'il y en a un (`reminderAt`), sinon
 * `null` — une pensée purement mémorisée (aucun jour précis, aucun rappel) n'a AUCUNE ancre et
 * n'apparaît donc dans aucune vue temporelle (Calendrier/Accueil), seulement dans l'onglet Pensées.
 * Centralisé ici pour qu'Accueil/Calendrier/Pensées appliquent tous la même règle plutôt que de la
 * recoder séparément — Calendrier (getDayEvents ci-dessous) est passé par ce même helper.
 *
 * BUG CORRIGÉ : `reminderAt` est stocké en ISO absolu (`.toISOString()`, donc UTC) — en prendre les
 * 10 premiers caractères bruts donnait la date UTC, pas la date LOCALE de l'utilisateur, et pouvait
 * décaler l'ancre d'un jour (ex. un rappel local à 00h30 en UTC+1/+2 tombe la veille en UTC). On
 * passe donc par `new Date(...)` puis `dIso`, qui lit les composants LOCAUX (getFullYear/getMonth/
 * getDate) — même discipline que le reste de l'app pour un instant absolu saisi par l'utilisateur.
 */
export function penseeAnchor(p: Pensee): { date: string; endDate: string | null } | null {
  if (p.date) return { date: p.date, endDate: p.endDate ?? null };
  if (p.reminderAt) return { date: dIso(new Date(p.reminderAt)), endDate: null };
  return null;
}

/** Une pensée (ponctuelle ou de période) est-elle "active" un jour ISO donné ? Même définition
 *  utilisée par l'Accueil (homeAttention.ts) et l'écran Pensées — centralisée ici pour ne pas être
 *  recodée séparément à chaque endroit qui doit le savoir. Toujours `false` pour une pensée sans
 *  ancre (voir penseeAnchor) : elle n'est "active" aucun jour en particulier. */
export function isPenseeActiveOn(p: Pensee, iso: string): boolean {
  const anchor = penseeAnchor(p);
  if (!anchor) return false;
  return anchor.endDate ? anchor.date <= iso && iso <= anchor.endDate : anchor.date === iso;
}

/** Une pensée (ponctuelle ou de période) est-elle définitivement terminée à l'instant `now` ?
 *  Vrai pour une pensée ponctuelle déjà passée, ou une période dont `endDate` est révolue. Une
 *  pensée SANS ancre (voir penseeAnchor) n'est JAMAIS "terminée" — elle reste un élément mémorisé
 *  indéfiniment, jamais reléguée en "passée" simplement parce qu'elle vieillit (CHANTIER PENSÉES V2).
 *
 *  CHANTIER "P0 Récurrence Phase 1" (2026-09-21) — NE modifie PAS la sémantique de `penseeAnchor`
 *  (toujours l'ancre événementielle brute, `date`/`endDate` ou jour du `reminderAt` initial) : ce
 *  BUG était que cette fonction s'arrêtait là, ignorant `reminderRecurrence`. Un rappel récurrent
 *  garde la pensée "non terminée" tant qu'il lui reste une occurrence future (voir
 *  `nextPenseeReminderOccurrence`, reminderRecurrence.ts) — même quand l'ancre BRUTE (première
 *  occurrence historique) est déjà révolue. Une pensée SANS récurrence (ou dont la récurrence est
 *  épuisée) garde EXACTEMENT le comportement d'avant (`nextPenseeReminderOccurrence` retourne alors
 *  `null`, donc aucun changement de résultat pour ce cas).
 *  Signature changée de `todayIso: string` à `now: Date` (les deux appelants, homeAttention.ts et
 *  penseesView.ts, avaient déjà un `Date` sous la main — aucun autre appelant dans le code, voir
 *  audit de chantier).
 */
export function isPenseeEnded(p: Pensee, now: Date): boolean {
  const anchor = penseeAnchor(p);
  if (!anchor) return false;
  const todayIso = dIso(now);
  const rawEnded = anchor.endDate ? anchor.endDate < todayIso : anchor.date < todayIso;
  if (!rawEnded) return false;
  return nextPenseeReminderOccurrence(p, now) === null;
}

/**
 * CHANTIER "P0 Récurrence Phase 1" (2026-09-21) — jour ISO EFFECTIF à utiliser pour les calculs
 * temporels d'AFFICHAGE (tri/fenêtre Accueil, "il y a/dans N jours", référence du badge "Rappel") —
 * reste `anchor.date` (l'ancre événementielle brute, `penseeAnchor` INCHANGÉ) tant qu'elle n'est pas
 * révolue. Si elle l'est ET qu'un rappel récurrent a encore une occurrence future, cette occurrence
 * devient le jour effectif — jamais l'inverse : une ancre encore valide n'est JAMAIS recouverte par
 * une occurrence de rappel (voir consigne §6 — ne pas mélanger date d'événement et calendrier de
 * notification au-delà du strict nécessaire pour corriger le bug). Le Calendrier (getDayEvents plus
 * bas) continue d'utiliser `penseeAnchor`/`p.date` directement, jamais cette fonction. */
export function effectivePenseeAnchorDate(p: Pensee, now: Date): string | null {
  const anchor = penseeAnchor(p);
  if (!anchor) return null;
  const todayIso = dIso(now);
  const rawEnded = anchor.endDate ? anchor.endDate < todayIso : anchor.date < todayIso;
  if (!rawEnded) return anchor.date;
  const next = nextPenseeReminderOccurrence(p, now);
  return next ? dIso(next) : anchor.date;
}

/** Sous-titre lisible d'une pensée : "Du X au Y" pour une période, la date seule pour une pensée
 *  ancrée à un jour, ou "Notée le J" (date de création) pour une pensée purement mémorisée sans
 *  aucune ancre — toujours avec le nom du proche lié en suffixe s'il y en a un. Même formatage
 *  utilisé par l'Accueil et l'écran Pensées, centralisé ici pour n'exister qu'à un seul endroit. */
export function penseeSubtitle(p: Pensee, contacts: Contact[]): string {
  const linkedName = p.contactId ? contactName(contacts, p.contactId) : '';
  const anchor = penseeAnchor(p);
  if (anchor?.endDate) {
    return `Du ${frDate(anchor.date)} au ${frDate(anchor.endDate)}${linkedName ? ` · ${linkedName}` : ''}`;
  }
  if (anchor) {
    return linkedName ? `${frDate(anchor.date)} · ${linkedName}` : frDate(anchor.date);
  }
  const created = frDate(p.createdAt.slice(0, 10));
  return linkedName ? `Notée le ${created} · ${linkedName}` : `Notée le ${created}`;
}

/** Libellé court d'un rappel absolu (ex. "9h00", ou "3 sept. à 9h00" si son jour diffère de celui
 *  passé en référence — typiquement le jour de l'événement affiché à l'écran). */
export function reminderAtLabel(reminderAt: string, referenceDayIso?: string): string {
  const d = new Date(reminderAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = mm === '00' ? `${d.getHours()}h` : `${hh}h${mm}`;
  const reminderDayIso = isoOf(d.getFullYear(), d.getMonth(), d.getDate());
  if (referenceDayIso && reminderDayIso !== referenceDayIso) {
    return `${frDate(reminderDayIso)} à ${time}`;
  }
  return time;
}

/**
 * Soustrait `offsetMinutes` d'une date via les champs locaux (heures/minutes), pas une simple
 * différence de millisecondes — un décalage fixe en ms ignore un changement d'heure (DST) tombant
 * dans l'intervalle et peut décaler le résultat d'une heure, voire faire déborder sur le mauvais
 * jour. `setMinutes` accepte nativement des valeurs hors 0-59 et recalcule la date résultante en
 * tenant compte du fuseau/DST en vigueur POUR CETTE DATE. Partagé entre la saisie d'un rappel
 * personnalisé (CalendarScreen.tsx) et la normalisation d'anciennes pensées (normalizePensee
 * ci-dessous), d'où sa présence ici plutôt que dans notificationPlanning.ts.
 */
export function subtractMinutesLocal(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() - minutes);
  return result;
}

/**
 * Reconstruit un `reminderAt` absolu à partir de l'ancien couple remind/customOffsetMinutes d'une
 * pensée créée avant CHANTIER PENSÉES V2 — même calcul que faisait autrefois
 * notificationPlanning.ts au moment de programmer la notification, mais fait une seule fois ici, à
 * la lecture, pour que le reste de l'app ne connaisse plus qu'un rappel absolu et unique.
 */
function legacyReminderAt(raw: { date?: string | null; remind?: string; customOffsetMinutes?: number | null }): string | null {
  if (!raw.date || !raw.remind) return null;
  const parts = raw.date.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (raw.remind === 'custom') {
    if (raw.customOffsetMinutes == null) return null;
    const endOfDay = new Date(y, m, d, 23, 59, 59);
    return subtractMinutesLocal(endOfDay, raw.customOffsetMinutes).toISOString();
  }
  const days = parseInt(raw.remind, 10);
  if (Number.isNaN(days)) return null;
  const target = new Date(y, m, d, 9, 0, 0);
  target.setDate(target.getDate() - days);
  return target.toISOString();
}

// CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18). Deux fonctions PURES et testables (aucune
// dépendance react-native/Supabase) :
const EVENT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Normalisation canonique de `Pensee.eventTime` — format strict "HH:mm", jamais une autre valeur
 *  "corrigée" silencieusement. Réutilisée pour une pensée chargée du cache local (AsyncStorage, voir
 *  normalizePensee ci-dessous) ET pour une ligne Supabase déjà adaptée par `postgresTimeToEventTime`
 *  (voir supabaseRepo.ts) — même discipline que `normalizeTimeString` côté backend Capture
 *  (validate.ts) : invalide/absent → `null`, jamais inventé. */
export function normalizeEventTime(value: unknown): string | null {
  return typeof value === 'string' && EVENT_TIME_PATTERN.test(value) ? value : null;
}

/** Adapte le format renvoyé par PostgREST pour une colonne Postgres `time` ("HH:mm:ss", parfois avec
 *  microsecondes/fuseau selon la version) vers le format canonique client "HH:mm" — PURE, aucune
 *  dépendance réseau. `null`/`undefined`/format inattendu → `null`, jamais une heure tronquée au
 *  hasard ni inventée. Volontairement séparée de `normalizeEventTime` (qui, elle, REJETTE
 *  "20:30:00" — un format déjà canonique client ne devrait jamais avoir besoin d'être tronqué) : ce
 *  n'est qu'une étape d'ADAPTATION de format avant la validation stricte, pas une validation
 *  elle-même — voir rowToPensee, supabaseRepo.ts, qui compose les deux. */
export function postgresTimeToEventTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * Comble les champs absents sur une pensée créée avant CHANTIER PENSÉES V2 (ancien cache
 * AsyncStorage, ou ligne Supabase pas encore migrée) — SEUL endroit du code qui doit connaître
 * l'ancienne forme (`date` obligatoire, `remind`/`customOffsetMinutes`), même principe que
 * normalizeQuizProfile (quiz.ts)/normalizeRelation (FicheScreen.tsx). `raw` est volontairement typé
 * `any` : il peut porter des champs qui n'existent plus dans `Pensee` (remind, customOffsetMinutes).
 */
export function normalizePensee(raw: any): Pensee {
  const reminderAt: string | null =
    raw.reminderAt !== undefined ? raw.reminderAt : legacyReminderAt(raw);
  return {
    id: raw.id,
    texte: raw.texte,
    contactId: raw.contactId ?? null,
    createdAt: raw.createdAt ?? (raw.date ? `${raw.date}T00:00:00.000Z` : new Date(0).toISOString()),
    date: raw.date ?? null,
    endDate: raw.endDate ?? null,
    reminderAt,
    // CHANTIER PENSÉES V3 — jamais inventé pour une pensée plus ancienne qui ne connaît pas encore
    // ce champ : absent/`undefined` normalisé à `false` (comportement identique à avant son ajout).
    pinned: raw.pinned ?? false,
    // CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18) : absent/legacy/invalide → null, jamais
    // inventé ni "corrigé" silencieusement (voir normalizeEventTime ci-dessous).
    eventTime: normalizeEventTime(raw.eventTime),
    // CHANTIER "persistance reminderRecurrence" (2026-09-18) — CORRECTIF : `normalizePensee` devient
    // le point UNIQUE de normalisation d'une pensée, y compris pour ce champ (jusqu'ici silencieusement
    // perdu à chaque lecture du cache local, voir l'audit précédent). Réutilise STRICTEMENT
    // `normalizeReminderRecurrence` (reminderRecurrence.ts, incrément 1) — aucune duplication de sa
    // validation "tout ou rien" (une règle incohérente à N'IMPORTE quel titre → `null` en bloc, jamais
    // une réparation partielle). `undefined`/`null`/JSON invalide/fréquence invalide/daysOfWeek
    // invalides/occurrenceCount invalide/untilDate invalide sont TOUS déjà traités par cette fonction
    // et retombent uniformément sur `null` — même comportement legacy qu'avant l'ajout de ce champ.
    reminderRecurrence: normalizeReminderRecurrence(raw.reminderRecurrence),
  };
}

export function getDayEvents(
  year: number,
  month: number,
  day: number,
  contacts: Contact[],
  pensees: Pensee[],
  today: Date,
  userName?: string | null,
): CalEvent[] {
  const iso = isoOf(year, month, day);
  const list: CalEvent[] = [];

  contacts.forEach((c) => {
    if (!c.date) return;
    const parts = c.date.split('-');
    if (parseInt(parts[1], 10) - 1 === month && parseInt(parts[2], 10) === day) {
      list.push({
        type: 'anniv',
        label: `${c.prenom} ${c.nom}`.trim(),
        kind: sameDate(new Date(year, month, day), today) ? "Anniversaire · aujourd'hui 🎂" : 'Anniversaire',
        contactId: c.id,
      });
    }
    const mmdd = namedayTable[normalizeName(c.prenom)];
    if (mmdd === `${pad2(month + 1)}-${pad2(day)}`) {
      list.push({ type: 'fete', label: `${c.prenom} — fête de prénom`, kind: 'Bonus 🎉 · petite attention possible', contactId: c.id });
    }
  });

  if (userName) {
    const userMmdd = namedayTable[normalizeName(userName)];
    if (userMmdd === `${pad2(month + 1)}-${pad2(day)}`) {
      list.push({ type: 'fete', label: 'Ta fête à toi 🎉', kind: `Bonus · fête de ${userName}`, contactId: null });
    }
  }

  pensees.forEach((p) => {
    // Ancre calendrier centralisée (voir penseeAnchor) — inclut désormais le fallback reminderAt
    // (date locale) quand `date` est absente. Une pensée sans aucune ancre n'apparaît jamais dans
    // le Calendrier jour par jour — seulement dans l'onglet Pensées.
    const anchor = penseeAnchor(p);
    if (!anchor) return;
    const isPeriod = Boolean(anchor.endDate);
    const inRange = isPeriod ? iso >= anchor.date && iso <= anchor.endDate! : anchor.date === iso;
    if (inRange) {
      const extra = p.contactId ? ` · liée à ${contactName(contacts, p.contactId)}` : '';
      const periodLabel = isPeriod
        ? `Du ${frDate(anchor.date)} au ${frDate(anchor.endDate!)}`
        : p.reminderAt
        ? `Pensée · rappel ${reminderAtLabel(p.reminderAt, iso)}`
        : 'Pensée';
      // CHANTIER CAPTURE — EVENT TIME, incrément 4 (2026-09-18) — `eventTime` n'a de sens que pour
      // l'ancre RÉELLE de l'événement (`p.date`), jamais pour le fallback `reminderAt` de
      // `penseeAnchor` (deux notions indépendantes, voir types.ts) : `p.date` garanti par
      // construction dès que `p.eventTime` est renseigné (buildPenseeFromCard/PenseeDetailScreen),
      // vérifié ici explicitement plutôt que supposé. Seul point de rendu modifié pour cet incrément
      // — EventRow (components/) affiche `label` tel quel, aucun redesign nécessaire.
      const timePrefix = p.date && p.eventTime ? `${p.eventTime} · ` : '';
      list.push({
        type: 'pensee',
        label: `${timePrefix}${p.texte}`,
        kind: `${periodLabel}${extra}`,
        contactId: p.contactId,
        penseeId: p.id,
        isPeriod,
      });
    }
  });

  const hol = frenchHolidays(year)[iso];
  if (hol) list.push({ type: 'civil', label: hol, kind: 'Jour férié', contactId: null });
  const fam = familyFetes(year)[iso];
  if (fam) {
    list.push({ type: 'civil', label: fam, kind: 'Fête calendaire', contactId: null });
    // Un contact dont le lien familial précis correspond (Père, Mère, Grand-mère…) obtient en
    // plus un rappel personnalisé — c'est tout l'intérêt de renseigner "Lien précis" sur sa fiche.
    const role = FAMILY_FETE_ROLE[fam];
    if (role) {
      contacts
        .filter((c) => c.familyRole === role)
        .forEach((c) => {
          list.push({
            type: 'fete',
            label: `${fam} — pense à ${c.prenom} !`,
            kind: `Bonus 🎉 · ${c.relation.toLowerCase() === 'famille' ? role : c.relation}`,
            contactId: c.id,
          });
        });
    }
  }

  return list;
}
