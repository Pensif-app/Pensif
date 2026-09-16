// CHANTIER RÉPONSES INTELLIGENTES — Incrément 0 (2026-09-16) : contexte structuré, pur, déterministe,
// envoyé plus tard à l'Edge Function `suggest-message` (incrément 1, pas encore écrit). Ce fichier ne
// fait AUCUN appel réseau, ne dépend d'aucune décision IA, et ne connaît ni react-native ni expo — pur
// TypeScript, testable sous `npx tsx` comme searchText.ts/contactAssociation.ts.
//
// Principe fondamental (rappel de la consigne validée) : l'IA rédige UNIQUEMENT à partir de ce
// contexte. Ce module est donc le seul endroit qui décide QUELS faits existent réellement dans
// Pensif pour ce proche — jamais un fait inventé, jamais une occasion supposée.
import { Contact, Genre, InterestTag, Pensee } from './types';
import { daysUntilNext } from './calendar';
import { isQuizComplete } from './quiz';
import { isSensitiveText } from './sensitiveContentFilter';

export type MessageOccasion = 'birthday' | 'thinking_of_you' | 'event';

/** Ton demandé pour la rédaction — mêmes 3 valeurs que les chips de MessageScreen.tsx, jamais un
 *  4e choix. N'entre pas dans MessageSuggestionContext (voir plus bas) : transmis séparément à
 *  l'Edge Function (contrat `{ context, tone }`, voir suggest-message/contract.ts côté serveur). */
export type MessageTone = 'chaleureux' | 'complice' | 'court';

/**
 * Contexte propre à chaque occasion — TOUJOURS calculé côté client à partir d'une donnée déjà
 * enregistrée dans Pensif (jamais laissé à l'IA de déduire une date ou un fait). `event` est la
 * seule occasion qui peut échouer à se construire (voir `BuildMessageSuggestionContextResult`) :
 * elle exige une pensée réelle, datée, appartenant à ce contact — jamais une occasion inventée.
 */
export type MessageSuggestionOccasionContext =
  | { occasion: 'birthday'; daysUntil: number }
  | { occasion: 'thinking_of_you' }
  | { occasion: 'event'; texte: string; date: string };

export type MessageSuggestionContext = {
  contact: { prenom: string; genre: Genre | null; relation: string; familyRole: string | null };
  occasion: MessageSuggestionOccasionContext;
  /** `null` si le quiz n'est pas complet — jamais un profil partiel/deviné (voir isQuizComplete). */
  quiz: { interests: InterestTag[]; wish: string } | null;
  /**
   * Les pensées liées les plus récentes (5 max, sélection déterministe par `createdAt` — même
   * convention que le tri "mémorisées" de penseesView.ts). `optional: true` est transmis tel quel
   * jusqu'au prompt de l'Edge Function (incrément 1) : ce n'est PAS une obligation d'usage, le modèle
   * doit pouvoir n'en retenir aucune si elles ne sont pas pertinentes pour le message demandé —
   * jamais un détail personnel forcé dans le texte final.
   */
  pensees: { optional: true; items: string[] };
};

export type BuildMessageSuggestionContextResult =
  | { ok: true; context: MessageSuggestionContext }
  | {
      ok: false;
      /**
       * `event` refuse proprement plutôt que de construire un contexte partiel/halluciné :
       * - `event_missing_pensee` : aucune pensée fournie pour servir de base à l'événement.
       * - `event_pensee_missing_date` : la pensée fournie n'a pas de `date` (pas une ancre réelle).
       * - `event_pensee_wrong_contact` : la pensée fournie n'appartient pas à CE contact (garde
       *   supplémentaire — voir décision d'architecture : le futur point d'entrée transmettra un
       *   `penseeId` résolu depuis le store juste avant l'appel, jamais un objet figé passé en
       *   paramètre de navigation ; cette vérification protège contre un id résolu par erreur).
       * - `event_pensee_sensitive` : la pensée servant d'ancre à l'événement est elle-même détectée
       *   sensible (2026-09-16) — AUCUNE génération automatique n'est alors possible pour cet
       *   événement. Ni repli sur `thinking_of_you`, ni message générique en supprimant le texte : la
       *   génération est purement et simplement indisponible pour cette occasion précise. La pensée
       *   elle-même reste intacte et utilisable normalement partout ailleurs dans Pensif — ce
       *   résultat ne fait QUE dire à l'appelant que la génération n'est pas possible ici.
       */
      reason:
        | 'event_missing_pensee'
        | 'event_pensee_missing_date'
        | 'event_pensee_wrong_contact'
        | 'event_pensee_sensitive';
    };

