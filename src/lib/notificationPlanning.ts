// Logique de planification des notifications — délibérément SANS dépendance à `expo-notifications`
// ni `react-native`, pour rester testable en pur Node/ts-node (voir scripts/test-regression-
// notifications.ts). `notifications.ts` est la couche fine qui appelle l'API réelle par-dessus ce
// module ; celui-ci ne fait que construire/trier/résoudre — jamais d'I/O.
import { Contact, Pensee, ReminderRecurrence } from '../data/types';
import {
  FAMILY_FETE_ROLE,
  addDays,
  daysUntilNext,
  namedayTable,
  nextFamilyFeteDate,
  nextOccurrenceDate,
  normalizeName,
} from '../data/calendar';
import { isoOf, pad2 } from '../data/dateLocal';
import { computeNextReminderOccurrences } from '../data/reminderRecurrence';
import { isQuizComplete } from '../data/quiz';
import { HomeAttentionAction, birthdayCTA } from '../data/homeAttention';

/** Marge de sécurité sous la limite iOS de 64 notifications locales en attente par app — jamais
 *  atteinte volontairement, quel que soit le nombre de contacts/pensées. Android n'a pas cette
 *  limite mais respecte le même budget par simplicité (un seul chiffre à faire évoluer). */
export const MAX_SCHEDULED_NOTIFICATIONS = 56;

/** CHANTIER "Badge binaire" (2026-09-24) — valeur ABSOLUE et CONSTANTE du badge de l'icône posée sur toute
 *  notification de rappel : 1 = "au moins un rappel non consulté". Jamais 2/3/… (un trigger DAILY/WEEKLY
 *  infini ne peut pas porter un compteur exact app fermée) ; remis à 0 à l'ouverture (clearAppBadge). */
export const REMINDER_BADGE_VALUE = 1;

/** Payload attaché à chaque notification pour la navigation au tap (voir resolveNotificationAction)
 *  — volontairement minimal (juste de quoi retrouver le contact/la pensée), la décision de
 *  navigation elle-même est recalculée avec l'état LIVE au moment du tap, jamais figée à la
 *  programmation. */
export type NotificationTapData =
  | { kind: 'birthday'; contactId: string }
  | { kind: 'fete-prenom'; contactId: string }
  | { kind: 'fete-familiale'; contactId: string }
  // CHANTIER NAVIGATION NOTIFICATION PENSÉES V2 : `penseeId` remplace l'ancien `focusDate` — une
  // pensée peut n'avoir aucune `date`/`endDate` (voir Pensee.reminderAt, types.ts), le Calendrier
  // n'est donc plus une destination fiable. Le tap ouvre désormais directement la pensée elle-même.
  | { kind: 'pensee'; penseeId: string }
  | { kind: 'none' };

// CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 1 (2026-09-18). `NotificationCandidate` devient un
// discriminated union PUR (aucune dépendance expo-notifications ici, voir en-tête de fichier) : un
// candidat porte désormais assez d'information pour que `notifications.ts` sache, PLUS TARD (pas cet
// incrément — voir consigne "ne pas encore appeler DAILY/WEEKLY côté Expo"), construire le bon type
// de trigger SANS refaire de logique métier. Champs communs factorisés dans `NotificationCandidateBase`
// (identifiant, tier, contenu, payload de navigation) — chaque variante n'ajoute que ce qui lui est
// propre (triggerAt pour une notification ponctuelle, hour/minute/weekday pour un trigger récurrent).
type NotificationCandidateBase = {
  /** Identité logique DÉTERMINISTE (voir penseeOccurrenceIdentifier/penseeDailyIdentifier/
   *  penseeWeeklyIdentifier plus bas) — reconstruite à l'identique à chaque appel, sans dépendre de
   *  l'ordre du tableau ni de `now`, et SANS AsyncStorage/persistance dédiée (voir consigne). Sert de
   *  base à un futur `identifier` Expo (`NotificationRequestInput.identifier`) — non exploité par
   *  `notifications.ts` à cet incrément, uniquement porté ici. */
  identifier: string;
  /** 0 = occurrence EN COURS (toujours prioritaire) ; 1 = occurrence SUIVANTE (ne comble que le
   *  budget restant) — un seul cycle d'avance, jamais "naïvement plusieurs années" (voir §1). */
  tier: 0 | 1;
  title: string;
  body: string;
  data: NotificationTapData;
};

/** Notification qui se déclenche UNE SEULE FOIS, à un instant absolu précis — deviendra un trigger
 *  Expo DATE (voir notifications.ts, INCHANGÉ à cet incrément). Couvre : tout le comportement
 *  historique (anniversaires/fêtes, tier 0/1) ET toute occurrence de pensée, qu'elle soit ponctuelle
 *  (pas de récurrence) ou une occurrence individuelle d'une récurrence FINIE (voir
 *  buildPenseeReminderCandidates — aucun trigger natif ne sait s'arrêter après N fois/à une date,
 *  voir audit "Notifications récurrentes V1"). */
export type OneShotCandidate = NotificationCandidateBase & {
  kind: 'oneShot';
  triggerAt: Date;
};

/** Récurrence PENSÉE INFINIE quotidienne (`occurrenceCount === null && untilDate === null`, voir
 *  ReminderRecurrence) — deviendra PLUS TARD un seul trigger natif Expo DAILY, auto-suffisant côté OS
 *  (jamais reconstruit par Pensif tant que la règle ne change pas — voir audit). `hour`/`minute` sont
 *  l'heure LOCALE de `reminderAt`, jamais recalculés indépendamment. */
