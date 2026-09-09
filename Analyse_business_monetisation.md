# Analyse business & monétisation — App anniversaire + cadeaux (Pensif)

*Recherche réalisée le 16 août 2026*

## Résumé exécutif

*Note sur cette version : la première version de ce document utilisait un forfait de coûts de 3 000 €/an non sourcé (juste une estimation à la louche). Cette version le remplace par les coûts réels que tu as communiqués (Supabase, comptes développeur, marque, domaine, abonnement Claude) et par un coût d'API LLM de production calculé à partir du tarif public de Claude Haiku — voir détail et sources en section 3. Elle ajoute aussi une section 5 qui détaille pourquoi le taux de conversion est le levier le plus important à mesurer, avec la décomposition en tunnel et une analyse de sensibilité (onglet "Sensibilité" du fichier Excel).*

L'affiliation e-commerce généraliste (Amazon, Cdiscount) et l'affiliation fleuristes/chocolatiers (Interflora, Euroflorist, 123fleurs) sont toutes accessibles en libre-service ou sur simple candidature, sans négociation lourde — ce point du business plan est donc confirmé. Les taux de commission réels sont modestes (grossièrement 3 à 9 % selon la catégorie et le partenaire) et le revenu par utilisateur qui en découle est faible en valeur absolue : de l'ordre de 0,77 € à 2,76 € par utilisateur actif et par an selon le scénario.

Côté dépenses, avec les coûts réels d'un lancement solo (Supabase ~276 €/an, compte développeur Apple ~91 €/an — coûts récurrents totaux ~367 €/an — plus des coûts uniques de lancement d'environ 213 € pour le compte Google Play et le dépôt de marque), le seuil de rentabilité tombe à **environ 135 à 504 utilisateurs actifs** selon le scénario de conversion retenu (recurrent seul), ou 213 à 797 en comptant les coûts de lancement la première année. C'est un volume très faible — la rentabilité de base n'est donc quasiment pas un risque pour ce projet.

La vraie question n'est donc pas "est-ce rentable ?" (oui, très vite et à très peu d'utilisateurs) mais "à quelle échelle ça devient un revenu qui compte ?". C'est là que revient le point central du verdict initial : le business model n'est pas le risque principal (il est validé ailleurs, chez Giftful/GiftList), mais la **conversion réelle des rappels d'anniversaire en achats** est l'inconnue qui pèse le plus lourd sur le profit net à volume d'utilisateurs égal — c'est elle qu'il faut mesurer en priorité, avant même d'aller chercher l'échelle.

Un fichier Excel interactif accompagne ce document (`Pensif_modele_rentabilite.xlsx`) : toutes les hypothèses (panier moyen, taux de conversion, commissions, coûts poste par poste, coût variable API) y sont modifiables en cellules bleues, et les totaux se recalculent automatiquement.

## 1. Programmes d'affiliation identifiés

| Programme | Plateforme | Commission indiquée | Cookie | Inscription |
|---|---|---|---|---|
| **Amazon Partenaires** | Directe (Amazon Associates) | Jusqu'à 12 % annoncé ; barème détaillé par catégorie non public — la plupart des catégories cadeaux (maison, jouets, mode, beauté) tournent plutôt autour de 3-4 % par recoupement | Non confirmé (à vérifier sur la console partenaire) | Libre, gratuite, sans frais |
| **Cdiscount** | Awin | Jusqu'à 6-8 % selon catégorie : high-tech ~2-3 %, maison ~2,5-3,5 %, loisirs ~3-4 %, mode ~4-5 % | 7 jours | Candidature via Awin (validation requise) ; paiement min. 20 € |
| **Interflora** | TimeOne | CPA ~9 % (cashback) / 4,5 % sur la gamme "petit prix" ; 8 € forfaitaire sur le segment deuil (non pertinent ici) | Non précisé | Contact direct : interflora@timeonegroup.com |
| **Euroflorist / Telefleurs** | Tradedoubler | Non publié — "free & easy to apply" | Non précisé | Candidature sur Tradedoubler |
| **123fleurs** | Programme propre | Non publié — sur demande | Non précisé | Contact service affiliation (03 79 33 67 09) |
| **Chocolatiers** (Léonidas, Jeff de Bruges…) | — | Aucun programme structuré identifié en libre-service | — | Prise de contact directe probable, ou passage par un réseau généraliste (Awin/TimeOne/Effinity) |

