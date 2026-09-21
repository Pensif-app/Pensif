import { InterestTag } from './types';
import { INTEREST_OPTIONS } from './quiz';

export type ThemeQuestion = {
  /** Clé de réponse, unique dans le thème (namespaced par thème dans quiz.themeAnswers). */
  id: string;
  /** Supporte {prenom}/{il}/{Il}/{lui}/{son} comme formatQuizText. */
  prompt: string;
  type: 'choice' | 'text';
  /** Requis pour type 'choice'. */
  options?: { key: string; label: string }[];
  /** CHANTIER "Quiz Cadeaux V2 — Phase 1" (2026-09-21) — sous-texte d'exemple affiché en
   *  placeholder pour une question `type:'text'` (ex. "Ex. Pokémon, Zelda, Star Wars…") : rend la
   *  question concrète sans promettre qu'une saisie produira nécessairement un produit
   *  correspondant (voir consigne §7 — reformulations légères). Optionnel, retombe sur "Facultatif"
   *  si absent (voir ThemeAffinage.tsx). */
  placeholder?: string;
  /** N'affiche cette question que si une réponse précédente du même thème correspond — permet un
   *  branchement conditionnel (ex. musique : "il joue" → question instrument, "il écoute" →
   *  question contexte d'écoute). */
  when?: { questionId: string; oneOf: string[] };
};

export type ThemeQuizConfig = {
  theme: InterestTag;
  questions: ThemeQuestion[];
};

// Question commune réutilisée par tous les thèmes dédiés ci-dessous : un texte libre facultatif
// en fin d'arbre, le signal le plus précis (recherché mot à mot dans les titres produits — voir
// TEXT_ANSWER_IDS dans recommendationEngine.ts).
function detailQuestion(label: string): ThemeQuestion {
  return { id: 'detail', prompt: `Un détail précis sur ce qu'{il} aime en ${label.toLowerCase()} ?`, type: 'text' };
}

/**
 * Arbres de questions dédiés — architecture volontairement déclarative (pas de logique hardcodée
 * dans les composants UI) : ThemeAffinage.tsx se contente de lire cette config et de rendre les
 * questions génériquement. Ajouter un nouveau thème dédié = ajouter une entrée ici, rien d'autre.
 * Les 20 thèmes ont maintenant chacun leur propre taxonomie (3-5 dimensions propres au thème, voir
 * `taxonomy` dans giftCatalog.ts) plutôt que les anciennes clés génériques passion/depth/style —
 * gaming/musique portent en plus de vrais filtres durs (`when` + `hardRequirements`, voir plan de
 * refonte "moteur de réduction progressive" phases 1 et 2).
 */