export type RecurringDailyCandidate = NotificationCandidateBase & {
  kind: 'recurringDaily';
  hour: number;
  minute: number;
};

/** Récurrence PENSÉE INFINIE hebdomadaire — UN candidat par jour de la semaine coché, jamais un seul
 *  trigger portant plusieurs jours (aucune plateforme ne le permet nativement — vérifié dans l'audit
 *  "Notifications récurrentes V1" en lisant directement les triggers natifs iOS/Android d'expo-
 *  notifications). `weekday` suit EXACTEMENT la convention `Date.getDay()`/`ReminderRecurrence.
 *  daysOfWeek` (0=dimanche..6=samedi) — jamais une renumérotation locale à ce fichier. */
export type RecurringWeeklyCandidate = NotificationCandidateBase & {
  kind: 'recurringWeekly';
  weekday: number;
  hour: number;
  minute: number;
};

export type NotificationCandidate = OneShotCandidate | RecurringDailyCandidate | RecurringWeeklyCandidate;

/** Identifiant local FR lisible (jamais utilisé pour l'affichage) — transforme un libellé de fête en
 *  fragment d'identifiant stable (accents/espaces retirés) — voir consigne "identité logique
 *  reconstruite, sans dépendance à l'ordre du tableau ni à `now`". */
function slugFr(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
}

/**
 * Construit TOUS les candidats possibles (sans filtrer les dates passées ni appliquer de budget —
 * voir selectCandidatesToSchedule/describeSlotRequirement pour ça) à partir des contacts/pensées
 * actuels.
 *
 * CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 2 (2026-09-18) : la boucle "Pensées" délègue
 * désormais ENTIÈREMENT à `buildPenseeReminderCandidates` (plus bas), qui sait déjà distinguer
 * ponctuel / récurrence finie / récurrence infinie (voir sa docstring) — plus aucune pensée n'est
 * traitée "à la main" ici, ce qui exclut structurellement toute double génération de la première
 * occurrence (un seul point de vérité par pensée). Anniversaires/fêtes restent des `oneShot`
 * STRICTEMENT inchangés (incrément 1). Le type de retour devient l'union COMPLÈTE
 * (`NotificationCandidate[]`) car une pensée en récurrence infinie peut désormais produire un
 * `recurringDaily`/`recurringWeekly` — voir `notifications.ts` (incrément 2) pour la traduction Expo
 * par `kind` et le budget (`describeSlotRequirement`) appliqué AVANT toute programmation.
 */