**Ce que ça change pour le projet** : le volet fleurs/chocolat, présenté dans le concept comme un levier fort de monétisation "jour J", est en réalité le moins mûr en libre-service — les taux exacts pour Euroflorist et 123fleurs ne sont pas publics et nécessitent un contact direct, et le chocolat n'a pas de programme d'affiliation prêt à l'emploi identifié. Le démarrage réaliste passe donc par Amazon + Cdiscount (rapides à activer) en attendant de négocier les partenariats fleuristes/chocolatiers.

## 2. Calibrage du panier moyen

Pour dimensionner le modèle, budgets cadeau d'anniversaire observés en France :

| Lien avec la personne | Budget observé |
|---|---|
| Ami proche | ~50 € |
| Famille proche (parents, fratrie) | 50-150 € |
| Connaissance | ~20 € |
| Collègue (cagnotte collective) | 10-20 € |
| Moyenne globale tous liens confondus | ~35 € |
| Anniversaires marquants (18, 30, 50 ans) | x2 le budget habituel |

L'app ciblant des contacts sur lesquels l'utilisateur connaît 3 réponses personnelles (donc plutôt des proches, pas de simples collègues), un panier moyen de **40 €** a été retenu dans le modèle — cohérent avec la fourchette ami proche/famille.

## 3. Modèle de rentabilité (voir fichier Excel joint)

**Revenu** : Revenu par utilisateur actif/an = contacts suivis × taux de conversion × panier moyen × commission moyenne pondérée

Avec commission pondérée = 60 % des achats via généraliste (4 %) + 40 % via fleuriste/chocolat (6 %) = **4,8 %** :

| Scénario | Taux de conversion | Revenu / utilisateur actif / an | Coût variable API LLM | Marge nette / utilisateur / an |
|---|---|---|---|---|
| Pessimiste | 5 % | 0,77 € | 0,04 € | 0,73 € |
| Médian | 10 % | 1,54 € | 0,04 € | 1,50 € |
| Optimiste | 18 % | 2,76 € | 0,04 € | 2,72 € |

**Coûts, poste par poste** (repris de tes chiffres réels + recherche sourcée, corrige la première version qui utilisait un forfait de 3 000 €/an non justifié) :

| Poste | Type | Montant | Détail / source |
|---|---|---|---|
| Hébergement Supabase (plan Pro) | Annuel | 276 € | 25 $/mois × 12 (conversion ~0,92 €/$). Quota inclus jusqu'à 100 000 utilisateurs actifs/mois — largement suffisant à ce stade |
| Compte développeur Apple (App Store) | Annuel | 91 € | 99 $/an, nécessaire seulement à partir de la publication sur iOS |
| Compte développeur Google Play | Unique | 23 € | 25 $, paiement unique — pas un coût annuel |
| Dépôt de marque INPI (1 classe) | Unique | 190 € | Tarif officiel INPI 2026 pour une classe (proche de ton estimation de 200 €), uniquement si le projet va au bout |
| Nom de domaine | Annuel | 0 € | Non prévu pour l'instant. Si ajouté : ~10-15 €/an pour un nom seul (à distinguer d'un abonnement site type Wix/Squarespace ~12 €/mois) |
| Abonnement Claude (usage dev perso) | Annuel | 0 € | Déjà payé, mutualisé avec tes autres projets — coût marginal nul sur ce projet |
| **TOTAL coûts fixes annuels récurrents** | | **367 €** | Supabase + compte développeur Apple |
| **TOTAL coûts uniques de lancement** | | **213 €** | Compte Google Play + dépôt de marque |
| Coût variable API LLM de production | par utilisateur/an | 0,04 € | Voir calcul ci-dessous |

