// Pur (aucun import react-native/expo) pour rester testable sous ts-node — voir
// scripts/test-regression-contacts-fiche.ts.

/**
 * Params à appliquer quand l'utilisateur presse DIRECTEMENT une icône de la tab bar (par
 * opposition à une navigation contextuelle depuis un autre écran, ex. Fiche → "Voir les pensées").
 * Pour "Pensées", ça réinitialise explicitement le filtre `contactId` éventuel : React Navigation
 * conserve par défaut les derniers params d'un onglet quand on y revient (comportement normal des
 * navigateurs à onglets) — sans ce reset, l'utilisateur resterait "coincé" sur le filtre d'un proche
 * après être passé par sa Fiche puis avoir simplement retapé l'onglet (voir CHANTIER PROCHES + FICHE
 * V1, §9). Le filtre reste donc un contexte de navigation ponctuel, jamais un état persistant.
 */
export function paramsForTabPress(routeName: string): { contactId: undefined } | undefined {
  if (routeName === 'Pensées') return { contactId: undefined };
  return undefined;
}