export function buildCandidates(contacts: Contact[], pensees: Pensee[], today: Date, userName?: string | null): NotificationCandidate[] {
  const list: NotificationCandidate[] = [];

  for (const c of contacts) {
    if (!c.date) continue;

    // Anniversaire, jour J — occurrence en cours (tier 0) ET suivante (tier 1) : c'est ce qui
    // évite de dépendre d'une réouverture de l'app entre deux anniversaires (voir §1). La
    // deuxième occurrence se déduit de la première en avançant d'un jour avant de rechercher la
    // suivante, sans nouvelle fonction dédiée (voir nextOccurrenceDate dans calendar.ts).
    const bday0 = nextOccurrenceDate(c.date, today);
    const bday1 = nextOccurrenceDate(c.date, addDays(bday0, 1));
    const bdayTitle = `🎂 Anniversaire de ${c.prenom}`;
    const bdayBody = "C'est aujourd'hui — un petit message lui ferait plaisir.";
    list.push({ kind: 'oneShot', identifier: `birthday-${c.id}-current`, triggerAt: bday0, tier: 0, title: bdayTitle, body: bdayBody, data: { kind: 'birthday', contactId: c.id } });
    list.push({ kind: 'oneShot', identifier: `birthday-${c.id}-next`, triggerAt: bday1, tier: 1, title: bdayTitle, body: bdayBody, data: { kind: 'birthday', contactId: c.id } });

    // Rappel personnalisé avant l'anniversaire. Si le délai configuré tombe déjà dans le passé
    // pour L'OCCURRENCE EN COURS (ex. J-14 réglé alors qu'il ne reste que 5 jours), ce candidat
    // sera simplement filtré comme "déjà passé" plus bas (voir selectCandidatesToSchedule) — le
    // réglage n'est jamais perdu ni modifié, et celui de l'occurrence SUIVANTE reste, lui, toujours
    // dans le futur (voir §6 : ne jamais déclencher une notification immédiate de compensation).
    if (c.birthdayReminderDays) {
      const label = c.birthdayReminderDays === 1 ? 'Demain' : `Dans ${c.birthdayReminderDays} jours`;
      const body = isQuizComplete(c.quiz)
        ? 'Des idées cadeaux adaptées à son budget t’attendent dans Pensif.'
        : 'Un petit quizz suffit pour débloquer des idées cadeaux adaptées.';
      const title = `🎁 ${label}, l'anniversaire de ${c.prenom}`;
      const reminder0 = addDays(bday0, -c.birthdayReminderDays);
      const reminder1 = addDays(bday1, -c.birthdayReminderDays);
      list.push({ kind: 'oneShot', identifier: `birthday-reminder-${c.id}-current`, triggerAt: reminder0, tier: 0, title, body, data: { kind: 'birthday', contactId: c.id } });
      list.push({ kind: 'oneShot', identifier: `birthday-reminder-${c.id}-next`, triggerAt: reminder1, tier: 1, title, body, data: { kind: 'birthday', contactId: c.id } });
    }

    // Fête de prénom du proche.
    const mmdd = namedayTable[normalizeName(c.prenom)];
    if (mmdd) {
      const name0 = nextOccurrenceDate(`0000-${mmdd}`, today);
      const name1 = nextOccurrenceDate(`0000-${mmdd}`, addDays(name0, 1));
      const title = `🎉 C'est la fête de ${c.prenom} !`;
      const body = 'Bonus : une petite attention possible aujourd’hui.';
      list.push({ kind: 'oneShot', identifier: `fete-prenom-${c.id}-current`, triggerAt: name0, tier: 0, title, body, data: { kind: 'fete-prenom', contactId: c.id } });
      list.push({ kind: 'oneShot', identifier: `fete-prenom-${c.id}-next`, triggerAt: name1, tier: 1, title, body, data: { kind: 'fete-prenom', contactId: c.id } });
    }
  }

  if (userName) {
    const userMmdd = namedayTable[normalizeName(userName)];
    if (userMmdd) {
      const name0 = nextOccurrenceDate(`0000-${userMmdd}`, today);
      const name1 = nextOccurrenceDate(`0000-${userMmdd}`, addDays(name0, 1));
      const title = '🎉 C’est ta fête aujourd’hui !';
      const body = 'Profite de ta journée 😊';
      list.push({ kind: 'oneShot', identifier: 'fete-prenom-user-current', triggerAt: name0, tier: 0, title, body, data: { kind: 'none' } });
      list.push({ kind: 'oneShot', identifier: 'fete-prenom-user-next', triggerAt: name1, tier: 1, title, body, data: { kind: 'none' } });
    }
  }

  // Fêtes familiales — seulement pour les proches dont familyRole correspond RÉELLEMENT (voir §7),
  // jamais de notification générique. Réutilise FAMILY_FETE_ROLE/nextFamilyFeteDate de calendar.ts
  // (déjà utilisées par le Calendrier et l'Accueil) plutôt que de recoder la correspondance.
  for (const [label, role] of Object.entries(FAMILY_FETE_ROLE)) {
    const matching = contacts.filter((c) => c.familyRole === role);
    if (matching.length === 0) continue;
    const fete0 = nextFamilyFeteDate(label, today);
    if (!fete0) continue;
    const fete1 = nextFamilyFeteDate(label, addDays(fete0, 1));
    const at0 = new Date(fete0.getFullYear(), fete0.getMonth(), fete0.getDate(), 9, 0, 0);
    const at1 = fete1 ? new Date(fete1.getFullYear(), fete1.getMonth(), fete1.getDate(), 9, 0, 0) : null;
    const labelSlug = slugFr(label);
    for (const c of matching) {
      list.push({
        kind: 'oneShot',
        identifier: `fete-familiale-${labelSlug}-${c.id}-current`,
        triggerAt: at0,
        tier: 0,
        title: `🎉 ${label}`,
        body: `Pense à ${c.prenom} !`,
        data: { kind: 'fete-familiale', contactId: c.id },
      });
      if (at1) {
        list.push({
          kind: 'oneShot',
          identifier: `fete-familiale-${labelSlug}-${c.id}-next`,
          triggerAt: at1,
          tier: 1,
          title: `🎉 ${label}`,
          body: `Pense à ${c.prenom} !`,
          data: { kind: 'fete-familiale', contactId: c.id },
        });
      }
    }
  }

  // Pensées — un seul cycle : ni période ni pensée ponctuelle ne se répètent d'une année sur
  // l'autre, donc toujours tier 0. `reminderAt` est désormais une date/heure ABSOLUE et autonome
  // (CHANTIER PENSÉES V2, voir types.ts) — calculée une fois à la saisie (Calendrier ou fiche
  // pensée), jamais recalculée ici à partir d'un couple remind/date. Une pensée sans `reminderAt`
  // n'a simplement aucune notification (comportement voulu : le rappel est entièrement facultatif).
  // Une pensée de PÉRIODE garde UNE seule notification, au début de la période — l'Accueil, lui,
  // continue de l'afficher comme active chaque jour de la période ; ce sont deux responsabilités
  // différentes assumées volontairement différemment ici.
  // CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 2 (2026-09-18). `penseeId` (pas `focusDate`) —
  // voir NotificationTapData et resolveNotificationAction : navigation directe vers la pensée
  // elle-même (CHANTIER NAVIGATION NOTIFICATION PENSÉES V2), inchangé — `buildPenseeReminderCandidates`
  // porte le même `data: { kind: 'pensee', penseeId }` sur CHAQUE candidat qu'elle produit (oneShot,
  // recurringDaily, recurringWeekly), donc TOUTE occurrence d'une pensée résout la MÊME PenseeDetail
  // au tap, jamais l'identifiant d'occurrence lui-même (voir sa docstring).
  for (const p of pensees) {
    list.push(...buildPenseeReminderCandidates(p, today));
  }

  return list;
}

/**
 * Filtre les candidats déjà passés, trie par priorité (occurrence en cours avant occurrence
 * suivante, puis par proximité), puis borne au budget — jamais un anniversaire dans plus d'un an
 * n'évince une pensée proche, et jamais plus que MAX_SCHEDULED_NOTIFICATIONS au total.
 */
export function selectCandidatesToSchedule(candidates: OneShotCandidate[], now: Date): OneShotCandidate[] {
  const nowMs = now.getTime();
  return candidates
    .filter((c) => c.triggerAt.getTime() > nowMs)
    .sort((a, b) => a.tier - b.tier || a.triggerAt.getTime() - b.triggerAt.getTime())
    .slice(0, MAX_SCHEDULED_NOTIFICATIONS);
}

