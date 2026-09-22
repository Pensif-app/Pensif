# Pensif — Amazon Safe Beta (Pré-bêta Phase 1)

CHANTIER "Pré-bêta Phase 1 — Amazon Safe Beta" (2026-09-22). Prépare une bêta iOS où Amazon est
désactivé par défaut, sans toucher au catalogue (208 cadeaux, 23 thèmes, inchangés) ni au moteur de
recommandation. Aucun EAS, aucun commit/push dans cette passe.

## 1 — Le flag

```
EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED
```

Défini dans `src/lib/amazonAffiliate.ts` (`isAmazonAffiliateEnabled()`), module **pur** (aucune
dépendance react-native/expo), testable sous `npx tsx`.

**Amazon n'est jamais actif par défaut.** Règle stricte, comparaison exacte, jamais une coercition
implicite :

| Valeur de la variable | Résultat |
|---|---|
| absente | OFF |
| `''` (vide) | OFF |
| `'0'` | OFF |
| `'false'` | OFF |
| n'importe quelle autre valeur non listée ci-dessous | OFF |
| `'1'` | **ON** |
| `'true'` | **ON** |

L'activation est **volontaire et explicite uniquement** — jamais un oubli de configuration, une
variable mal orthographiée ou une valeur inattendue ne peut activer Amazon par accident.

## 2 — Comportement quand Amazon est OFF (le mode par défaut de la bêta)

Dans `GiftsScreen.tsx` (`RecommendationCard`), tout produit — **y compris un produit historique qui
possède réellement un `asin`/`imageUrl` Amazon** — se comporte exactement comme un cadeau éditorial
sans commerce (`jeux_societe`/`science`/`beaute`/`lecture.sujet`, qui n'en ont structurellement
jamais eu) :

- **Aucune image distante Amazon affichée** — repli sur l'emoji du produit (`gift.emoji`).
- **Aucun appel à `amazonUrl()`**, aucune URL construite.
- **Aucun `Linking.openURL()`** déclenché.
- **Aucun CTA/icône "ouvrir en externe"** (`Ionicons name="open-outline"`) affiché.
- **La carte n'est plus tappable vers l'extérieur** — le conteneur devient une simple `View`
  (au lieu d'un `Pressable` menant à Amazon), jamais un lien mort ni un bouton inactif-mais-visible.
- `title`/`pitch`/`price`/`why` (`whyForContact`)/like/reject : **strictement inchangés**.

## 3 — `price`

`gift.price` est le **prix de référence** utilisé par le moteur pour le filtrage budget et le
scoring (voir `src/data/giftCatalog.ts`, commentaire sur `CuratedGift.price`) — cette lecture par
`recommendationEngine.ts` est **strictement identique qu'Amazon soit ON ou OFF, et que le prix soit
affiché ou masqué à l'écran** (voir §3bis ci-dessous). Il n'est **jamais** présenté dans l'UI comme
un prix Amazon actuel ni un prix marchand garanti — aucun libellé "Amazon"/"prix marchand"/"prix
live" n'existe nulle part dans `GiftsScreen.tsx` (vérifié par recherche exhaustive, voir §5
ci-dessous).

## 3bis — Affichage du prix (CHANTIER "Pré-bêta Phase 1B — Safe Beta prix historiques", 2026-09-22)

Sur les 208 produits du catalogue, **162 ont un `asin`** (catalogue historique Amazon) et **46
n'en ont pas** (catalogue éditorial ajouté en Phases 7A-7D : jeux_societe/science/beaute/
lecture.sujet). Le prix d'un produit historique est un **snapshot marchand daté**, pas un prix
garanti actuel — voir le commentaire de provenance dans `giftCatalog.ts` : *"Chaque ASIN a été
vérifié en direct sur Amazon.fr (titre, prix, statut de stock) le 2026-09-11 — une fiche produit
peut disparaître ou passer en rupture avec le temps, à recontrôler périodiquement."*

Règle d'affichage (`showPrice` dans `GiftsScreen.tsx::RecommendationCard`) :

| Amazon | `gift.asin` | Prix affiché ? |
|---|---|---|
| OFF | présent (historique) | **Non** — snapshot daté, jamais montré sans le contexte "Voir sur Amazon" qui permettrait de le vérifier |
| OFF | absent (éditorial) | Oui — prix de référence Pensif assumé, indépendant d'Amazon |
| ON | présent ou absent | Oui — comportement historique inchangé |

Le moteur (`recommendationEngine.ts`) continue de lire `gift.price` normalement dans tous les cas
(budget/scoring/tie-break) — `showPrice` est une variable **purement UI**, jamais lue par le
moteur. Non-régression vérifiée par exécution réelle de `generateCandidates` sous contrainte
budget serrée, OFF et ON, confirmant des candidats et prix internes strictement identiques (voir
`scripts/test-regression-amazon-safe-beta.ts`, section [14]).

## 4 — Amazon ON

Le mode ON n'a **pas été modifié en profondeur** dans cette passe — il conserve exactement le
comportement déjà existant (image Amazon si présente, lien affilié `amazonUrl()`, CTA visible),
simplement désormais **derrière le flag**, pour un usage futur si la décision produit est prise de
réactiver Amazon. Aucune amélioration, aucun changement de logique côté ON.

## 5 — Périmètre exhaustif des usages Amazon (audité, aucun chemin n'échappe au flag)

Recherche exhaustive dans `src/` :

```
amazonUrl        → src/data/giftCatalog.ts (définition), src/screens/GiftsScreen.tsx (seul appelant)
AMAZON_TAG       → src/data/giftCatalog.ts (interne à amazonUrl(), jamais exposé ailleurs)
asin             → lu uniquement dans GiftsScreen.tsx pour construire le lien (désormais gaté)
imageUrl         → lu uniquement dans GiftsScreen.tsx pour l'affichage (désormais gaté)
Linking.openURL  → 2 usages dans tout le projet : GiftsScreen.tsx (Amazon, gaté) et
                    MessageScreen.tsx (WhatsApp, SANS RAPPORT avec Amazon, non touché)
open-outline     → 1 seul usage, GiftsScreen.tsx (désormais gaté par hasAmazonLink)
CTA Amazon       → aucun libellé textuel "Amazon" nulle part dans l'UI (vérifié)
```

**Un seul écran, un seul composant (`RecommendationCard`, `GiftsScreen.tsx`) concentre 100% des
usages Amazon de l'application.** Aucun autre écran, aucun autre fichier ne référence
`amazonUrl`/`asin`/`imageUrl` à des fins d'affichage commerce.

## 6 — Non-régression

- **Catalogue historique** (produits avec `asin`/`imageUrl` réels) : Amazon OFF → comportement
  identique à un cadeau éditorial sans commerce (fallback emoji, aucun lien, scoring inchangé,
  like/reject inchangés — le flag n'affecte jamais `recommendationEngine.ts`, uniquement l'affichage).
- **Nouveaux thèmes éditoriaux** (`jeux_societe`/`science`/`beaute`/`lecture.sujet`) : strictement
  inchangés — ils n'avaient de toute façon jamais de données commerce, le flag ne change rien pour
  eux.
- **Scoring/historique** : `generateCandidates`/`topRecommendations`/`feedback`/
  `recommendationHistory` ne lisent jamais `isAmazonAffiliateEnabled()` — invariant vérifié par
  lecture de code et par test dédié (voir `scripts/test-regression-amazon-safe-beta.ts`).
