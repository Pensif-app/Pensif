// CHANTIER "Index alphabétique Proches" (2026-09-27) — logique PURE de la barre de raccourcis A-Z
// de ContactsScreen.tsx, extraite ici (aucun import react-native) pour être testable directement
// sous tsx — voir scripts/test-regression-contacts-alphabet-index.ts.

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * CORRECTIF (2026-09-27) — dernier bug restant du chantier : le tap initial (`onPanResponderGrant`)
 * utilisait `nativeEvent.locationY`, une coordonnée relative à L'ENFANT (`<Text>`) effectivement
 * touché sous le doigt, pas à toute la barre — ce qui expliquait "tap sur W → atterrit sur A/B/C"
 * (le drag, lui, fonctionnait car `onPanResponderMove` réutilisait la même géométrie de proche en
 * proche). Remplacé par une conversion UNIQUE, basée sur une coordonnée ÉCRAN absolue
 * (`gestureState.y0`/`moveY`) et la géométrie RÉELLEMENT MESURÉE du wrapper A-Z entier
 * (`measureInWindow`, jamais une hauteur de police supposée) — la même fonction sert au tap ET au
 * glisser, la hauteur mesurée divisée en 26 tranches égales.
 */
export function letterFromScreenY(screenY: number, geometry: { pageY: number; height: number }): string | null {
  const { pageY, height } = geometry;
  if (height <= 0) return null;
  const relativeY = Math.max(0, Math.min(height - 0.001, screenY - pageY));
  const index = Math.floor((relativeY / height) * ALPHABET.length);
  return ALPHABET[Math.max(0, Math.min(ALPHABET.length - 1, index))];
}

/**
 * Résolution lettre -> section alphabétique. `alphaSections` est TOUJOURS la liste alphabétique
 * seule (jamais les favoris) : Favoris ne doit jamais entrer dans ce calcul (CHANTIER §3-4-9,
 * 2026-09-27). Stratégie lettre absente : la prochaine lettre disponible après elle, sinon la
 * dernière disponible avant elle (jamais un retour au tout début de la liste).
 */
export function resolveAlphaSection<S extends { title: string }>(alphaSections: S[], letter: string): S | undefined {
  if (alphaSections.length === 0) return undefined;
  return alphaSections.find((s) => s.title >= letter) ?? alphaSections[alphaSections.length - 1];
}

/**
 * CHANTIER "Index alphabétique Proches" §correctif final (2026-09-27) — `scrollToLocation()` s'est
 * avéré peu fiable dans notre configuration (device confirmé : RAW/DEV via scrollToLocation
 * atterrissaient dans les Favoris, alors que `getScrollResponder().scrollTo({y})` avec un offset
 * mesuré réel fonctionne). Résolution lettre -> offset Y réel mesuré (jamais un offset supposé,
 * jamais 0 par défaut) : `undefined` si la section n'a pas encore été mesurée — le code appelant
 * (ContactsScreen) ne doit alors RIEN faire, jamais un repli vers 0 ou vers les Favoris.
 */
export function resolveTargetY<S extends { title: string }>(
  alphaSections: S[],
  letter: string,
  offsetsByTitle: Record<string, number>,
): number | undefined {
  const section = resolveAlphaSection(alphaSections, letter);
  if (!section) return undefined;
  const y = offsetsByTitle[section.title];
  return typeof y === 'number' ? y : undefined;
}