// --- CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 1 (2026-09-18). Moteur de planning PUR pour une
// pensée récurrente — SÉPARÉ de `buildCandidates`/`selectCandidatesToSchedule` ci-dessus (voir
// consigne "notifications.ts reste inchangé pour cet incrément" : ce moteur n'est pas encore branché
// dans le flux réel, uniquement construit et testé ici). Aucune dépendance expo-notifications, aucun
// appel scheduleNotificationAsync/DAILY/WEEKLY/DATE — uniquement du calcul. --------------------------

/** 'YYYY-MM-DDTHHmm' en LOCAL (jamais UTC, voir dateLocal.ts) — fragment d'identité déterministe pour
 *  une occurrence précise, indépendant de l'ordre d'un tableau ou de `now` (dépend uniquement de la
 *  pensée et de l'instant occurrence lui-même). */
function localDateTimeIdentifier(date: Date): string {
  return `${isoOf(date.getFullYear(), date.getMonth(), date.getDate())}T${pad2(date.getHours())}${pad2(date.getMinutes())}`;
}

/** Identité logique d'UNE occurrence de pensée (ponctuelle ou occurrence individuelle d'une
 *  récurrence FINIE) — voir consigne "pensee-{id}-occ-{localDateTime}". Reconstruite à l'identique à
 *  chaque appel pour la même pensée/occurrence, sans AsyncStorage ni persistance dédiée. */
function penseeOccurrenceIdentifier(penseeId: string, occurrenceAt: Date): string {
  return `pensee-${penseeId}-occ-${localDateTimeIdentifier(occurrenceAt)}`;
}

/** Identité logique du trigger natif DAILY d'une pensée — voir consigne "pensee-{id}-daily". Une
 *  seule pensée ne peut avoir qu'UN SEUL trigger daily (la règle est soit 'daily' soit 'weekly',
 *  jamais les deux à la fois — voir ReminderRecurrence), donc aucun suffixe supplémentaire requis. */
function penseeDailyIdentifier(penseeId: string): string {
  return `pensee-${penseeId}-daily`;
}

/** Identité logique d'UN trigger natif WEEKLY d'une pensée, pour UN jour de la semaine précis — voir
 *  consigne "pensee-{id}-weekly-{weekday}". `weekday` suit Date.getDay() (0=dimanche..6=samedi). */
function penseeWeeklyIdentifier(penseeId: string, weekday: number): string {
  return `pensee-${penseeId}-weekly-${weekday}`;
}

/**
 * Moteur PUR : construit TOUS les candidats de notification pour UNE pensée, en respectant
 * EXACTEMENT l'architecture retenue par l'audit "Notifications récurrentes V1" :
 *
 * - Pas de `reminderAt` → aucun candidat (rappel désactivé, comportement inchangé).
 * - Pas de `reminderRecurrence` → comportement STRICTEMENT INCHANGÉ : un seul `oneShot` à
 *   `reminderAt`, filtré s'il est déjà passé (jamais de rafale rétroactive).
 * - Récurrence FINIE (`occurrenceCount !== null || untilDate !== null`) → délègue ENTIÈREMENT le
 *   calcul calendaire à `computeNextReminderOccurrences` (reminderRecurrence.ts, AUCUNE logique
 *   dupliquée ici), avec `from: now` pour ne jamais rejouer une occurrence déjà passée — un `oneShot`
 *   par occurrence future restante. `limit` explicitement porté à une valeur très large : la valeur
 *   par défaut de `computeNextReminderOccurrences` (100) resterait une troncature SILENCIEUSE pour
 *   une règle bornée seulement par `untilDate` loin dans le futur — ce moteur doit produire la
 *   VÉRITÉ COMPLÈTE avant toute sélection/budget (voir consigne), le seul plafond qui doit rester
 *   actif ici est celui, structurel, de `computeNextReminderOccurrences` (MAX_DAY_SCAN, ~10 ans).
 * - Récurrence INFINIE (`occurrenceCount === null && untilDate === null`) → JAMAIS de `oneShot` :
 *   un seul `recurringDaily` pour 'daily', ou un `recurringWeekly` PAR jour de `daysOfWeek` (trié/
 *   dédupliqué, jamais dans l'ordre brut du tableau source — voir consigne "ordre déterministe").
 *   PRODUIT MÊME SI `reminderAt` (l'ancre initiale) est déjà passé : un trigger natif récurrent
 *   n'expire jamais tout seul, sa prochaine occurrence réelle est par construction toujours future
 *   (voir consigne "ne pas appliquer naïvement le filtre triggerAt > now aux triggers récurrents") —
 *   seules `hour`/`minute` sont lues sur l'ancre, jamais sa date calendaire.
 *
 * PURE — ne modifie jamais `pensee`, aucun I/O, aucun appel expo-notifications.
 */
