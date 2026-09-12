import { Contact, FamilyRole, Pensee } from './types';
import { isQuizComplete } from './quiz';
import {
  FAMILY_FETE_ROLE,
  addDays,
  ageTurning,
  daysBetween,
  daysUntilNext,
  dIso,
  familyFetes,
  isPenseeActiveOn,
  isPenseeEnded,
  namedayTable,
  normalizeName,
  occurrenceYear,
  penseeSubtitle,
} from './calendar';

/**
 * Représentation commune de tout ce que l'Accueil peut afficher — un seul type, une seule fonction
 * de génération (buildHomeAttentions), pour ne plus recalculer séparément anniversaires/pensées/
 * fêtes directement dans le JSX de HomeScreen.tsx (voir CHANTIER ACCUEIL V1).
 */
export type HomeAttentionType = 'anniversaire' | 'pensee' | 'fete-prenom' | 'fete-familiale';
export type HomeHorizon = 'today' | 'week' | 'later';
export type HomeBadgeTone = 'accent' | 'plum' | 'sage' | 'muted';

export type HomeAttentionAction =
  | { kind: 'quiz'; contactId: string }
  | { kind: 'ideas'; contactId: string }
  | { kind: 'message'; contactId: string }
  | { kind: 'fiche'; contactId: string }
  | { kind: 'calendar'; focusDate: string };

export type HomeAttention = {
  id: string;
  type: HomeAttentionType;
  /** Date de l'occurrence concernée cette année ('YYYY-MM-DD') — début de période pour une pensée
   *  de période. */
  date: string;
  /** Renseignée uniquement pour une pensée de période. */
  endDate: string | null;
  contactId: string | null;
  title: string;
  subtitle: string;
  horizon: HomeHorizon;
  daysUntil: number;
  /** Sert de 2e clé de tri (voir compareHomeAttentions) : une attention qui attend encore un geste
   *  de l'utilisateur passe avant une attention déjà traitée, à date égale. */
  needsAction: boolean;
  favorite: boolean;
  badge: { label: string; tone: HomeBadgeTone } | null;
  action: HomeAttentionAction;
};

// Mêmes fenêtres que l'ancien Accueil pour anniversaires/pensées (voir AUDIT ACCUEIL) ; les fêtes de
// prénom/familiales, elles, ne concernent QUE "aujourd'hui"/"cette semaine" — jamais "à anticiper"
// (voir chantier V1, point 7 : pas question de lister 14 fêtes de prénom comme des jalons lointains).
const HOME_WINDOW_DAYS = 60;
const WEEK_WINDOW_DAYS = 7;
// Sous ce seuil (jours), plus de quiz à faire : on ne peut plus raisonnablement recommander
// d'acheter/choisir un cadeau, seul un message reste réaliste (voir §5 du chantier).
const CLOSE_TO_BIRTHDAY_DAYS = 3;

function horizonForDays(daysUntil: number): HomeHorizon {
  if (daysUntil === 0) return 'today';
  return daysUntil <= WEEK_WINDOW_DAYS ? 'week' : 'later';
}

/** null si l'année saisie n'est manifestement pas une vraie année de naissance (peu fiable). */
function plausibleAge(dateStr: string, today: Date): number | null {
  const age = ageTurning(dateStr, today);
  return age > 0 && age < 130 ? age : null;
}

/**
 * État CTA (badge + action) d'un anniversaire selon quiz/cadeau/proximité — extrait de
 * birthdayAttention() pour être réutilisé TEL QUEL par le tap sur une notification (voir
 * notifications.ts), qui doit résoudre la même décision mais avec l'état LIVE au moment du tap
 * (pas figé au moment où la notification a été programmée). Aucune dépendance à la liste
 * `HomeAttention` elle-même : une fonction pure (contact, date) → décision, réutilisable sans que
 * les notifications aient besoin de connaître `buildHomeAttentions`.
 */
