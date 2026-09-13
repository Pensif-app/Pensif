// Logique de planification des notifications — délibérément SANS dépendance à `expo-notifications`
// ni `react-native`, pour rester testable en pur Node/ts-node (voir scripts/test-regression-
// notifications.ts). `notifications.ts` est la couche fine qui appelle l'API réelle par-dessus ce
// module ; celui-ci ne fait que construire/trier/résoudre — jamais d'I/O.
import { Contact, Pensee } from '../data/types';
import {
  FAMILY_FETE_ROLE,
  addDays,
  daysUntilNext,
  namedayTable,
  nextFamilyFeteDate,
  nextOccurrenceDate,
  normalizeName,
} from '../data/calendar';
import { isQuizComplete } from '../data/quiz';
import { HomeAttentionAction, birthdayCTA } from '../data/homeAttention';

/** Marge de sécurité sous la limite iOS de 64 notifications locales en attente par app — jamais
 *  atteinte volontairement, quel que soit le nombre de contacts/pensées. Android n'a pas cette
 *  limite mais respecte le même budget par simplicité (un seul chiffre à faire évoluer). */
export const MAX_SCHEDULED_NOTIFICATIONS = 56;

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

export type NotificationCandidate = {
  triggerAt: Date;
  /** 0 = occurrence EN COURS (toujours prioritaire) ; 1 = occurrence SUIVANTE (ne comble que le
   *  budget restant) — un seul cycle d'avance, jamais "naïvement plusieurs années" (voir §1). */
  tier: 0 | 1;
  title: string;
  body: string;
  data: NotificationTapData;
};

/**
 * Construit TOUS les candidats possibles (sans filtrer les dates passées ni appliquer de budget —
 * voir selectCandidatesToSchedule pour ça) à partir des contacts/pensées actuels.
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
    list.push({ triggerAt: bday0, tier: 0, title: bdayTitle, body: bdayBody, data: { kind: 'birthday', contactId: c.id } });
    list.push({ triggerAt: bday1, tier: 1, title: bdayTitle, body: bdayBody, data: { kind: 'birthday', contactId: c.id } });

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
      list.push({ triggerAt: reminder0, tier: 0, title, body, data: { kind: 'birthday', contactId: c.id } });
      list.push({ triggerAt: reminder1, tier: 1, title, body, data: { kind: 'birthday', contactId: c.id } });
    }

    // Fête de prénom du proche.
    const mmdd = namedayTable[normalizeName(c.prenom)];
    if (mmdd) {
      const name0 = nextOccurrenceDate(`0000-${mmdd}`, today);
      const name1 = nextOccurrenceDate(`0000-${mmdd}`, addDays(name0, 1));
      const title = `🎉 C'est la fête de ${c.prenom} !`;
      const body = 'Bonus : une petite attention possible aujourd’hui.';
      list.push({ triggerAt: name0, tier: 0, title, body, data: { kind: 'fete-prenom', contactId: c.id } });
      list.push({ triggerAt: name1, tier: 1, title, body, data: { kind: 'fete-prenom', contactId: c.id } });
    }
  }

  if (userName) {
    const userMmdd = namedayTable[normalizeName(userName)];
    if (userMmdd) {
      const name0 = nextOccurrenceDate(`0000-${userMmdd}`, today);
      const name1 = nextOccurrenceDate(`0000-${userMmdd}`, addDays(name0, 1));
      const title = '🎉 C’est ta fête aujourd’hui !';
      const body = 'Profite de ta journée 😊';
      list.push({ triggerAt: name0, tier: 0, title, body, data: { kind: 'none' } });
      list.push({ triggerAt: name1, tier: 1, title, body, data: { kind: 'none' } });
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
    for (const c of matching) {
      list.push({ triggerAt: at0, tier: 0, title: `🎉 ${label}`, body: `Pense à ${c.prenom} !`, data: { kind: 'fete-familiale', contactId: c.id } });
      if (at1) {
        list.push({ triggerAt: at1, tier: 1, title: `🎉 ${label}`, body: `Pense à ${c.prenom} !`, data: { kind: 'fete-familiale', contactId: c.id } });
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
  for (const p of pensees) {
    if (!p.reminderAt) continue;
    // `penseeId` (pas `focusDate`) — voir NotificationTapData et resolveNotificationAction :
    // navigation directe vers la pensée elle-même (CHANTIER NAVIGATION NOTIFICATION PENSÉES V2).
    list.push({ triggerAt: new Date(p.reminderAt), tier: 0, title: '💭 Pensée', body: p.texte, data: { kind: 'pensee', penseeId: p.id } });
  }

  return list;
}

/**
 * Filtre les candidats déjà passés, trie par priorité (occurrence en cours avant occurrence
 * suivante, puis par proximité), puis borne au budget — jamais un anniversaire dans plus d'un an
 * n'évince une pensée proche, et jamais plus que MAX_SCHEDULED_NOTIFICATIONS au total.
 */
export function selectCandidatesToSchedule(candidates: NotificationCandidate[], now: Date): NotificationCandidate[] {
  const nowMs = now.getTime();
  return candidates
    .filter((c) => c.triggerAt.getTime() > nowMs)
    .sort((a, b) => a.tier - b.tier || a.triggerAt.getTime() - b.triggerAt.getTime())
    .slice(0, MAX_SCHEDULED_NOTIFICATIONS);
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