export function buildPenseeReminderCandidates(pensee: Pensee, now: Date): NotificationCandidate[] {
  if (!pensee.reminderAt) return [];
  const anchor = new Date(pensee.reminderAt);
  const rule: ReminderRecurrence | null = pensee.reminderRecurrence ?? null;
  const title = '💭 Pensée';
  const body = pensee.texte;
  const data: NotificationTapData = { kind: 'pensee', penseeId: pensee.id };

  if (!rule) {
    if (anchor.getTime() <= now.getTime()) return [];
    return [{ kind: 'oneShot', identifier: penseeOccurrenceIdentifier(pensee.id, anchor), triggerAt: anchor, tier: 0, title, body, data }];
  }

  const isFinite = rule.occurrenceCount !== null || rule.untilDate !== null;
  if (isFinite) {
    // `Number.MAX_SAFE_INTEGER` — voir docstring ci-dessus : seule la borne RÉELLE de la règle
    // (occurrenceCount/untilDate, appliquée À L'INTÉRIEUR de computeNextReminderOccurrences) ou son
    // garde-fou structurel (MAX_DAY_SCAN) doit jamais limiter ce résultat, jamais une valeur par
    // défaut arbitraire pensée pour un usage différent (positionner un picker).
    //
    // AUDIT — CHANTIER NOTIFICATIONS RÉCURRENTES, incrément 2, point 9 (2026-09-18) : coût et risque
    // de troncature silencieuse d'un `untilDate` très éloigné. `computeNextReminderOccurrences`
    // (reminderRecurrence.ts, logique calendrier NON modifiée ici) balaie au plus MAX_DAY_SCAN
    // (~3700 jours, ~10 ans) avant de s'arrêter défensivement, même si `untilDate` n'est pas encore
    // atteint — ce module PUR ne signale pas cette troncature autrement que par un résultat plus
    // court que prévu. Coût mesuré : une boucle de ~3700 itérations d'arithmétique de date, de l'ordre
    // de la milliseconde — négligeable, aucun risque de freeze même pour plusieurs pensées
    // récurrentes. Risque de troncature SILENCIEUSE : structurellement couvert par
    // `describeSlotRequirement` en aval (voir rescheduleAllReminders, notifications.ts) — toute règle
    // dont le balayage est interrompu par MAX_DAY_SCAN avant `untilDate` a nécessairement déjà
    // accumulé bien plus de MAX_SCHEDULED_NOTIFICATIONS (56) occurrences (une règle 'daily' ou
    // 'weekly' produit au moins une occurrence par semaine, jamais moins) — un tel cas est donc
    // TOUJOURS détecté comme `overflow: true` avant toute programmation, jamais silencieusement
    // programmé comme une série "complète" alors qu'elle ne l'est pas. Aucun nouveau plafond introduit
    // ici : le garde-fou existant de `computeNextReminderOccurrences` suffit, relayé par le budget.
    const occurrences = computeNextReminderOccurrences(rule, anchor, { from: now, limit: Number.MAX_SAFE_INTEGER });
    return occurrences.map((occurrenceAt) => ({
      kind: 'oneShot' as const,
      identifier: penseeOccurrenceIdentifier(pensee.id, occurrenceAt),
      triggerAt: occurrenceAt,
      tier: 0 as const,
      title,
      body,
      data,
    }));
  }

  const hour = anchor.getHours();
  const minute = anchor.getMinutes();
  if (rule.frequency === 'daily') {
    return [{ kind: 'recurringDaily', identifier: penseeDailyIdentifier(pensee.id), hour, minute, tier: 0, title, body, data }];
  }
  // 'weekly' — dédupliqué + trié croissant : l'identité et l'ordre de sortie ne dépendent JAMAIS de
  // l'ordre dans lequel `daysOfWeek` a été persisté (voir consigne).
  const weekdays = Array.from(new Set(rule.daysOfWeek)).sort((a, b) => a - b);
  return weekdays.map((weekday) => ({
    kind: 'recurringWeekly' as const,
    identifier: penseeWeeklyIdentifier(pensee.id, weekday),
    weekday,
    hour,
    minute,
    tier: 0 as const,
    title,
    body,
    data,
  }));
}

/**
 * Détecte EXPLICITEMENT si la demande réelle (tous les candidats déjà produits, AVANT toute
 * sélection/troncature) dépasse le budget partagé `MAX_SCHEDULED_NOTIFICATIONS` — voir consigne :
 * "ne pas résoudre par troncature silencieuse le cas où les exigences garanties dépassent 56". Chaque
 * candidat coûte EXACTEMENT 1 slot, quel que soit son `kind` (`oneShot`, `recurringDaily` et
 * `recurringWeekly` occupent chacun un seul emplacement de notification programmée côté OS — voir
 * audit). Ne tronque rien, ne choisit rien : la politique UX pour le cas `overflow: true` sera
 * décidée séparément (voir consigne), ce chantier se limite à rendre le dépassement détectable.
 */
export type SlotRequirement = {
  /** Nombre total de slots que produiraient TOUS les candidats fournis, sans aucune troncature. */
  required: number;
  /** `true` si `required` dépasse `MAX_SCHEDULED_NOTIFICATIONS` — la garantie "toutes les occurrences
   *  représentables restent programmées" devient alors mathématiquement impossible avec le budget
   *  actuel. */
  overflow: boolean;
  /** `Math.max(0, required - MAX_SCHEDULED_NOTIFICATIONS)` — 0 si `overflow` est faux. */
  excess: number;
};

export function describeSlotRequirement(candidates: NotificationCandidate[]): SlotRequirement {
  const required = candidates.length;
  const excess = Math.max(0, required - MAX_SCHEDULED_NOTIFICATIONS);
  return { required, overflow: excess > 0, excess };
}

/**
 * CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 2 (2026-09-18). Conversion PURE et EXPLICITE entre
 * la convention métier Pensif (`RecurringWeeklyCandidate.weekday`, IDENTIQUE à `Date.getDay()` et à
 * `ReminderRecurrence.daysOfWeek` : 0=dimanche..6=samedi) et la convention attendue par
 * `Notifications.WeeklyTriggerInput.weekday` d'expo-notifications — VÉRIFIÉE dans la documentation
 * installée (node_modules/expo-notifications/build/Notifications.types.d.ts, `WeeklyTriggerInput`) :
 * "Weekdays are specified with a number from 1 through 7, with 1 indicating Sunday" — donc 1=dimanche
 * ..7=samedi, JAMAIS la même base que `Date.getDay()`. Ne JAMAIS supposer une correspondance directe
 * (voir consigne) : la conversion est ce simple décalage `+1`, testé explicitement sur les 7 jours.
 * PURE — aucune dépendance à expo-notifications elle-même, uniquement à sa convention documentée.
 */
