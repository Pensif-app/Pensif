import { Contact } from './types';

/**
 * Terme affectueux par lien de famille — deux registres : "warm" (ex. "mon frère", utilisé dans le
 * message chaleureux, aux côtés du prénom) et "casual" (ex. "frérot", utilisé seul dans les
 * messages complice/court, à la place du prénom). Couvre les deux formes genrées de chaque lien
 * (voir FAMILY_ROLE_PAIRS dans FicheScreen.tsx) — seul celui réellement choisi pour le contact sert.
 */
const FAMILY_TERMS: Record<string, { warm: string; casual: string }> = {
  Père: { warm: 'papa', casual: 'papa' },
  Mère: { warm: 'maman', casual: 'maman' },
  Frère: { warm: 'mon frère', casual: 'frérot' },
  Sœur: { warm: 'ma sœur', casual: 'sœurette' },
  Fils: { warm: 'mon fils', casual: 'fiston' },
  Fille: { warm: 'ma fille', casual: 'ma puce' },
  'Grand-père': { warm: 'papy', casual: 'papy' },
  'Grand-mère': { warm: 'mamie', casual: 'mamie' },
  Oncle: { warm: 'tonton', casual: 'tonton' },
  Tante: { warm: 'tatie', casual: 'tata' },
  Cousin: { warm: 'mon cousin', casual: 'cousin' },
  Cousine: { warm: 'ma cousine', casual: 'cousine' },
};

/** null si le contact n'est pas de la famille, ou si son lien précis n'a pas de terme dédié
 *  (ex. "Autre").
 *
 *  CHANTIER "Pré-TestFlight Phase 4C — Messages relation-aware" (2026-09-22) — décision explicite :
 *  `relation = 'Couple'` (Partenaire/Petit ami/Petite amie/Fiancé/Fiancée/Mari/Épouse, voir
 *  FicheScreen.tsx Phase 4B) reste volontairement HORS de FAMILY_TERMS, scope INCHANGÉ (`!==
 *  'Famille'` ci-dessous continue de couvrir Couple comme Ami/Autres). Ces templates statiques
 *  n'ont aucun moyen de savoir comment l'utilisateur appelle réellement son/sa partenaire — y
 *  injecter un surnom générique ("mon amour", "chéri(e)", "bébé", "cœur") serait une INVENTION, pas
 *  une donnée connue (même principe que le prompt IA, voir suggest-message/prompt.ts §10 : ne
 *  jamais inventer la nature/le degré d'une relation ni ce qui en découle). Le repli déjà existant
 *  (prénom seul, `term` → null) reste donc le comportement pour Couple, identique à Ami/Autres —
 *  aucun changement de code n'était nécessaire ici, uniquement cette clarification. */
function familyTerm(contact: Pick<Contact, 'relation' | 'familyRole'>, style: 'warm' | 'casual'): string | null {
  if (contact.relation !== 'Famille' || !contact.familyRole) return null;
  return FAMILY_TERMS[contact.familyRole]?.[style] ?? null;
}

export const messageTemplates: Record<'chaleureux' | 'complice' | 'court', (contact: Contact) => string> = {
  chaleureux: (contact) => {
    const term = familyTerm(contact, 'warm');
    return term
      ? `Joyeux anniversaire ${contact.prenom} ! J'espère que cette nouvelle année t'apporte plein de belles surprises, ${term}. Gros bisous 🎂❤️`
      : `Joyeux anniversaire ${contact.prenom} ! J'espère que cette nouvelle année t'apporte plein de belles surprises. Gros bisous 🎂❤️`;
  },
  complice: (contact) => {
    const term = familyTerm(contact, 'casual');
    return term
      ? `Bon alors officiellement t'as un an de plus aujourd'hui ${term} 😄 Joyeux anniv, profite bien de ta journée !`
      : `Bon alors officiellement t'as un an de plus aujourd'hui 😄 Joyeux anniv ${contact.prenom}, profite bien de ta journée !`;
  },
  court: (contact) => {
    const term = familyTerm(contact, 'casual');
    return term
      ? `Joyeux anniversaire ${term} 🎉 Grosse pensée pour toi aujourd'hui !`
      : `Joyeux anniversaire ${contact.prenom} 🎉 Grosse pensée pour toi aujourd'hui !`;
  },
};
