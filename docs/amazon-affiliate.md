# Pensif — Liens d'affiliation Amazon (v1.1)

Remplace la note « Amazon Safe Beta » (septembre 2026). Mode actif depuis la v1.1 : **liens seuls**.

## 1 — Le drapeau

`EXPO_PUBLIC_AMAZON_AFFILIATE_ENABLED` (`src/lib/amazonAffiliate.ts`, `isAmazonAffiliateEnabled()`).
Valeurs `'1'` ou `'true'` uniquement : tout le reste (absente, vide, `'0'`, `'false'`, autre) = OFF.
Inliné à la compilation : il se règle dans l'environnement EAS `production` (build) ou dans `.env`
(développement local). **Un changement de drapeau exige un nouveau build**, pas une mise à jour OTA.

## 2 — Règles du programme à respecter (Licence PI, art. 2)

- Images, prix, titres et textes d'Amazon = « Contenu du Product Advertising » : réservés à l'API,
  non stockables, pas de cache. **Pensif n'en affiche ni n'en stocke aucun** (plus aucun `imageUrl`
  dans le catalogue ; test `test-regression-v1-1.ts` [7]).
- Les ASIN peuvent être stockés sans limite de durée.
- Chaque lien pointe uniquement vers la page produit Amazon.fr, jamais vers un autre site.
- Interdit : acheter via ses propres liens ou faire acheter des proches (§6(u) des règles du programme).
- Mention d'affiliation obligatoire (loi française et programme) : texte dans les Réglages
  (« En tant que Partenaire Amazon, Pensif réalise un bénéfice sur les achats remplissant les
  conditions requises. ») + politique de confidentialité. **À confirmer avec le support Amazon**
  (message du 20 octobre 2026) : suffisance de la mention dans les Réglages.

## 3 — Comportement

**Mode actif** (`GiftsScreen.tsx`, `RecommendationCard`) :
- visuel = émoji du produit ; aucune image distante, aucun prix pour un produit à lien ;
- bouton « Voir sur Amazon » = seul élément qui ouvre le lien (`Linking.openURL(amazonUrl(asin))`,
  navigateur ou app Amazon, jamais de vue web intégrée) ;
- `linkableOnly` est passé au moteur : jamais de produit sans ASIN ;
- le sélecteur d'intérêts ne propose que les thèmes avec ≥ 3 produits à lien (`visibleInterestOptions`).

**Mode inactif** : aucun lien, aucun bouton ; produits éditoriaux sans ASIN toujours possibles,
leur prix de référence reste affiché ; produits à lien sans prix.

Le lien : `https://www.amazon.fr/dp/<ASIN>?tag=pensif-21` (validé par le testeur de liens du compte
Partenaires, 19 octobre 2026).

## 4 — Prix

`gift.price` n'est qu'un **prix de repère interne** (relevé ponctuel du 11 septembre 2026) utilisé par
le moteur pour le plafond de budget et le ciblage (`budgetFitBonus`). Il n'est jamais affiché pour un
produit à lien. Statut vis-à-vis de la Licence : question posée au support Amazon ; plan B =
remplacer par des tranches de prix propres à Pensif.

## 5 — Moteur

Le moteur ne lit jamais le drapeau : l'option `linkableOnly` lui est passée par l'écran. Budget : cible
= budget choisi (115 € pour « 100 € et + »), bonus +14 à partir de 60 %, +6 de 40 à 60 % ; chaque
refus « Trop cher » abaisse la cible de 20 % (2 refus au maximum) et l'écran baisse le curseur de 25 %.

## 6 — Tests

`scripts/test-regression-amazon-safe-beta.ts` (rendu, drapeau) et `scripts/test-regression-v1-1.ts`
(produits à lien, thèmes visibles, budget, « Trop cher », questions d'affinage, mentions, langue de la
fiche, absence d'images stockées).