export function toExpoWeekday(penseeWeekday: number): number {
  return penseeWeekday + 1;
}

// --- CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 3 : politique de capacité par GROUPES ATOMIQUES
// (2026-09-18). Remplace la décision "tout ou rien global" de l'incrément 2 (`describeSlotRequirement`
// seule, conservée ci-dessus pour compatibilité/tests mais plus utilisée par `notifications.ts`) :
// une SEULE série trop longue ne doit plus jamais supprimer les autres rappels parfaitement
// planifiables. Principe : Pensif ne représente JAMAIS partiellement une récurrence — soit TOUTES ses
// occurrences futures sont programmées, soit AUCUNE. --------------------------------------------------

/**
 * Un GROUPE ATOMIQUE = l'ensemble des candidats qui doivent être programmés TOUS ENSEMBLE ou PAS DU
 * TOUT :
 * - toute pensée (ponctuelle, récurrence finie OU infinie) forme un seul groupe — une pensée ne
 *   produit jamais un mélange de kinds (voir buildPenseeReminderCandidates), donc regrouper par
 *   `penseeId` capture naturellement les 3 cas : ponctuelle → groupe de 1 ; récurrence finie → groupe
 *   de N occurrences (atomique) ; récurrence infinie weekly multi-jours → groupe de N triggers
 *   `recurringWeekly` (les jours d'UNE SEULE règle traités de manière cohérente, jamais séparément).
 * - toute notification non issue d'une pensée (anniversaire, fête) reste un groupe de 1, exactement
 *   comme avant — `data.kind !== 'pensee'` n'a jamais de notion de série.
 */
function candidateGroupKey(c: NotificationCandidate): string {
  return c.data.kind === 'pensee' ? `pensee-${c.data.penseeId}` : c.identifier;
}

type CandidateGroup = {
  key: string;
  /** `null` pour un groupe non issu d'une pensée (anniversaire/fête) — présent pour toute pensée. */
  penseeId: string | null;
  /** Tier du groupe — identique pour tous ses membres en pratique (une pensée ne mélange jamais tier
   *  0/1 ; un anniversaire/une fête forme un groupe de 1, donc trivialement homogène). */
  tier: 0 | 1;
  /** Clé de proximité pour le tri : `triggerAt` le plus proche du groupe (oneShot), ou
   *  `Number.NEGATIVE_INFINITY` pour un groupe récurrent natif (recurringDaily/recurringWeekly) —
   *  toujours "dû" dès maintenant, jamais une date future comparable à un `oneShot`, donc toujours
   *  prioritaire À TIER ÉGAL (cohérent avec l'audit : un trigger récurrent coûte 1 à N slots FIXES
   *  pour toujours, jamais un slot par occurrence future — le privilégier maximise la couverture). */
  proximityMs: number;
  candidates: NotificationCandidate[];
};

function groupCandidates(candidates: NotificationCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const c of candidates) {
    const key = candidateGroupKey(c);
    const triggerMs = c.kind === 'oneShot' ? c.triggerAt.getTime() : Number.NEGATIVE_INFINITY;
    const existing = groups.get(key);
    if (existing) {
      existing.candidates.push(c);
      existing.proximityMs = Math.min(existing.proximityMs, triggerMs);
      existing.tier = Math.min(existing.tier, c.tier) as 0 | 1;
    } else {
      groups.set(key, {
        key,
        penseeId: c.data.kind === 'pensee' ? c.data.penseeId : null,
        tier: c.tier,
        proximityMs: triggerMs,
        candidates: [c],
      });
    }
  }
  return Array.from(groups.values());
}

/** Un groupe entier écarté FAUTE DE CAPACITÉ — jamais une troncature interne au groupe (voir
 *  `selectCandidateGroupsToSchedule`). `requiredSlots` = la taille EXACTE de ce groupe (nombre de
 *  candidats qu'il aurait fallu programmer pour le représenter intégralement). */
export type RejectedGroup = {
  groupKey: string;
  penseeId: string | null;
  reason: 'capacity';
  requiredSlots: number;
};

/**
 * Résultat EXPLICITE de la sélection — remplace un simple tableau : permettra au futur chantier UX
 * d'informer précisément l'utilisateur qu'un rappel récurrent n'a pas pu être entièrement planifié
 * (voir `rejectedGroups`), sans qu'aucune UI ne soit ajoutée à cet incrément.
 */
export type SelectionResult = {
  scheduledCandidates: NotificationCandidate[];
  rejectedGroups: RejectedGroup[];
  /** Nombre total de slots réellement demandés (candidats futurs, toutes séries confondues) — avant
   *  toute décision de rejet. */
  requiredSlots: number;
  /** `scheduledCandidates.length` — toujours `<= MAX_SCHEDULED_NOTIFICATIONS` (invariant garanti par
   *  construction, voir boucle ci-dessous). */
  scheduledSlots: number;
};