export function birthdayCTA(c: Contact, today: Date, daysUntil: number): { badge: HomeAttention['badge']; action: HomeAttentionAction } {
  const hasQuiz = isQuizComplete(c.quiz);
  const giftPrepared = c.giftPreparedYear === occurrenceYear(c.date, today);
  // Ordre volontairement simple (pas de scoring) : le jour J l'emporte toujours, puis la proximité
  // (qui ne bloque jamais sur le quiz — voir §5), puis l'état réel quiz/cadeau/alerte.
  if (daysUntil === 0) {
    return { badge: { label: "Aujourd'hui", tone: 'plum' }, action: { kind: 'message', contactId: c.id } };
  }
  if (!giftPrepared && daysUntil <= CLOSE_TO_BIRTHDAY_DAYS) {
    return { badge: { label: 'Préparer son message', tone: 'plum' }, action: { kind: 'message', contactId: c.id } };
  }
  if (!hasQuiz) {
    return { badge: { label: 'Faire son portrait', tone: 'muted' }, action: { kind: 'quiz', contactId: c.id } };
  }
  if (!giftPrepared) {
    return { badge: { label: 'Voir les idées', tone: 'accent' }, action: { kind: 'ideas', contactId: c.id } };
  }
  if (c.birthdayReminderDays == null) {
    return { badge: { label: 'Alerte à régler', tone: 'plum' }, action: { kind: 'fiche', contactId: c.id } };
  }
  return { badge: { label: 'Tout est prêt', tone: 'sage' }, action: { kind: 'fiche', contactId: c.id } };
}

function birthdayAttention(c: Contact, today: Date): HomeAttention | null {
  if (!c.date) return null;
  const daysUntil = daysUntilNext(c.date, today);
  if (daysUntil > HOME_WINDOW_DAYS) return null;

  const { badge, action } = birthdayCTA(c, today, daysUntil);
  const hasQuiz = isQuizComplete(c.quiz);
  const giftPrepared = c.giftPreparedYear === occurrenceYear(c.date, today);
  const age = plausibleAge(c.date, today);
  const name = `${c.prenom} ${c.nom}`.trim();

  const subtitle =
    daysUntil === 0
      ? age
        ? `Fête ses ${age} ans aujourd'hui 🎂`
        : "C'est le grand jour 🎂"
      : age
      ? `Fête ses ${age} ans dans ${daysUntil} j`
      : `${c.familyRole ?? c.relation} · J-${daysUntil}`;

  const occurrenceDate = `${occurrenceYear(c.date, today)}-${c.date.slice(5)}`;

  return {
    id: `anniv-${c.id}`,
    type: 'anniversaire',
    date: occurrenceDate,
    endDate: null,
    contactId: c.id,
    title: name,
    subtitle,
    horizon: horizonForDays(daysUntil),
    daysUntil,
    needsAction: !hasQuiz || !giftPrepared || c.birthdayReminderDays == null,
    favorite: c.favorite,
    badge,
    action,
  };
}

function penseeAttention(p: Pensee, contacts: Contact[], today: Date): HomeAttention | null {
  const todayIso = dIso(today);
  // Une pensée passée (ponctuelle dont la date est révolue, ou période déjà terminée) ne doit plus
  // jamais apparaître comme "à venir" — c'est le bug corrigé par le chantier Accueil V1. Même
  // définition réutilisée par l'écran Pensées (voir penseesView.ts) — centralisée dans calendar.ts.
  if (isPenseeEnded(p, todayIso)) return null;

  const activeToday = isPenseeActiveOn(p, todayIso);
  const daysUntil = activeToday ? 0 : daysBetween(p.date, today);
  if (daysUntil > HOME_WINDOW_DAYS) return null;

  const subtitle = penseeSubtitle(p, contacts);

  return {
    id: `pensee-${p.id}`,
    type: 'pensee',
    date: p.date,
    endDate: p.endDate ?? null,
    contactId: p.contactId,
    title: p.texte,
    subtitle,
    horizon: horizonForDays(daysUntil),
    daysUntil,
    // Une pensée est par nature un rappel qu'on n'a pas encore "traité" — pas d'état "terminé" dans
    // le modèle actuel (voir §6 du chantier : volontairement pas inventé ici), donc toujours vraie.
    needsAction: true,
    favorite: false,
    badge: null,
    action: { kind: 'calendar', focusDate: p.date },
  };
}

/** Fêtes de prénom des PROCHES enregistrés uniquement — jamais les 14 prénoms de la table comme
 *  liste générique (voir §7 : "ne pas afficher les 14 fêtes de prénom comme des événements
 *  génériques"). Fenêtre volontairement plus courte que les anniversaires/pensées : une fête de
 *  prénom n'a de sens qu'imminente, jamais "à anticiper" à 2 mois. */