/**
 * Construit le contexte structuré pour UNE demande de suggestion de message. Synchrone, sans effet
 * de bord, sans aucun accès réseau/store — l'appelant (futur incrément UI) est responsable de
 * résoudre `eventPensee` depuis le store à partir d'un `penseeId` juste avant l'appel.
 */
export function buildMessageSuggestionContext(
  contact: Contact,
  pensees: Pensee[],
  today: Date,
  occasion: MessageOccasion,
  eventPensee?: Pensee | null,
): BuildMessageSuggestionContextResult {
  let occasionContext: MessageSuggestionOccasionContext;
  if (occasion === 'birthday') {
    // daysUntilNext (calendar.ts) — même fonction que ContactsScreen/FicheScreen, jamais recalculée.
    occasionContext = { occasion: 'birthday', daysUntil: daysUntilNext(contact.date, today) };
  } else if (occasion === 'thinking_of_you') {
    occasionContext = { occasion: 'thinking_of_you' };
  } else {
    if (!eventPensee) return { ok: false, reason: 'event_missing_pensee' };
    if (eventPensee.contactId !== contact.id) return { ok: false, reason: 'event_pensee_wrong_contact' };
    if (!eventPensee.date) return { ok: false, reason: 'event_pensee_missing_date' };
    // Point le plus en amont possible : vérifié AVANT même de construire `occasionContext` — une
    // pensée sensible servant d'ancre event ne doit jamais atteindre ni ce contexte, ni le quiz/les
    // pensées liées qui suivent, ni a fortiori une requête réseau. Voir consigne du 2026-09-16 :
    // pas de repli thinking_of_you, pas de message générique en vidant le texte — la génération
    // automatique est simplement indisponible pour CET événement précis.
    if (isSensitiveText(eventPensee.texte)) return { ok: false, reason: 'event_pensee_sensitive' };
    occasionContext = { occasion: 'event', texte: eventPensee.texte, date: eventPensee.date };
  }

  // Filet de sécurité V1 (2026-09-16, voir sensitiveContentFilter.ts) — une pensée/wish détectée
  // sensible (santé physique/mentale, deuil, addictions, violence/abus) est retirée AVANT toute
  // sélection/tri, jamais tronquée : elle n'existe simplement pas pour cette construction de
  // contexte. La donnée elle-même n'est ni supprimée ni modifiée nulle part ailleurs dans l'app.
  const quiz = isQuizComplete(contact.quiz)
    ? { interests: contact.quiz.interests, wish: isSensitiveText(contact.quiz.wish) ? '' : contact.quiz.wish }
    : null;

  const recentPensees = pensees
    .filter((p) => p.contactId === contact.id)
    // 1. pensées liées au contact (déjà fait ci-dessus) → 2. exclusion des sensibles → 3. tri +
    // sélection des 5 plus récentes SEULEMENT ensuite (ordre exact demandé — une pensée sensible ne
    // doit jamais "prendre la place" d'une pensée ordinaire dans le quota des 5).
    .filter((p) => !isSensitiveText(p.texte))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((p) => p.texte);

  return {
    ok: true,
    context: {
      contact: { prenom: contact.prenom, genre: contact.genre, relation: contact.relation, familyRole: contact.familyRole },
      occasion: occasionContext,
      quiz,
      pensees: { optional: true, items: recentPensees },
    },
  };
}