const DEDICATED_QUIZZES: Partial<Record<InterestTag, ThemeQuizConfig>> = {
  gaming: {
    theme: 'gaming',
    questions: [
      {
        // Filtre DUR : élimine tout accessoire exclusif à une autre plateforme (voir
        // hardRequirements dans giftCatalog.ts, ex. manette DualSense, cartes cadeaux).
        id: 'platform',
        prompt: '{Il} joue principalement sur quoi ?',
        type: 'choice',
        options: [
          { key: 'pc', label: 'PC' },
          { key: 'playstation', label: 'PlayStation' },
          { key: 'xbox', label: 'Xbox' },
          { key: 'nintendo', label: 'Nintendo' },
          { key: 'mobile', label: 'Mobile' },
          { key: 'autre', label: 'Autre' },
        ],
      },
      {
        // CHANTIER "Phase 4C — nettoyage quiz pré-bêta" (2026-09-21) : 'confort'/'multijoueur'
        // retirés — 0 produit catalogue ne les recoupe positivement, et ils ne faisaient que
        // pénaliser (via TAXONOMY_CONFLICTS) les produits 'setup' sans jamais pouvoir proposer
        // d'alternative positive (voir audit Phase 4B §1c/§2). Réintroduire uniquement si le
        // catalogue gagne des produits qui les recoupent réellement.
        id: 'focus',
        prompt: 'Pour son univers gaming, {il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'setup', label: 'Améliorer son setup' },
          { key: 'fandom', label: 'Quelque chose lié à ses jeux préférés' },
        ],
      },
      {
        // N'a de sens que pour "améliorer son setup" — un niveau d'équipement ne s'applique pas à
        // une carte cadeau fandom ni à une question de confort/multijoueur (voir audit Phase 3A :
        // fandom × equipmentLevel n'est pas un trou catalogue, c'est une combinaison non pertinente).
        id: 'equipmentLevel',
        prompt: 'Son setup est…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Assez simple' },
          { key: 'intermediaire', label: 'Correctement équipé' },
          { key: 'avance', label: 'Déjà très équipé' },
        ],
        when: { questionId: 'focus', oneOf: ['setup'] },
      },
      {
        id: 'social',
        prompt: '{Il} joue plutôt…',
        type: 'choice',
        options: [
          { key: 'solo', label: 'Seul' },
          { key: 'amis', label: 'Avec ses amis' },
          { key: 'both', label: 'Les deux' },
        ],
      },
      {
        id: 'favorite',
        prompt: 'Tu connais un jeu, une licence ou un univers qu’{il} adore ?',
        type: 'text',
        placeholder: 'Ex. un jeu, une licence ou un univers précis…',
      },
    ],
  },

  cuisine: {
    theme: 'cuisine',
    questions: [
      {
        id: 'rapport',
        prompt: '{Il} préfère…',
        type: 'choice',
        options: [
          { key: 'cuisiner', label: 'Cuisiner' },
          { key: 'deguster', label: 'Déguster / découvrir' },
          { key: 'les-deux', label: 'Les deux' },
        ],
      },
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'bbq'/'apero'/'cuisine-du-monde' retirés — 0 produit
        // catalogue ne les recoupe, et 'univers' n'est pas une dimension à conflit (voir
        // TAXONOMY_CONFLICTS.cuisine, qui ne couvre que 'preference') donc ces valeurs étaient
        // strictement décoratives (audit Phase 4B §1c).
        id: 'univers',
        prompt: 'Son univers cuisine préféré ?',
        type: 'choice',
        options: [
          { key: 'patisserie', label: 'Pâtisserie' },
          { key: 'cafe', label: 'Café' },
          { key: 'quotidien', label: 'Cuisine du quotidien' },
          { key: 'gastronomie', label: 'Gastronomie' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'En cuisine, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'passionne', label: 'Une vraie passion' },
        ],
      },
      {
        id: 'preference',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'outil', label: 'Un bon outil du quotidien' },
          { key: 'decouverte', label: 'Une découverte à tester' },
          { key: 'upgrade', label: 'Un upgrade de son équipement' },
          { key: 'convivial', label: 'Quelque chose à partager' },
        ],
      },
      detailQuestion('Cuisine'),
    ],
  },

  musique: {
    theme: 'musique',
    questions: [
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'concerts' retiré — 0 produit catalogue ne le
        // recoupe (voir audit Phase 4B §1c) ; 'ecoute'/'jouer'/'both' restent, seules valeurs
        // réellement exploitées (bonus positif ET conflit ecoute↔jouer, voir TAXONOMY_CONFLICTS).
        id: 'mode',
        prompt: '{Il} préfère…',
        type: 'choice',
        options: [
          { key: 'ecoute', label: 'Écouter de la musique' },
          { key: 'jouer', label: 'Jouer de la musique' },
          { key: 'both', label: 'Les deux' },
        ],
      },
      {
        // Q2A : uniquement si "écoute" (seul ou en plus de jouer) fait partie de la réponse.
        id: 'context',
        prompt: '{Il} écoute surtout…',
        type: 'choice',
        options: [
          { key: 'maison', label: 'Chez lui' },
          { key: 'deplacement', label: 'En déplacement' },
          { key: 'partout', label: 'Partout' },
        ],
        when: { questionId: 'mode', oneOf: ['ecoute', 'both'] },
      },
      {
        // Q2B : uniquement si "joue" fait partie de la réponse — question instrument, pas contexte d'écoute.
        id: 'instrument',
        prompt: '{Il} joue de quel instrument ?',
        type: 'choice',
        options: [
          { key: 'guitare', label: 'Guitare' },
          { key: 'piano', label: 'Piano / clavier' },
          { key: 'chant', label: 'Chant' },
          { key: 'autre', label: 'Autre instrument' },
        ],
        when: { questionId: 'mode', oneOf: ['jouer', 'both'] },
      },
      {
        id: 'format',
        prompt: 'Son univers est plutôt…',
        type: 'choice',
        options: [
          { key: 'streaming', label: 'Streaming' },
          { key: 'vinyle', label: 'Vinyle' },
          { key: 'cd', label: 'CD' },
          { key: 'concerts', label: 'Concerts' },
        ],
      },
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'experience' retiré — 0 produit catalogue ne le
        // recoupe (voir audit Phase 4B §1c).
        id: 'preference',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'son', label: 'Un meilleur son' },
          { key: 'pratique', label: 'De quoi pratiquer' },
          { key: 'fandom', label: 'Quelque chose lié à son artiste préféré' },
        ],
      },
      {
        id: 'favorite',
        prompt: 'Tu connais son artiste ou son genre préféré ?',
        type: 'text',
        placeholder: 'Ex. un artiste, un groupe ou un style qu’il adore…',
      },
    ],
  },

  tech: {
    theme: 'tech',
    questions: [
      {
        id: 'usage',
        prompt: '{Il} utilise surtout la tech pour…',
        type: 'choice',
        options: [
          { key: 'smartphone', label: 'Son smartphone au quotidien' },
          { key: 'travail-etudes', label: 'Travailler / étudier' },
          { key: 'maison', label: 'La maison' },
          { key: 'mobilite', label: 'Être équipé en déplacement' },
          { key: 'gadgets', label: 'Découvrir des gadgets' },
        ],
      },
      {
        id: 'priorite',
        prompt: 'Ce qui compte le plus, c’est plutôt…',
        type: 'choice',
        options: [
          { key: 'efficacite', label: 'L’efficacité' },
          { key: 'confort', label: 'Le confort' },
          { key: 'nouveaute', label: 'La nouveauté' },
          { key: 'automatisation', label: 'L’automatisation' },
          { key: 'connectivite', label: 'La connectivité' },
        ],
      },
      {
        id: 'equipmentLevel',
        prompt: 'Côté tech, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'basique', label: 'Assez basique' },
          { key: 'equipe', label: 'Déjà bien équipé' },
          { key: 'technophile', label: 'Un vrai technophile' },
        ],
      },
      {
        id: 'type',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'accessoire', label: 'Un accessoire pratique' },
          { key: 'appareil', label: 'Un appareil à part entière' },
          { key: 'objet-connecte', label: 'Un objet connecté' },
          // DEFERRED (Phase 3, LOT 3) : valeur valide, volontairement non couverte pour l'instant —
          // à ne pas confondre avec 'autre' (OPEN) : on voudra un jour de vrais gadgets tech, on ne
          // force juste pas un produit maintenant pour ne pas faire de tech un tiroir fourre-tout.
          { key: 'gadget', label: 'Un gadget à découvrir' },
        ],
      },
      detailQuestion('Tech'),
    ],
  },

  sport: {
    theme: 'sport',
    questions: [
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'collectif'/'raquette'/'autre' retirés — audit
        // Phase 4B §1c confirmait 'collectif'/'raquette' ZERO ; 'autre' était omis par erreur du
        // rapport §2/§5, revérifié ici (0 produit taxonomé, 'discipline' hors TAXONOMY_CONFLICTS,
        // aucun hardRequirement, aucune composite expansion sur cette dimension — seule
        // sport.lieu en a une, dimension différente) : également ZERO, donc retiré.
        id: 'discipline',
        prompt: '{Il} pratique surtout…',
        type: 'choice',
        options: [
          { key: 'running', label: 'Course à pied' },
          { key: 'musculation', label: 'Musculation' },
          { key: 'yoga', label: 'Yoga / étirement' },
          { key: 'velo', label: 'Vélo' },
        ],
      },
      {
        // Le lieu ne discrimine vraiment le cadeau que pour les disciplines qu'on peut pratiquer
        // aussi bien chez soi qu'en salle (musculation, yoga) — pour running/vélo/collectif/raquette
        // le lieu n'oriente pas le choix de cadeau, "besoin" (performance/confort/récupération/
        // sécurité/suivi) le fait déjà (voir audit Phase 3A : éviter de poser une question qui ne
        // réduit jamais le pool de candidats).
        id: 'lieu',
        prompt: '{Il} s’entraîne surtout…',
        type: 'choice',
        options: [
          { key: 'maison', label: 'À la maison' },
          { key: 'salle', label: 'En salle' },
          { key: 'exterieur', label: 'En extérieur' },
          { key: 'mixte', label: 'Ça dépend' },
        ],
        when: { questionId: 'discipline', oneOf: ['musculation', 'yoga'] },
      },
      {
        id: 'niveau',
        prompt: 'Son niveau est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'avance', label: 'Avancé' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} aurait surtout besoin de…',
        type: 'choice',
        options: [
          { key: 'materiel', label: 'Matériel' },
          { key: 'performance', label: 'Suivi de performance' },
          { key: 'confort', label: 'Confort pendant l’effort' },
          { key: 'recuperation', label: 'Récupération' },
          { key: 'suivi', label: 'Suivi de sa progression' },
        ],
      },
      detailQuestion('Sport'),
    ],
  },

  mode: {
    theme: 'mode',
    questions: [
      {
        id: 'categorie',
        prompt: '{Il} aimerait plutôt…',
        type: 'choice',
        options: [
          { key: 'vetements', label: 'Un vêtement' },
          { key: 'accessoires', label: 'Un accessoire' },
          { key: 'chaussures', label: 'Des chaussures' },
        ],
      },
      {
        id: 'style',
        prompt: 'Son style est plutôt…',
        type: 'choice',
        options: [
          { key: 'classique', label: 'Classique' },
          { key: 'casual', label: 'Casual' },
          { key: 'streetwear', label: 'Streetwear' },
          { key: 'elegant', label: 'Élégant' },
          { key: 'sportif', label: 'Sportif' },
        ],
      },
      {
        id: 'preference',
        prompt: '{Il} préfère plutôt…',
        type: 'choice',
        options: [
          { key: 'discret', label: 'Quelque chose de discret' },
          { key: 'visible', label: 'Quelque chose qui se remarque' },
          { key: 'intemporel', label: 'Une pièce intemporelle' },
        ],
      },
      // CHANTIER "Phase 4C — nettoyage quiz pré-bêta" (2026-09-21) : 'tailleConnue'/'taille'
      // retirés ensemble — audit Phase 4B confirmait `mode.taille` (xs/s/m/l/xl) totalement mort
      // (aucun produit catalogue ne déclare de dimension taille, aucun hardRequirement dessus) ;
      // `tailleConnue` n'existait que pour conditionner l'affichage de `taille` (voir `when`
      // ci-dessus, désormais supprimé) et n'avait lui-même aucun effet de scoring propre (aucune
      // valeur 'oui'/'non' n'est recoupée par une taxonomy produit du thème mode) — le conserver
      // seul aurait posé une question sans plus aucune conséquence, contraire à l'objectif de ce
      // nettoyage (voir consigne §6). Anciennes réponses `mode.tailleConnue`/`mode.taille`
      // stockées restent tolérées et simplement ignorées par le moteur (Record<string,string>
      // libre, jamais validé contre un schéma fixe).
      detailQuestion('Mode'),
    ],
  },

  voyage: {
    theme: 'voyage',
    questions: [
      {
        id: 'type',
        prompt: 'Son prochain voyage, c’est plutôt…',
        type: 'choice',
        options: [
          { key: 'weekend', label: 'Un week-end' },
          { key: 'long', label: 'Un long voyage' },
          { key: 'travail', label: 'Un déplacement pro' },
          { key: 'roadtrip', label: 'Un road-trip' },
        ],
      },
      {
        id: 'transport',
        prompt: '{Il} voyage surtout…',
        type: 'choice',
        options: [
          { key: 'avion', label: 'En avion' },
          { key: 'train', label: 'En train' },
          { key: 'voiture', label: 'En voiture' },
          { key: 'mixte', label: 'Ça dépend' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} aurait surtout besoin de…',
        type: 'choice',
        options: [
          { key: 'organisation', label: 'S’organiser' },
          { key: 'confort', label: 'Du confort' },
          { key: 'bagage', label: 'Un bon bagage' },
          { key: 'recharge', label: 'Rester chargé' },
          { key: 'securite', label: 'De la sécurité' },
        ],
      },
      {
        id: 'style',
        prompt: '{Il} voyage plutôt…',
        type: 'choice',
        options: [
          { key: 'leger', label: 'Léger' },
          { key: 'charge', label: 'Chargé' },
          { key: 'variable', label: 'Ça dépend du voyage' },
        ],
      },
      detailQuestion('Voyage'),
    ],
  },

  lecture: {
    theme: 'lecture',
    questions: [
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'audio' retiré — 0 produit catalogue ne le recoupe
        // (voir audit Phase 4B §1c).
        id: 'format',
        prompt: '{Il} lit surtout…',
        type: 'choice',
        options: [
          { key: 'papier', label: 'Sur papier' },
          { key: 'numerique', label: 'Sur liseuse numérique' },
          { key: 'ecriture', label: '{Il} écrit aussi' },
        ],
      },
      {
        id: 'contexte',
        prompt: '{Il} lit surtout…',
        type: 'choice',
        options: [
          { key: 'maison', label: 'À la maison' },
          { key: 'lit', label: 'Le soir, au lit' },
          { key: 'mobilite', label: 'En déplacement' },
          { key: 'partout', label: 'Partout' },
        ],
      },
      {
        id: 'intensite',
        prompt: 'Côté lecture, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'occasionnel', label: 'Occasionnel' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'gros-lecteur', label: 'Un gros lecteur' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'confort', label: 'Plus de confort de lecture' },
          { key: 'bel-objet', label: 'Un bel objet' },
          { key: 'organisation', label: 'De quoi s’organiser' },
          { key: 'ecriture', label: 'De quoi écrire' },
        ],
      },
      detailQuestion('Lecture'),
    ],
  },

  collection: {
    theme: 'collection',
    questions: [
      {
        id: 'type',
        prompt: 'Sa collection tourne autour de…',
        type: 'choice',
        options: [
          { key: 'lego', label: 'LEGO' },
          { key: 'tcg', label: 'Cartes à collectionner' },
          { key: 'figurines', label: 'Figurines' },
          { key: 'popculture', label: 'Pop culture' },
          { key: 'miniatures', label: 'Miniatures' },
          { key: 'autre', label: 'Autre chose de précis' },
        ],
      },
      {
        id: 'usage',
        prompt: '{Il} aime surtout…',
        type: 'choice',
        options: [
          { key: 'acheter', label: 'Acheter de nouvelles pièces' },
          { key: 'construire', label: 'Construire / assembler' },
          { key: 'exposer', label: 'Exposer sa collection' },
          { key: 'proteger', label: 'Protéger ses pièces' },
          { key: 'organiser', label: 'Organiser / ranger' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'Sur sa collection, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'gros-collectionneur', label: 'Un gros collectionneur' },
        ],
      },
      {
        id: 'favorite',
        prompt: 'Tu connais une licence ou un univers qu’{il} adore ?',
        type: 'text',
        placeholder: 'Ex. une licence, une marque ou un univers qu’il collectionne…',
      },
    ],
  },

  maison: {
    theme: 'maison',
    questions: [
      {
        id: 'zone',
        prompt: 'Pour quelle pièce {il} apprécierait un cadeau ?',
        type: 'choice',
        options: [
          { key: 'salon', label: 'Le salon' },
          { key: 'chambre', label: 'La chambre' },
          { key: 'cuisine', label: 'La cuisine' },
          { key: 'bureau', label: 'Le bureau' },
          { key: 'exterieur', label: 'L’extérieur' },
          { key: 'global', label: 'Toute la maison' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'decoration', label: 'De la décoration' },
          { key: 'confort', label: 'Du confort' },
          { key: 'pratique', label: 'Du pratique' },
          { key: 'organisation', label: 'De l’organisation' },
          { key: 'smart-home', label: 'De la maison connectée' },
        ],
      },
      {
        id: 'style',
        prompt: 'Sa maison est plutôt…',
        type: 'choice',
        options: [
          { key: 'minimaliste', label: 'Minimaliste' },
          { key: 'chaleureux', label: 'Chaleureuse' },
          { key: 'moderne', label: 'Moderne' },
          { key: 'charge', label: 'Chargée / éclectique' },
        ],
      },
      {
        id: 'connecte',
        prompt: 'Le côté connecté, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'oui', label: 'Fan' },
          { key: 'non', label: 'Pas intéressé' },
          { key: 'indifferent', label: 'Indifférent' },
        ],
      },
      detailQuestion('Maison'),
    ],
  },

  auto: {
    theme: 'auto',
    questions: [
      {
        id: 'profil',
        prompt: 'Côté voiture, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'utilitaire', label: 'Juste un moyen de transport' },
          { key: 'aime-conduire', label: '{Il} aime conduire' },
          { key: 'entretien', label: 'Attentif à l’entretien' },
          { key: 'passionne', label: 'Un vrai passionné' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'confort', label: 'Du confort de conduite' },
          { key: 'entretien', label: 'De l’entretien' },
          { key: 'technologie', label: 'De la technologie' },
          { key: 'organisation', label: 'De l’organisation' },
          { key: 'securite', label: 'De la sécurité' },
        ],
      },
      // QUESTION_REVIEW (Phase 3, LOT 3) : quotidien/régulier/occasionnel décrit une cadence
      // d'usage, pas un besoin cadeau — rien ne permet d'en déduire un produit plus pertinent
      // qu'un autre de façon défendable (contrairement à profil/besoin/diy ci-dessus/dessous).
      // Ne pas chercher de produit pour "satisfaire" cette dimension : si elle est un jour
      // remplacée, un axe du type "ce qu'il apprécie dans sa voiture" (confort/techno/entretien/
      // esthétique/conduite) serait plus discriminant — mais vérifier d'abord que ce signal n'est
      // pas déjà capturé par `besoin`.
      {
        id: 'frequence',
        prompt: '{Il} prend la voiture…',
        type: 'choice',
        options: [
          { key: 'quotidien', label: 'Tous les jours' },
          { key: 'regulier', label: 'Régulièrement' },
          { key: 'occasionnel', label: 'Occasionnellement' },
        ],
      },
      {
        id: 'diy',
        prompt: '{Il} bricole sa voiture {lui}-même ?',
        type: 'choice',
        options: [
          { key: 'oui', label: 'Oui, complètement' },
          { key: 'un-peu', label: 'Un peu' },
          { key: 'non', label: 'Non, jamais' },
        ],
      },
      detailQuestion('Auto'),
    ],
  },

  nature: {
    theme: 'nature',
    questions: [
      {
        id: 'activite',
        prompt: '{Il} aime la nature plutôt…',
        type: 'choice',
        options: [
          { key: 'randonnee', label: 'En randonnée' },
          { key: 'camping', label: 'En camping / bivouac' },
          { key: 'observation', label: 'En observation calme' },
          { key: 'balade', label: 'En balade tranquille' },
          { key: 'aventure', label: 'En quête d’aventure' },
        ],
      },
      {
        id: 'niveau',
        prompt: '{Il} sort en nature…',
        type: 'choice',
        options: [
          { key: 'occasionnel', label: 'Occasionnellement' },
          { key: 'regulier', label: 'Régulièrement' },
          { key: 'passionne', label: 'C’est une vraie passion' },
        ],
      },
      {
        id: 'duree',
        prompt: 'Ses sorties durent plutôt…',
        type: 'choice',
        options: [
          { key: 'courte', label: 'Une courte sortie' },
          { key: 'journee', label: 'Une journée' },
          { key: 'plusieurs-jours', label: 'Plusieurs jours' },
        ],
      },
      {
        id: 'priorite',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'confort', label: 'Du confort' },
          { key: 'equipement', label: 'De l’équipement' },
          { key: 'observation', label: 'De l’observation' },
          { key: 'organisation', label: 'De l’organisation' },
          { key: 'autonomie', label: 'De l’autonomie' },
        ],
      },
      detailQuestion('Nature'),
    ],
  },

  cinema: {
    theme: 'cinema',
    questions: [
      {
        id: 'contenu',
        prompt: '{Il} regarde plutôt…',
        type: 'choice',
        options: [
          { key: 'films', label: 'Des films' },
          { key: 'series', label: 'Des séries' },
          { key: 'les-deux', label: 'Les deux' },
        ],
      },
      {
        id: 'contexte',
        prompt: '{Il} regarde surtout…',
        type: 'choice',
        options: [
          { key: 'cinema', label: 'Au cinéma' },
          { key: 'maison', label: 'Chez lui' },
          { key: 'partout', label: 'Partout' },
        ],
      },
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'fandom' retiré — 0 produit licence cinéma au
        // catalogue ne le recoupe (voir audit Phase 4B §1c).
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'installation', label: 'Une meilleure installation' },
          { key: 'ambiance', label: 'De l’ambiance' },
          { key: 'collection', label: 'Un objet de collection' },
          { key: 'experience', label: 'Une expérience' },
        ],
      },
      {
        id: 'favorite',
        prompt: 'Tu connais un film, une série ou une franchise qu’{il} adore ?',
        type: 'text',
        placeholder: 'Ex. un film, une série ou un univers qu’il adore…',
      },
    ],
  },

  art: {
    theme: 'art',
    questions: [
      {
        id: 'pratique',
        prompt: '{Il} pratique plutôt…',
        type: 'choice',
        options: [
          { key: 'dessin', label: 'Dessin' },
          { key: 'peinture', label: 'Peinture' },
          { key: 'numerique', label: 'Art numérique' },
          { key: 'calligraphie', label: 'Calligraphie' },
          { key: 'loisirs-creatifs', label: 'Loisirs créatifs' },
          { key: 'contemplation', label: 'Surtout en spectateur' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'Son niveau est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'confirme', label: 'Confirmé' },
        ],
      },
      {
        id: 'support',
        prompt: '{Il} crée plutôt…',
        type: 'choice',
        options: [
          { key: 'manuel', label: 'À la main' },
          { key: 'numerique', label: 'Sur écran' },
          { key: 'mixte', label: 'Les deux' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'decouverte', label: 'Une nouvelle technique à découvrir' },
          { key: 'upgrade', label: 'Un upgrade de son matériel' },
          { key: 'organisation', label: 'De quoi ranger/organiser' },
          { key: 'inspiration', label: 'De l’inspiration' },
        ],
      },
      detailQuestion('Art'),
    ],
  },

  bienetre: {
    theme: 'bienetre',
    questions: [
      {
        id: 'besoin',
        prompt: '{Il} a plutôt besoin de…',
        type: 'choice',
        options: [
          { key: 'relaxation', label: 'Relaxation' },
          { key: 'sommeil', label: 'Mieux dormir' },
          { key: 'massage', label: 'Massage' },
          { key: 'soin', label: 'Soin du corps' },
          { key: 'ambiance', label: 'Ambiance apaisante' },
        ],
      },
      // QUESTION_REVIEW (Phase 3, LOT 4) : même défaut qu'auto.frequence — quotidien/occasionnel
      // décrit une cadence d'usage, pas un besoin cadeau. Un diffuseur, un pistolet de massage ou
      // une bombe de bain fonctionnent aussi bien pour l'un que pour l'autre : rien ne permet
      // d'en déduire un produit plus pertinent de façon défendable. Ne pas chercher de produit
      // pour la satisfaire.
      {
        id: 'frequence',
        prompt: '{Il} en aurait l’usage…',
        type: 'choice',
        options: [
          { key: 'quotidien', label: 'Au quotidien' },
          { key: 'occasionnel', label: 'Occasionnellement' },
        ],
      },
      {
        id: 'format',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'simple', label: 'Quelque chose de simple' },
          { key: 'appareil', label: 'Un appareil dédié' },
          { key: 'sensoriel', label: 'Une expérience sensorielle' },
        ],
      },
      {
        id: 'parfum',
        prompt: '{Il} aime les objets parfumés ?',
        type: 'choice',
        options: [
          { key: 'oui', label: 'Oui' },
          { key: 'non', label: 'Non' },
          { key: 'inconnu', label: 'Je ne sais pas' },
        ],
      },
      detailQuestion('Bien-être'),
    ],
  },

  animaux: {
    theme: 'animaux',
    questions: [
      {
        // Filtre DUR : un produit compatible seulement avec une espèce (ex. panier pour chien)
        // disparaît dès que l'espèce répondue ne correspond pas — voir hardRequirements.
        id: 'typeAnimal',
        prompt: 'Son animal est…',
        type: 'choice',
        options: [
          { key: 'chat', label: 'Un chat' },
          { key: 'chien', label: 'Un chien' },
          { key: 'oiseau', label: 'Un oiseau' },
          { key: 'rongeur', label: 'Un rongeur' },
          { key: 'aquarium', label: 'Un poisson / aquarium' },
          { key: 'autre', label: 'Un autre animal' },
        ],
      },
      {
        id: 'destinataire',
        prompt: 'Le cadeau est plutôt pour…',
        type: 'choice',
        options: [
          { key: 'animal', label: 'L’animal' },
          { key: 'proprietaire', label: 'Le/la propriétaire' },
          { key: 'les-deux', label: 'Les deux' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} aime plutôt lui offrir…',
        type: 'choice',
        options: [
          { key: 'jeu', label: 'Des jouets' },
          { key: 'confort', label: 'Du confort' },
          { key: 'nourriture-hydratation', label: 'Nourriture / hydratation' },
          { key: 'promenade', label: 'De quoi le promener' },
          { key: 'entretien', label: 'De l’entretien' },
          { key: 'tech', label: 'Un accessoire connecté' },
        ],
      },
      {
        id: 'temperament',
        prompt: 'Son animal est plutôt…',
        type: 'choice',
        options: [
          { key: 'actif', label: 'Actif' },
          { key: 'calme', label: 'Calme' },
          { key: 'variable', label: 'Ça dépend des jours' },
        ],
      },
      detailQuestion('Animaux'),
    ],
  },

  photo: {
    theme: 'photo',
    questions: [
      {
        // Filtre DUR potentiel : une recharge/accessoire compatible seulement avec un type
        // d'appareil (ex. films Instax) disparaît si {il} n'a pas cet appareil précis.
        id: 'appareil',
        prompt: '{Il} photographie surtout avec…',
        type: 'choice',
        options: [
          { key: 'smartphone', label: 'Son smartphone' },
          { key: 'appareil-photo', label: 'Un appareil photo dédié' },
          { key: 'instantane', label: 'Un appareil instantané' },
          { key: 'plusieurs', label: 'Plusieurs appareils' },
        ],
      },
      {
        id: 'usage',
        prompt: '{Il} aime surtout…',
        type: 'choice',
        options: [
          { key: 'prise-de-vue', label: 'Prendre des photos' },
          { key: 'impression', label: 'Les imprimer' },
          { key: 'partage', label: 'Les partager' },
          { key: 'retouche', label: 'Les retoucher' },
          { key: 'souvenirs', label: 'Garder des souvenirs' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'En photo, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'occasionnel', label: 'Occasionnel' },
          { key: 'amateur', label: 'Amateur passionné' },
          { key: 'passionne', label: 'Une vraie passion' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'pratique', label: 'Quelque chose de pratique' },
          { key: 'creatif', label: 'Quelque chose de créatif' },
          { key: 'impression', label: 'De quoi imprimer' },
          { key: 'materiel', label: 'Du matériel' },
        ],
      },
      detailQuestion('Photo'),
    ],
  },

  jardinage: {
    theme: 'jardinage',
    questions: [
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'grand-jardin' retiré — 0 produit catalogue ne le
        // recoupe (voir audit Phase 4B §1c).
        id: 'lieu',
        prompt: '{Il} jardine plutôt…',
        type: 'choice',
        options: [
          { key: 'interieur', label: 'À l’intérieur' },
          { key: 'balcon', label: 'Sur un balcon' },
          { key: 'petit-jardin', label: 'Dans un petit jardin' },
        ],
      },
      {
        id: 'univers',
        prompt: 'Son jardin, c’est plutôt…',
        type: 'choice',
        options: [
          { key: 'fleurs', label: 'Les fleurs' },
          { key: 'potager', label: 'Le potager' },
          { key: 'plantes-interieur', label: 'Les plantes d’intérieur' },
          { key: 'entretien', label: 'L’entretien général' },
          { key: 'amenagement', label: 'L’aménagement' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'En jardinage, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'passionne', label: 'Une vraie passion' },
        ],
      },
      {
        id: 'preference',
        prompt: '{Il} préfère plutôt…',
        type: 'choice',
        options: [
          { key: 'manuel', label: 'Jardiner à la main' },
          { key: 'automatisation', label: 'Automatiser' },
          { key: 'culture', label: 'Cultiver' },
          { key: 'entretien', label: 'Entretenir' },
        ],
      },
      detailQuestion('Jardinage'),
    ],
  },

  bricolage: {
    theme: 'bricolage',
    questions: [
      {
        id: 'univers',
        prompt: '{Il} bricole plutôt…',
        type: 'choice',
        options: [
          { key: 'maison', label: 'Réparations à la maison' },
          { key: 'bois', label: 'Le bois' },
          { key: 'electronique', label: 'L’électronique' },
          { key: 'mecanique', label: 'La mécanique' },
          { key: 'polyvalent', label: 'Un peu de tout' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'En bricolage, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'equipe', label: 'Déjà bien équipé' },
        ],
      },
      {
        id: 'outil',
        prompt: '{Il} préfère plutôt…',
        type: 'choice',
        options: [
          { key: 'manuel', label: 'L’outillage manuel' },
          { key: 'electrique', label: 'L’outillage électrique' },
          { key: 'mixte', label: 'Les deux' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'precision', label: 'De la précision' },
          { key: 'puissance', label: 'De la puissance' },
          { key: 'polyvalence', label: 'De la polyvalence' },
          { key: 'organisation', label: 'De l’organisation' },
          { key: 'mesure', label: 'De quoi mesurer' },
        ],
      },
      detailQuestion('Bricolage'),
    ],
  },

  danse: {
    theme: 'danse',
    questions: [
      {
        id: 'usage',
        prompt: '{Il} danse plutôt…',
        type: 'choice',
        options: [
          { key: 'sport', label: 'Comme sport' },
          { key: 'artistique', label: 'Comme pratique artistique' },
          { key: 'soiree', label: 'En soirée, pour le plaisir' },
          { key: 'mixte', label: 'Un peu de tout' },
        ],
      },
      {
        // CHANTIER "Phase 4C" (2026-09-21) : 'club' retiré — 0 produit catalogue ne le recoupe
        // (voir audit Phase 4B §1c).
        id: 'lieu',
        prompt: '{Il} danse surtout…',
        type: 'choice',
        options: [
          { key: 'maison', label: 'À la maison' },
          { key: 'studio', label: 'En studio / en cours' },
          { key: 'mixte', label: 'Ça dépend' },
        ],
      },
      {
        id: 'besoin',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'entrainement', label: 'De quoi s’entraîner' },
          { key: 'musique', label: 'De la musique' },
          { key: 'ambiance', label: 'De l’ambiance' },
          { key: 'confort', label: 'Du confort' },
          { key: 'accessoires', label: 'Des accessoires' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'En danse, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Débutant' },
          { key: 'regulier', label: 'Régulier' },
          { key: 'passionne', label: 'Une vraie passion' },
        ],
      },
      detailQuestion('Danse'),
    ],
  },
};