function namedayAttentions(contacts: Contact[], today: Date): HomeAttention[] {
  const out: HomeAttention[] = [];
  for (const c of contacts) {
    const mmdd = namedayTable[normalizeName(c.prenom)];
    if (!mmdd) continue;
    // daysUntilNext ignore l'année de la chaîne fournie (seuls mois/jour comptent) — pas besoin
    // d'une vraie année de naissance ici, une année factice suffit.
    const daysUntil = daysUntilNext(`0000-${mmdd}`, today);
    if (daysUntil > WEEK_WINDOW_DAYS) continue;
    out.push({
      id: `fete-prenom-${c.id}`,
      type: 'fete-prenom',
      date: dIso(addDays(today, daysUntil)),
      endDate: null,
      contactId: c.id,
      title: `Fête de ${c.prenom}`,
      subtitle: daysUntil === 0 ? 'Aujourd’hui · petite attention possible 🎉' : `Dans ${daysUntil} j · petite attention possible 🎉`,
      horizon: horizonForDays(daysUntil),
      daysUntil,
      needsAction: false,
      favorite: c.favorite,
      badge: null,
      action: { kind: 'fiche', contactId: c.id },
    });
  }
  return out;
}

/** Fêtes familiales (Mères/Pères/Grands-mères/Grands-pères) uniquement pour les proches dont le
 *  `familyRole` correspond réellement — jamais affichées sans un proche concerné (voir §7). Réutilise
 *  telles quelles familyFetes()/FAMILY_FETE_ROLE de calendar.ts, déjà utilisées par le Calendrier. */
function familyFeteAttentions(contacts: Contact[], today: Date): HomeAttention[] {
  const out: HomeAttention[] = [];
  for (let offset = 0; offset <= WEEK_WINDOW_DAYS; offset++) {
    const d = addDays(today, offset);
    const iso = dIso(d);
    const label = familyFetes(d.getFullYear())[iso];
    if (!label) continue;
    const role: FamilyRole | undefined = FAMILY_FETE_ROLE[label];
    if (!role) continue;
    contacts
      .filter((c) => c.familyRole === role)
      .forEach((c) => {
        out.push({
          id: `fete-familiale-${c.id}-${iso}`,
          type: 'fete-familiale',
          date: iso,
          endDate: null,
          contactId: c.id,
          title: `${label} — pense à ${c.prenom}`,
          subtitle: offset === 0 ? "Aujourd'hui" : `Dans ${offset} j`,
          horizon: horizonForDays(offset),
          daysUntil: offset,
          needsAction: false,
          favorite: c.favorite,
          badge: null,
          action: { kind: 'fiche', contactId: c.id },
        });
      });
  }
  return out;
}

/**
 * Tri interne à chaque section : date la plus proche d'abord, puis (à égalité) une attention qui
 * attend encore une action avant une attention déjà traitée, puis un favori en tout dernier recours.
 * Volontairement pas de scoring composite (voir chantier V1, §4).
 */
export function compareHomeAttentions(a: HomeAttention, b: HomeAttention): number {
  if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
  if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  return 0;
}

/** Point d'entrée unique : construit puis trie toutes les attentions Accueil, tous types confondus —
 *  HomeScreen.tsx n'a plus qu'à filtrer par `horizon` et rendre, sans recalculer de logique métier. */
export function buildHomeAttentions(contacts: Contact[], pensees: Pensee[], today: Date): HomeAttention[] {
  const list: HomeAttention[] = [];
  for (const c of contacts) {
    const a = birthdayAttention(c, today);
    if (a) list.push(a);
  }
  for (const p of pensees) {
    const a = penseeAttention(p, contacts, today);
    if (a) list.push(a);
  }
  list.push(...namedayAttentions(contacts, today));
  list.push(...familyFeteAttentions(contacts, today));
  return list.sort(compareHomeAttentions);
}

/**
 * Traduit une `HomeAttentionAction` en navigation réelle — un seul endroit pour ce mapping,
 * partagé par HomeScreen.tsx (tap sur une carte) et notifications.ts (tap sur une notification),
 * pour ne pas dupliquer cette petite machine à états à deux endroits. `navigate` est volontairement
 * peu typé (juste `(name, params) => void`) pour rester utilisable aussi bien avec le hook
 * `useNavigation()` d'un écran qu'avec le `navigationRef` impérial utilisé hors composant.
 */
export function navigateToAttention(navigate: (name: string, params?: object) => void, action: HomeAttentionAction) {
  switch (action.kind) {
    case 'quiz':
      navigate('Quiz', { contactId: action.contactId });
      break;
    case 'ideas':
      // Cadeaux est une destination du RootStack, plus un onglet (voir CHANTIER ONGLET PENSÉES V1)
      // — navigation directe, plus besoin de passer par 'Tabs'.
      navigate('Cadeaux', { contactId: action.contactId });
      break;
    case 'message':
      navigate('Message', { contactId: action.contactId });
      break;
    case 'fiche':
      navigate('Fiche', { contactId: action.contactId });
      break;
    case 'calendar':
      navigate('Tabs', { screen: 'Calendrier', params: { focusDate: action.focusDate } });
      break;
  }
}