**Sur le coût "IA"** — la question méritait d'être creusée plutôt que devinée. L'abonnement Claude que tu payes déjà (21,60 €/mois) sert à coder avec Claude Code : c'est un usage personnel, il ne couvre pas les appels que l'app fera en production pour interpréter les 3 réponses de chaque contact et proposer un cadeau. Ces appels-là passeront par une API facturée à l'usage (Claude Haiku, le modèle le moins cher de la gamme : 1 $/million de tokens en entrée, 5 $/million en sortie, tarif public août 2026). En estimant ~16 appels par utilisateur et par an (8 contacts × 1 interprétation initiale + 1 rafraîchissement annuel de la recommandation), chaque appel faisant ~1 000 tokens en entrée et ~300 en sortie, ça donne environ **0,04 €/utilisateur/an** — donc effectivement quasi négligeable, ton intuition était juste. Ce montant grossira surtout si les prompts deviennent plus lourds (gros catalogue produit inclus dans chaque appel) ou si tu passes à un modèle plus cher.

### Profit net annuel selon la taille de la base d'utilisateurs actifs

| Utilisateurs actifs | Pessimiste | Médian | Optimiste |
|---|---|---|---|
| 500 | -3 € | 381 € | 995 € |
| 1 000 | 361 € | 1 129 € | 2 358 € |
| 5 000 | 3 273 € | 7 113 € | 13 257 € |
| 10 000 | 6 913 € | 14 593 € | 26 881 € |
| 50 000 | 36 033 € | 74 433 € | 135 873 € |
| 100 000 | 72 433 € | 149 233 € | 272 113 € |

### Seuil de rentabilité (utilisateurs actifs nécessaires)

| Scénario | Coûts annuels récurrents seuls | Année 1 (+ coûts uniques de lancement) |
|---|---|---|
| Pessimiste (conversion 5 %) | ~504 | ~797 |
| Médian (conversion 10 %) | ~245 | ~388 |
| Optimiste (conversion 18 %) | ~135 | ~213 |

