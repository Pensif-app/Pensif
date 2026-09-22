// CHANTIER "Pré-bêta Phase 1 — Amazon Safe Beta" (2026-09-22) — feature flag UNIQUE contrôlant tout
// affichage/lien commerce Amazon dans l'app. Module PUR (aucune dépendance react-native/expo),
// testable sous `npx tsx` comme calendar.ts/reminderRecurrence.ts.
//
// Règle absolue (voir docs/amazon-affiliate.md) : Amazon n'est JAMAIS actif par défaut. Toute valeur
// absente, vide, ou différente de '1'/'true' (comparaison stricte, jamais une coercition implicite
// type `Boolean(value)` qui traiterait n'importe quelle chaîne non-vide comme "vrai") désactive
// Amazon. Seule une activation EXPLICITE et VOLONTAIRE (`EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED=1` ou
// `=true`) l'active — jamais un oubli de configuration ne doit pouvoir l'activer par accident.
//
// `EXPO_PUBLIC_*` est le préfixe Expo officiel pour les variables d'environnement PUBLIQUES,
// inlinées au build (voir .env.example) — pas de configuration supplémentaire nécessaire côté
// app.json/babel, ce mécanisme est déjà intégré au SDK Expo utilisé par ce projet.

/** `true` UNIQUEMENT si la variable d'env vaut explicitement '1' ou 'true' — tout le reste (absente,
 *  '0', 'false', chaîne vide, valeur inattendue) est traité comme OFF. */
export function isAmazonAffiliateEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED;
  return raw === '1' || raw === 'true';
}