/**
 * Politique de capacité par GROUPES ATOMIQUES (voir CandidateGroup ci-dessus) : jamais de troncature
 * À L'INTÉRIEUR d'un groupe — chaque groupe est intégralement programmé, ou intégralement rejeté.
 * Priorité inchangée par rapport à l'ancien `selectCandidatesToSchedule` (tier existant, puis
 * proximité temporelle), appliquée désormais AU NIVEAU DU GROUPE plutôt que candidat par candidat.
 * Un groupe qui ne rentre plus dans la capacité restante est REJETÉ mais n'interrompt JAMAIS l'examen
 * des groupes suivants (moins prioritaires en tier/proximité, mais potentiellement plus petits et
 * donc encore représentables) — voir consigne "un groupe de 40 ne doit pas empêcher un rappel
 * ponctuel situé après lui".
 *
 * INVARIANTS GARANTIS :
 * - `scheduledCandidates.length <= MAX_SCHEDULED_NOTIFICATIONS`, toujours.
 * - pour toute pensée : le nombre de ses candidats retenus vaut 0 (groupe rejeté) OU la taille EXACTE
 *   de son groupe (groupe accepté) — jamais une valeur intermédiaire.
 * - un groupe rejeté n'affecte jamais le sort des autres groupes (pas de court-circuit global).
 *
 * PURE — aucun I/O, aucune dépendance expo-notifications. `now` filtre les `oneShot` déjà passés
 * AVANT le groupement (une occurrence passée ne fait jamais partie de la demande réelle d'un groupe).
 */
export function selectCandidateGroupsToSchedule(candidates: NotificationCandidate[], now: Date): SelectionResult {
  const nowMs = now.getTime();
  const future = candidates.filter((c) => c.kind !== 'oneShot' || c.triggerAt.getTime() > nowMs);
  const requiredSlots = future.length;

  const groups = groupCandidates(future).sort((a, b) => a.tier - b.tier || a.proximityMs - b.proximityMs);

  const scheduledCandidates: NotificationCandidate[] = [];
  const rejectedGroups: RejectedGroup[] = [];
  let usedSlots = 0;

  for (const group of groups) {
    const size = group.candidates.length;
    if (usedSlots + size <= MAX_SCHEDULED_NOTIFICATIONS) {
      scheduledCandidates.push(...group.candidates);
      usedSlots += size;
    } else {
      rejectedGroups.push({ groupKey: group.key, penseeId: group.penseeId, reason: 'capacity', requiredSlots: size });
    }
  }

  return { scheduledCandidates, rejectedGroups, requiredSlots, scheduledSlots: scheduledCandidates.length };
}

// --- CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 3, "atomicité réelle du scheduling"
// (2026-09-18). `selectCandidateGroupsToSchedule` (ci-dessus, INCHANGÉE) décide QUELS groupes
// tentent d'être programmés — les groupes rejetés pour capacité n'atteignent jamais le code
// ci-dessous. Ce qui suit garantit qu'un groupe ACCEPTÉ finit RÉELLEMENT soit 100% programmé côté
// OS, soit 0% (jamais un résultat partiel comme 2/5), même si `scheduleNotificationAsync` échoue en
// cours de route pour CE groupe. ----------------------------------------------------------------

/** Un groupe ACCEPTÉ par la sélection mais dont la programmation OS elle-même a échoué (jamais
 *  confondu avec un rejet `capacity`, voir RejectedGroup — raison distincte : 'scheduling'). */
export type GroupSchedulingFailure = {
  groupKey: string;
  penseeId: string | null;
  reason: 'scheduling';
};

/** Résultat EXPLICITE de l'exécution — volontairement minimal (voir consigne "ne pas sur-concevoir
 *  cette structure") : sert aux tests et à une future UX/observabilité, pas encore à une UI. */
export type GroupSchedulingResult = {
  /** Clés des groupes intégralement programmés avec succès. */
  scheduledGroups: string[];
  failedGroups: GroupSchedulingFailure[];
};

/**
 * Programme ATOMIQUEMENT chaque groupe de `approvedCandidates` (déjà retenus par
 * `selectCandidateGroupsToSchedule` — un groupe rejeté pour capacité n'appelle donc JAMAIS
 * `ops.schedule`, voir consigne "Les groupes rejetés pour capacity → jamais envoyés à Expo") :
 *
 * - programme les candidats du groupe UN PAR UN, dans leur ordre naturel (celui déjà garanti par
 *   `buildPenseeReminderCandidates`, ex. occurrence 1, 2, 3… ou jour 1, 2, 3… d'une règle weekly) ;
 * - dès qu'UN candidat échoue : arrête IMMÉDIATEMENT ce groupe (les candidats restants ne sont
 *   JAMAIS tentés), puis ANNULE (`ops.cancel`, par `identifier` DÉTERMINISTE — aucune persistance
 *   supplémentaire, voir consigne) chacun des candidats DÉJÀ programmés pendant CETTE tentative pour
 *   CE MÊME groupe. Un groupe dont le tout premier candidat échoue n'a donc RIEN à annuler (la liste
 *   des candidats déjà réussis est vide) — aucun appel `ops.cancel` inutile ;
 * - un échec de `ops.cancel` lui-même (rollback impossible) est capturé, signalé via
 *   `ops.onCancelError` (journalisation `__DEV__`, voir notifications.ts) et n'interrompt JAMAIS les
 *   autres annulations du même rollback ni le reste du reschedule — le prochain
 *   `cancelAllScheduledNotificationsAsync()` global (voir rescheduleAllReminders) reste le filet de
 *   sécurité final, volontairement AUCUN système transactionnel plus complexe construit ici ;
 * - un groupe en échec (ou en échec de rollback) n'affecte JAMAIS le sort d'un autre groupe : chaque
 *   groupe est traité de façon totalement ISOLÉE, dans l'ordre reçu.
 *
 * Aucune dépendance à expo-notifications/react-native ici — les seuls effets de bord passent par
 * `ops.schedule`/`ops.cancel`, injectés par l'appelant (notifications.ts en production, des
 * doublures simulées dans les tests).
 */