/**
 * Arbre générique pour tout thème sans affinage dédié (17 des 20 thèmes pour l'instant — voir
 * Phase 2 du plan de refonte). Volontairement construit en entonnoir — large d'abord, pour
 * rétrécir le champ des possibles progressivement plutôt que deux questions isolées :
 *   1. Passion réelle ou intérêt occasionnel (pondère l'importance du thème)
 *   2. Néophyte ou déjà connaisseur (oriente vers du simple ou plutôt haut de gamme)
 *   3. Pratique/utile ou original (recoupe directement les traits practical/curious)
 *   4. Objet à garder ou expérience à vivre (recoupe practical/experience)
 *   5. Détail libre (marque, style, ce qu'{il} a déjà…) — facultatif, mais c'est le signal le plus
 *      précis : les mots qu'on y écrit sont recherchés directement dans les titres produits, comme
 *      pour le souhait du quiz général (voir genericThemeAnswerBonus dans recommendationEngine.ts).
 * Les clés de réponse (passion/depth/style/priority/detail) sont partagées par tous les thèmes
 * génériques, donc lues génériquement par le moteur de scoring — pas de logique par thème ici.
 */
function genericThemeQuiz(theme: InterestTag): ThemeQuizConfig {
  const label = INTEREST_OPTIONS.find((o) => o.key === theme)?.label ?? theme;
  return {
    theme,
    questions: [
      {
        id: 'passion',
        prompt: `Son intérêt pour ${label}, c'est plutôt…`,
        type: 'choice',
        options: [
          { key: 'occasionnel', label: 'Occasionnel' },
          { key: 'passion', label: 'Une vraie passion' },
        ],
      },
      {
        id: 'depth',
        prompt: 'Dans ce domaine, {il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Néophyte / débutant' },
          { key: 'connaisseur', label: 'Déjà connaisseur' },
        ],
      },
      {
        id: 'style',
        prompt: '{Il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'pratique', label: 'Quelque chose de pratique/utile' },
          { key: 'original', label: 'Quelque chose d’original' },
        ],
      },
      {
        id: 'priority',
        prompt: 'Ce qui compte le plus pour {lui}, c’est plutôt…',
        type: 'choice',
        options: [
          { key: 'objet', label: 'Un objet à garder' },
          { key: 'experience', label: 'Un moment à vivre' },
        ],
      },
      {
        id: 'detail',
        prompt: `Un détail précis sur ce qu'{il} aime en ${label.toLowerCase()} ?`,
        type: 'text',
      },
    ],
  };
}

export function getThemeQuiz(theme: InterestTag): ThemeQuizConfig {
  return DEDICATED_QUIZZES[theme] ?? genericThemeQuiz(theme);
}