*Ces volumes concernent des utilisateurs **actifs** (qui suivent des contacts et achètent via l'app), pas des installations. Le taux d'usage réel (actifs / installations) réduira d'autant le volume d'installations nécessaire — variable non modélisée ici car dépendante du produit final.*

## 4. Enseignements clés

Avec des coûts réels aussi bas, la rentabilité de base n'est quasiment plus un sujet : le seuil se situe entre 135 et 504 utilisateurs actifs (367 à 797 la première année en comptant marque + Google Play). Le vrai enjeu se déplace donc entièrement vers l'ampleur du profit une fois ce seuil dépassé, qui reste modeste (quelques milliers d'euros/an) tant que la base reste sous 10 000 utilisateurs actifs.

Le taux de conversion "rappel → achat via lien affilié" reste le levier qui pèse le plus lourd sur le profit net (à 10 000 utilisateurs actifs, le profit varie de 6 913 € à 26 881 € entre pessimiste et optimiste, un facteur ~3,9), bien plus que le taux de commission (qui varie de façon plus resserrée, 3 à 9 %) ou que les coûts (367 €/an, quasi fixes). C'est un signal fort en faveur de la recommandation du verdict initial : prototyper d'abord la qualité du matching goûts → cadeau, car c'est probablement le principal levier de ce taux de conversion — un rappel accompagné d'une reco pertinente convertira mieux qu'un rappel accompagné d'un lien générique.

Le seuil de rentabilité étant désormais très bas, le mécanisme de croissance virale natif (partage de fiche contact entre proches), identifié comme point critique non tranché dans le cadrage initial, devient un pur levier de croissance du profit plutôt qu'une condition de survie du projet — même une adoption lente et organique suffit à passer dans le vert.

Les taux de commission restent des estimations construites par recoupement de sources publiques (blogs spécialisés, pages Awin) plutôt que des barèmes officiels confirmés au cas par cas — avant de construire un business plan définitif, il faudra ouvrir un compte Amazon Partenaires et Awin/Cdiscount pour lire les grilles exactes, et contacter directement Interflora/Euroflorist/123fleurs pour objectiver leurs taux réels. Le coût variable API LLM, lui, est désormais sourcé sur le tarif public Claude Haiku, mais reste à recalibrer avec la consommation réelle du MVP (nombre d'appels et taille des prompts effectifs).

## 5. Approfondissement — pourquoi le taux de conversion domine tout le reste

### Ce n'est pas qu'il "pèse plus" mathématiquement — c'est que sa fourchette d'incertitude est bien plus large

Le revenu du modèle est un simple produit de 4 facteurs : contacts suivis × taux de conversion × panier moyen × commission. Mathématiquement, ces 4 facteurs sont interchangeables — une variation de +10 % sur n'importe lequel des quatre augmente le revenu d'environ +10 %, à facteurs constants. Le taux de conversion n'a donc pas un pouvoir "plus fort" point par point que la commission ou le panier moyen.

Ce qui le distingue, c'est l'ampleur de sa fourchette *plausible*. Le panier moyen est calé sur des enquêtes réelles de budget cadeau (20 € à 100-150 €, un facteur ~5 à 7,5). La commission est bornée par les programmes d'affiliation identifiés dans ce document (2 % à 9 %, un facteur ~4,5) — et c'est un levier externe : tu ne la fixes pas, le programme la fixe. Le taux de conversion, lui, n'a **aucune donnée réelle** derrière lui (le produit n'existe pas encore), et j'ai dû le fixer entre 5 % et 18 % à vue de nez — un facteur ~3,6 dans le modèle, mais qui pourrait honnêtement être bien plus large dans la réalité (voir plus bas). En plus d'être la plus incertaine, c'est la seule des quatre variables que la qualité du produit (matching + UX) peut réellement faire bouger — la commission et le panier moyen sont largement hors de ton contrôle.

L'onglet "Sensibilité" du fichier Excel isole chaque levier un par un (à 10 000 utilisateurs actifs, les 3 autres paramètres fixés à leur valeur médiane) :

| Levier | Fourchette testée | Profit annuel — bas | Profit annuel — haut | Écart |
|---|---|---|---|---|
| Taux de conversion | 1 % → 25 % | 769 € | 37 633 € | 36 864 € |
| Commission moyenne | 2 % → 9 % | 5 633 € | 28 033 € | 22 400 € |
| Panier moyen | 20 € → 100 € | 6 913 € | 37 633 € | 30 720 € |
| Contacts/utilisateur | 4 → 15 | 6 913 € | 21 120 € | 14 207 € |

Le panier moyen produit un écart en euros comparable à celui du taux de conversion dans ce tableau — ce qui confirme justement le point mathématique ci-dessus (à fourchette relative comparable, l'effet en euros est comparable). La vraie différence n'est donc pas visible dans ce tableau seul : elle est dans le fait que la fourchette du panier moyen est ancrée dans des données d'enquête réelles, alors que celle du taux de conversion est une pure hypothèse produit — c'est la confiance qu'on peut avoir dans chaque fourchette qui diffère, pas seulement son amplitude.

### Ce que "taux de conversion" recouvre concrètement : un tunnel à 4 étages

"Le rappel se transforme en achat" n'est pas un seul événement, c'est un enchaînement d'étapes qui se multiplient entre elles :

1. **Le rappel est vu** — l'utilisateur ouvre l'app ou la notification au bon moment (pas trop tôt, pas trop tard)
2. **La recommandation est consultée** — l'utilisateur regarde ce que l'app propose pour ce contact
3. **L'utilisateur clique sur le lien affilié** — c'est le moment où la pertinence de la reco se joue vraiment
4. **L'achat est complété via ce lien, dans la fenêtre du cookie** — pas juste "un cadeau est acheté quelque part", mais acheté *via le lien tracké*, et à temps (le cookie Cdiscount ne dure que 7 jours, par exemple — voir section 1)

Le taux de conversion global du modèle est le produit de ces 4 probabilités. C'est pour ça qu'il est si volatil : une petite amélioration à chaque étage se multiplie avec les autres. Des benchmarks généralistes d'affiliation donnent une idée des ordres de grandeur du seul dernier étage (clic → achat) : en moyenne 1 à 3 %, jusqu'à 5-10 % pour du contenu très pertinent, et la pertinence du produit recommandé peut à elle seule faire grimper la conversion de jusqu'à +80 % par rapport à une offre générique. Si on compose un tunnel plausible avec ces seuls repères — par exemple 60 % qui voient le rappel, 85 % qui consultent la reco, 30 % qui cliquent, 8 % qui achètent parmi ceux qui cliquent (déjà en haut de la fourchette affiliation) — on obtient un taux global d'environ 1,2 %, en dessous du scénario "pessimiste" à 5 % retenu dans ce modèle.

Cela veut dire deux choses à la fois. D'un côté, le vrai plancher de ce modèle pourrait être plus bas que ce qui a été modélisé — les benchmarks affiliation génériques sont plus sévères que l'hypothèse pessimiste retenue. De l'autre, ces benchmarks concernent du trafic froid (quelqu'un clique sur un lien dans un article ou chez un influenceur, sans intention d'achat préalable), alors que dans ton app l'utilisateur a déjà décidé d'acheter un cadeau pour cette personne précise — l'app ne crée pas l'intention d'achat, elle essaie de capter une intention qui existe déjà. C'est structurellement plus favorable qu'un lien d'affiliation classique, mais ça reste à prouver : le concurrent le plus proche (Cal&Gift) a fermé, et aucune donnée d'usage n'existe sur ce cas précis. C'est un vrai inconnu produit, pas une question de recherche — impossible à trancher sans le tester avec de vrais utilisateurs.

### Ce que ça implique concrètement

Comme ce levier ne peut pas être davantage précisé par de la recherche (il n'y a pas de produit comparable avec assez de recul), la priorité reste de construire la version la plus petite possible du tunnel rappel → recommandation → achat et de mesurer chacune de ses 4 étapes avec de vrais utilisateurs, avant d'investir du temps dans la négociation de partenariats exclusifs ou dans un mécanisme de croissance — ces deux derniers points n'ont d'intérêt que si le tunnel de conversion fonctionne déjà.

## 6. Prochaines étapes suggérées

Ouvrir un compte Amazon Partenaires et Awin (accès gratuit et rapide) pour lire les grilles de commission exactes par catégorie de produit pertinente pour des cadeaux. Contacter TimeOne (Interflora), Tradedoubler (Euroflorist) et le service affiliation 123fleurs pour obtenir leurs taux réels et évaluer un éventuel partenariat exclusif à plus forte marge. Réfléchir à un mécanisme de mesure du taux de conversion dès le MVP (même avec un petit panel d'utilisateurs test), puisque c'est la variable qui déterminera si le modèle est viable en solo ou nécessite une base d'utilisateurs plus large qu'anticipé.

---

**Sources** :
- [Notre avis sur Amazon Partenaires en 2026 — lafabriquedunet.fr](https://www.lafabriquedunet.fr/logiciel/amazon-partenaires)
- [Cdiscount : programme d'affiliation, commission & inscription — freudix.studio](https://freudix.studio/programmes-affiliation/cdiscount)
- [Awin — profil marchand Cdiscount FR](https://ui.awin.com/merchant-profile/6948)
- [Interflora — page affiliation](https://www.interflora.fr/affiliation)
- [TimeOne Performance — programme affiliation Interflora](https://performance.timeonegroup.com/fr/editeurs/programme/affiliation-interflora-1582.html)
- [Euroflorist / Telefleurs — programme d'affiliation](https://www.euroflorist.fr/en/programme-daffiliation-cn935)
- [Tradedoubler — annuaire programme Euroflorist](https://directory.tradedoubler.com/en/programs/239139-Euroflorist)
- [123fleurs — programme d'affiliation rémunéré](https://www.123fleurs.com/infos/affiliation)
- [Budget cadeau anniversaire — profitrama.com](https://www.profitrama.com/budget-cadeau-anniversaire/)
- [Quel montant pour un anniversaire — poupala.fr](https://www.poupala.fr/quel-montant-pour-un-anniversaire/)
- [Claude API Pricing (août 2026) — benchlm.ai](https://benchlm.ai/anthropic/api-pricing)
- [Supabase Pricing 2026 — nocode.mba](https://www.nocode.mba/articles/supabase-pricing)
- [Prix dépôt de marque INPI 2026 — legalplace.fr](https://www.legalplace.fr/guides/prix-depot-marque-inpi/)
- [Affiliate Conversion Statistics: Rates, Benchmarks & Optimization (2026) — wecantrack.com](https://wecantrack.com/insights/affiliate-conversion-statistics/)
- [Push Notifications Statistics (2026) — Business of Apps](https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/)