export async function scheduleCandidateGroupsAtomically(
  approvedCandidates: NotificationCandidate[],
  ops: {
    schedule: (candidate: NotificationCandidate) => Promise<void>;
    cancel: (identifier: string) => Promise<void>;
    onCancelError?: (identifier: string, error: unknown) => void;
  },
): Promise<GroupSchedulingResult> {
  const groups = groupCandidates(approvedCandidates);
  const scheduledGroups: string[] = [];
  const failedGroups: GroupSchedulingFailure[] = [];

  for (const group of groups) {
    const alreadyScheduled: NotificationCandidate[] = [];
    let failed = false;

    for (const candidate of group.candidates) {
      try {
        await ops.schedule(candidate);
        alreadyScheduled.push(candidate);
      } catch {
        failed = true;
        break; // jamais les candidats restants de CE groupe — voir consigne "#4 et #5 jamais programmées"
      }
    }

    if (!failed) {
      scheduledGroups.push(group.key);
      continue;
    }

    for (const candidate of alreadyScheduled) {
      try {
        await ops.cancel(candidate.identifier);
      } catch (cancelError) {
        ops.onCancelError?.(candidate.identifier, cancelError);
      }
    }
    failedGroups.push({ groupKey: group.key, penseeId: group.penseeId, reason: 'scheduling' });
  }

  return { scheduledGroups, failedGroups };
}

/**
 * Traduit le payload d'une notification en décision de navigation, avec l'état LIVE des contacts
 * (et, depuis CHANTIER NAVIGATION NOTIFICATION PENSÉES V2, des pensées) au moment du tap — jamais
 * l'état figé au moment où la notification a été programmée. Réutilise `birthdayCTA` de
 * homeAttention.ts au lieu de recoder cette petite machine à états une deuxième fois (voir §8 du
 * chantier). Une pensée supprimée entre la programmation et le tap suit exactement le même principe
 * qu'un contact supprimé (`birthday`/`fete-*` ci-dessous) : aucune navigation plutôt qu'un écran
 * cassé — voir aussi le garde-fou symétrique dans PenseeDetailScreen.tsx (défense en profondeur).
 */
export function resolveNotificationAction(dataRaw: unknown, contacts: Contact[], pensees: Pensee[], today: Date): HomeAttentionAction | null {
  const data = dataRaw as NotificationTapData | undefined;
  if (!data) return null;
  switch (data.kind) {
    case 'birthday': {
      const contact = contacts.find((c) => c.id === data.contactId);
      if (!contact) return null;
      const daysUntil = daysUntilNext(contact.date, today);
      return birthdayCTA(contact, today, daysUntil).action;
    }
    case 'fete-prenom':
    case 'fete-familiale': {
      const exists = contacts.some((c) => c.id === data.contactId);
      return exists ? { kind: 'fiche', contactId: data.contactId } : null;
    }
    case 'pensee': {
      const exists = pensees.some((p) => p.id === data.penseeId);
      return exists ? { kind: 'pensee-detail', penseeId: data.penseeId } : null;
    }
    case 'none':
    default:
      return null;
  }
}

/**
 * Un identifiant de réponse à une notification déjà traité (dans cette session) ne doit jamais
 * redéclencher une navigation — sert à parer un double traitement de la même interaction (ex.
 * `getLastNotificationResponseAsync` ET `addNotificationResponseReceivedListener` qui recevraient
 * tous les deux la même réponse). `handled` est mutée par effet de bord volontaire : l'appelant n'a
 * qu'à créer un `Set` vide une fois par session et le réutiliser à chaque appel.
 * Renvoie `true` la première fois qu'un identifiant est vu (à traiter), `false` ensuite (à ignorer).
 * Sans identifiant (ne devrait pas arriver en pratique), on laisse passer plutôt que de bloquer une
 * navigation légitime.
 */
export function consumeNotificationResponseOnce(identifier: string | undefined | null, handled: Set<string>): boolean {
  if (!identifier) return true;
  if (handled.has(identifier)) return false;
  handled.add(identifier);
  return true;
}

/**
 * File d'attente d'UNE seule valeur, consommée exactement une fois dès qu'`isReady()` devient vrai —
 * sert à ne jamais résoudre une navigation (ou toute autre action) avec un état vide figé au tout
 * début du boot (app fermée puis ouverte par un tap : ni la navigation ni les données du store ne
 * sont encore prêtes). Petit et pur, sans dépendance à expo-notifications/react-native, pour rester
 * testable indépendamment de la couche plateforme (voir registerNotificationTapHandler).
 */
export function createPendingOnce<T>() {
  let pending: T | undefined;
  let has = false;
  return {
    set(value: T) {
      pending = value;
      has = true;
    },
    hasPending(): boolean {
      return has;
    },
    /** Si une valeur est en attente ET `isReady()` est vrai, la consomme (elle ne sera plus jamais
     *  renvoyée) et la renvoie ; sinon ne fait rien et renvoie `undefined` — la valeur reste en
     *  attente pour un prochain essai. */
    consumeIfReady(isReady: () => boolean): T | undefined {
      if (!has || !isReady()) return undefined;
      const value = pending;
      pending = undefined;
      has = false;
      return value;
    },
  };
}
