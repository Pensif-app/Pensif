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
};

export type ThemeQuizConfig = {
  theme: InterestTag;
  questions: ThemeQuestion[];
};

// Questions communes réutilisées par tous les thèmes ci-dessous (mêmes clés de réponse que
// l'ancien arbre générique, lues telles quelles par genericThemeAnswerBonus dans
// recommendationEngine.ts) — chaque thème ajoute ses 2 questions propres entre depth() et style()
// pour rétrécir progressivement le champ des possibles plutôt que de rester générique.
function passionQuestion(label: string): ThemeQuestion {
  return {
    id: 'passion',
    prompt: `Son intérêt pour ${label.toLowerCase()}, c'est plutôt…`,
    type: 'choice',
    options: [
      { key: 'occasionnel', label: 'Occasionnel' },
      { key: 'passion', label: 'Une vraie passion' },
    ],
  };
}
function depthQuestion(): ThemeQuestion {
  return {
    id: 'depth',
    prompt: 'Dans ce domaine, {il} est plutôt…',
    type: 'choice',
    options: [
      { key: 'debutant', label: 'Néophyte / débutant' },
      { key: 'connaisseur', label: 'Déjà connaisseur' },
    ],
  };
}
function styleQuestion(): ThemeQuestion {
  return {
    id: 'style',
    prompt: '{Il} apprécierait plutôt…',
    type: 'choice',
    options: [
      { key: 'pratique', label: 'Quelque chose de pratique/utile' },
      { key: 'original', label: 'Quelque chose d’original' },
    ],
  };
}
function detailQuestion(label: string): ThemeQuestion {
  return { id: 'detail', prompt: `Un détail précis sur ce qu'{il} aime en ${label.toLowerCase()} ?`, type: 'text' };
}

/**
 * Arbres de questions dédiés — architecture volontairement déclarative (pas de logique hardcodée
 * dans les composants UI) : ThemeAffinage.tsx se contente de lire cette config et de rendre les
 * questions génériquement. Ajouter un nouveau thème dédié = ajouter une entrée ici, rien d'autre.
 * Chacun des 20 thèmes a maintenant son propre arbre à 6 étapes — large au départ (passion, niveau)
 * puis 2 questions propres au thème pour rétrécir le champ des possibles, avant de reconverger sur
 * pratique/original et un détail libre. gaming/cuisine/musique restent sur mesure (5 questions déjà
 * bien ciblées) ; les 17 autres suivent ce même entonnoir.
 */
const DEDICATED_QUIZZES: Partial<Record<InterestTag, ThemeQuizConfig>> = {
  gaming: {
    theme: 'gaming',
    questions: [
      {
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
        id: 'focus',
        prompt: 'Pour son univers gaming, {il} apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'setup', label: 'Améliorer son setup' },
          { key: 'fandom', label: 'Quelque chose lié à ses jeux préférés' },
        ],
      },
      {
        id: 'setupLevel',
        prompt: 'Son setup est…',
        type: 'choice',
        options: [
          { key: 'simple', label: 'Assez simple' },
          { key: 'equipped', label: 'Déjà bien équipé' },
        ],
      },
      {
        id: 'favorite',
        prompt: 'Tu connais un jeu ou une licence qu’{il} adore ?',
        type: 'text',
      },
    ],
  },

  cuisine: {
    theme: 'cuisine',
    questions: [
      {
        id: 'mode',
        prompt: '{Il} préfère…',
        type: 'choice',
        options: [
          { key: 'cuisiner', label: 'Cuisiner' },
          { key: 'decouvrir', label: 'Manger / découvrir' },
        ],
      },
      {
        id: 'taste',
        prompt: '{Il} est plutôt…',
        type: 'choice',
        options: [
          { key: 'sale', label: 'Salé' },
          { key: 'sucre', label: 'Sucré' },
        ],
      },
      {
        id: 'novelty',
        prompt: '{Il} aime…',
        type: 'choice',
        options: [
          { key: 'decouverte', label: 'Découvrir de nouvelles choses' },
          { key: 'valeurs-sures', label: 'Ses valeurs sûres' },
        ],
      },
      {
        id: 'universe',
        prompt: 'Son univers cuisine préféré ?',
        type: 'choice',
        options: [
          { key: 'bbq', label: 'BBQ' },
          { key: 'patisserie', label: 'Pâtisserie' },
          { key: 'cafe', label: 'Café' },
          { key: 'asiatique', label: 'Cuisine asiatique' },
          { key: 'apero', label: 'Apéro' },
          { key: 'italienne', label: 'Cuisine italienne' },
          { key: 'aucun', label: 'Aucun en particulier' },
        ],
      },
    ],
  },

  musique: {
    theme: 'musique',
    questions: [
      {
        id: 'mode',
        prompt: '{Il} préfère…',
        type: 'choice',
        options: [
          { key: 'ecouter', label: 'Écouter de la musique' },
          { key: 'jouer', label: 'Jouer de la musique' },
        ],
      },
      {
        id: 'context',
        prompt: '{Il} écoute surtout…',
        type: 'choice',
        options: [
          { key: 'maison', label: 'Chez lui' },
          { key: 'deplacement', label: 'En déplacement' },
          { key: 'partout', label: 'Partout' },
        ],
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
        id: 'favorite',
        prompt: 'Tu connais son artiste ou son genre préféré ?',
        type: 'text',
      },
    ],
  },

  tech: {
    theme: 'tech',
    questions: [
      passionQuestion('Tech'),
      depthQuestion(),
      {
        id: 'usage',
        prompt: 'Il utilise surtout la tech pour…',
        type: 'choice',
        options: [
          { key: 'travail', label: 'Travailler / être productif' },
          { key: 'creer', label: 'Créer (photo, vidéo, musique)' },
          { key: 'quotidien', label: 'Se simplifier le quotidien' },
        ],
      },
      {
        id: 'univers',
        prompt: 'Il serait plutôt content d’avoir…',
        type: 'choice',
        options: [
          { key: 'accessoire', label: 'Un accessoire pratique en plus' },
          { key: 'gadget', label: 'Un gadget innovant à découvrir' },
          { key: 'connecte', label: 'Un objet connecté pour la maison' },
        ],
      },
      styleQuestion(),
      detailQuestion('Tech'),
    ],
  },

  sport: {
    theme: 'sport',
    questions: [
      passionQuestion('Sport'),
      depthQuestion(),
      {
        id: 'discipline',
        prompt: 'Il pratique surtout…',
        type: 'choice',
        options: [
          { key: 'salle', label: 'Sport en salle / fitness' },
          { key: 'exterieur', label: 'Sport en extérieur / nature' },
          { key: 'equipe', label: 'Sport en équipe' },
          { key: 'douceur', label: 'Yoga / étirement / bien-être actif' },
        ],
      },
      {
        id: 'social',
        prompt: 'Il s’entraîne plutôt…',
        type: 'choice',
        options: [
          { key: 'solo', label: 'Seul' },
          { key: 'groupe', label: 'Avec d’autres' },
          { key: 'both', label: 'Les deux' },
        ],
      },
      styleQuestion(),
      detailQuestion('Sport'),
    ],
  },

  mode: {
    theme: 'mode',
    questions: [
      passionQuestion('Mode'),
      depthQuestion(),
      {
        id: 'preference',
        prompt: 'Son style est plutôt…',
        type: 'choice',
        options: [
          { key: 'classique', label: 'Classique / intemporel' },
          { key: 'decontracte', label: 'Sportswear / décontracté' },
          { key: 'tendance', label: 'Tendance / fashion' },
        ],
      },
      {
        id: 'occasion',
        prompt: 'Il aimerait plutôt un accessoire…',
        type: 'choice',
        options: [
          { key: 'quotidien', label: 'Pour tous les jours' },
          { key: 'special', label: 'Pour une occasion spéciale' },
        ],
      },
      styleQuestion(),
      detailQuestion('Mode'),
    ],
  },

  voyage: {
    theme: 'voyage',
    questions: [
      passionQuestion('Voyage'),
      depthQuestion(),
      {
        id: 'approche',
        prompt: 'Il voyage plutôt…',
        type: 'choice',
        options: [
          { key: 'aventure', label: 'Sac à dos / aventure' },
          { key: 'confort', label: 'Confort / tourisme classique' },
          { key: 'pro', label: 'Affaires / pro' },
        ],
      },
      {
        id: 'destination',
        prompt: 'Son prochain type de voyage…',
        type: 'choice',
        options: [
          { key: 'montagne', label: 'Montagne / nature' },
          { key: 'ville', label: 'Ville' },
          { key: 'plage', label: 'Plage' },
          { key: 'aucun', label: 'Rien de prévu pour l’instant' },
        ],
      },
      styleQuestion(),
      detailQuestion('Voyage'),
    ],
  },

  lecture: {
    theme: 'lecture',
    questions: [
      passionQuestion('Lecture'),
      depthQuestion(),
      {
        id: 'genre',
        prompt: 'Il lit plutôt…',
        type: 'choice',
        options: [
          { key: 'fiction', label: 'Fiction / romans' },
          { key: 'essai', label: 'Non-fiction / essais' },
          { key: 'bd', label: 'BD / mangas' },
          { key: 'peu-importe', label: 'Peu importe le genre' },
        ],
      },
      {
        id: 'format',
        prompt: 'Il lit surtout…',
        type: 'choice',
        options: [
          { key: 'papier', label: 'Sur papier' },
          { key: 'liseuse', label: 'Sur liseuse numérique' },
          { key: 'both', label: 'Les deux' },
        ],
      },
      styleQuestion(),
      detailQuestion('Lecture'),
    ],
  },

  collection: {
    theme: 'collection',
    questions: [
      passionQuestion('Collection'),
      depthQuestion(),
      {
        id: 'univers',
        prompt: 'Sa collection tourne autour de…',
        type: 'choice',
        options: [
          { key: 'figurines', label: 'Figurines / jouets' },
          { key: 'vintage', label: 'Objets vintage / rétro' },
          { key: 'cartes', label: 'Cartes / comics' },
          { key: 'autre', label: 'Autre chose de précis' },
        ],
      },
      {
        id: 'rythme',
        prompt: 'Il complète sa collection…',
        type: 'choice',
        options: [
          { key: 'regulier', label: 'Régulièrement, il connaît bien son domaine' },
          { key: 'occasionnel', label: 'Occasionnellement seulement' },
        ],
      },
      styleQuestion(),
      detailQuestion('Collection'),
    ],
  },

  maison: {
    theme: 'maison',
    questions: [
      passionQuestion('Maison / déco'),
      depthQuestion(),
      {
        id: 'univers',
        prompt: 'Chez {lui}, il aime plutôt…',
        type: 'choice',
        options: [
          { key: 'deco', label: 'La déco et l’ambiance' },
          { key: 'confort', label: 'Le confort et le cocooning' },
          { key: 'connecte', label: 'La maison connectée' },
        ],
      },
      {
        id: 'ambiance',
        prompt: 'Sa maison est plutôt…',
        type: 'choice',
        options: [
          { key: 'minimaliste', label: 'Minimaliste / épurée' },
          { key: 'cosy', label: 'Chaleureuse / cosy' },
          { key: 'moderne', label: 'Moderne / high-tech' },
        ],
      },
      styleQuestion(),
      detailQuestion('Maison'),
    ],
  },

  auto: {
    theme: 'auto',
    questions: [
      passionQuestion('Automobile'),
      depthQuestion(),
      {
        id: 'profil',
        prompt: 'Côté voiture, il est plutôt…',
        type: 'choice',
        options: [
          { key: 'passionne', label: 'Passionné / bricoleur auto' },
          { key: 'pratique', label: 'Utilisateur pratique au quotidien' },
        ],
      },
      {
        id: 'besoin',
        prompt: 'Il apprécierait plutôt…',
        type: 'choice',
        options: [
          { key: 'confort', label: 'Un accessoire pour le confort de conduite' },
          { key: 'techno', label: 'Un gadget technologique pour la voiture' },
        ],
      },
      styleQuestion(),
      detailQuestion('Auto'),
    ],
  },

  nature: {
    theme: 'nature',
    questions: [
      passionQuestion('Nature'),
      depthQuestion(),
      {
        id: 'pratique',
        prompt: 'Il aime la nature plutôt…',
        type: 'choice',
        options: [
          { key: 'rando', label: 'En randonnée / activité physique' },
          { key: 'observation', label: 'En observation calme (paysages, oiseaux…)' },
          { key: 'camping', label: 'En camping / bivouac' },
        ],
      },
      {
        id: 'frequence',
        prompt: 'Il sort en nature…',
        type: 'choice',
        options: [
          { key: 'souvent', label: 'Souvent' },
          { key: 'parfois', label: 'De temps en temps' },
        ],
      },
      styleQuestion(),
      detailQuestion('Nature'),
    ],
  },

  cinema: {
    theme: 'cinema',
    questions: [
      passionQuestion('Cinéma / séries'),
      depthQuestion(),
      {
        id: 'format',
        prompt: 'Il regarde plutôt…',
        type: 'choice',
        options: [
          { key: 'films', label: 'Des films' },
          { key: 'series', label: 'Des séries' },
          { key: 'both', label: 'Les deux' },
          { key: 'anime', label: 'De l’anime / manga' },
        ],
      },
      {
        id: 'contexte',
        prompt: 'Il regarde surtout…',
        type: 'choice',
        options: [
          { key: 'cinema', label: 'Au cinéma' },
          { key: 'maison', label: 'Chez lui, confortablement installé' },
        ],
      },
      styleQuestion(),
      detailQuestion('Cinéma'),
    ],
  },

  art: {
    theme: 'art',
    questions: [
      passionQuestion('Art / créativité'),
      depthQuestion(),
      {
        id: 'pratique',
        prompt: 'Il pratique plutôt…',
        type: 'choice',
        options: [
          { key: 'dessin', label: 'Dessin / peinture' },
          { key: 'numerique', label: 'Photographie / arts numériques' },
          { key: 'diy', label: 'Artisanat / DIY créatif' },
        ],
      },
      {
        id: 'niveau',
        prompt: 'Son niveau est plutôt…',
        type: 'choice',
        options: [
          { key: 'debutant', label: 'Amateur qui débute' },
          { key: 'regulier', label: 'Pratique déjà régulièrement' },
        ],
      },
      styleQuestion(),
      detailQuestion('Art'),
    ],
  },

  bienetre: {
    theme: 'bienetre',
    questions: [
      passionQuestion('Bien-être'),
      depthQuestion(),
      {
        id: 'mode',
        prompt: 'Il se détend plutôt par…',
        type: 'choice',
        options: [
          { key: 'corps', label: 'Le soin du corps (massage, bain…)' },
          { key: 'mental', label: 'La méditation / relaxation mentale' },
          { key: 'sommeil', label: 'Le sommeil / la récupération' },
        ],
      },
      {
        id: 'besoin',
        prompt: 'Il a plutôt besoin de…',
        type: 'choice',
        options: [
          { key: 'decompresser', label: 'Décompresser après le travail' },
          { key: 'quotidien', label: 'Prendre soin de lui au quotidien' },
        ],
      },
      styleQuestion(),
      detailQuestion('Bien-être'),
    ],
  },

  animaux: {
    theme: 'animaux',
    questions: [
      passionQuestion('Ses animaux'),
      depthQuestion(),
      {
        id: 'espece',
        prompt: 'Son animal est plutôt…',
        type: 'choice',
        options: [
          { key: 'chat', label: 'Un chat' },
          { key: 'chien', label: 'Un chien' },
          { key: 'autre', label: 'Un autre animal' },
        ],
      },
      {
        id: 'plaisir',
        prompt: 'Il aime plutôt lui offrir…',
        type: 'choice',
        options: [
          { key: 'jeu', label: 'Des jouets / de l’amusement' },
          { key: 'confort', label: 'Du confort (panier, couchage…)' },
          { key: 'pratique', label: 'Des accessoires pratiques (gamelle, laisse…)' },
        ],
      },
      styleQuestion(),
      detailQuestion('Animaux'),
    ],
  },

  photo: {
    theme: 'photo',
    questions: [
      passionQuestion('Photo'),
      depthQuestion(),
      {
        id: 'pratique',
        prompt: 'Il aime plutôt…',
        type: 'choice',
        options: [
          { key: 'prendre', label: 'Prendre des photos' },
          { key: 'exposer', label: 'Les imprimer / les exposer' },
          { key: 'both', label: 'Les deux' },
        ],
      },
      {
        id: 'materiel',
        prompt: 'Il photographie surtout…',
        type: 'choice',
        options: [
          { key: 'smartphone', label: 'Avec son smartphone' },
          { key: 'appareil', label: 'Avec un appareil dédié' },
        ],
      },
      styleQuestion(),
      detailQuestion('Photo'),
    ],
  },

  jardinage: {
    theme: 'jardinage',
    questions: [
      passionQuestion('Jardinage'),
      depthQuestion(),
      {
        id: 'univers',
        prompt: 'Son jardin, c’est plutôt…',
        type: 'choice',
        options: [
          { key: 'potager', label: 'Le potager / les légumes' },
          { key: 'fleurs', label: 'Les fleurs / l’ornemental' },
          { key: 'interieur', label: 'Les plantes d’intérieur' },
        ],
      },
      {
        id: 'lieu',
        prompt: 'Il jardine…',
        type: 'choice',
        options: [
          { key: 'exterieur', label: 'Dehors, dans un jardin' },
          { key: 'interieur', label: 'Dedans, sur un rebord de fenêtre/balcon' },
        ],
      },
      styleQuestion(),
      detailQuestion('Jardinage'),
    ],
  },

  bricolage: {
    theme: 'bricolage',
    questions: [
      passionQuestion('Bricolage'),
      depthQuestion(),
      {
        id: 'univers',
        prompt: 'Il bricole plutôt…',
        type: 'choice',
        options: [
          { key: 'reparation', label: 'Petites réparations du quotidien' },
          { key: 'gros-projet', label: 'Gros projets / construction' },
          { key: 'bois', label: 'Menuiserie / travail du bois' },
        ],
      },
      {
        id: 'atelier',
        prompt: 'Son atelier est plutôt…',
        type: 'choice',
        options: [
          { key: 'equipe', label: 'Déjà bien équipé' },
          { key: 'a-completer', label: 'À compléter' },
        ],
      },
      styleQuestion(),
      detailQuestion('Bricolage'),
    ],
  },

  danse: {
    theme: 'danse',
    questions: [
      passionQuestion('Danse'),
      depthQuestion(),
      {
        id: 'pratique',
        prompt: 'Il danse plutôt…',
        type: 'choice',
        options: [
          { key: 'cours', label: 'En cours, un style précis (classique, hip-hop…)' },
          { key: 'plaisir', label: 'Pour le plaisir, chez lui ou en soirée' },
        ],
      },
      {
        id: 'envie',
        prompt: 'Il aimerait plutôt…',
        type: 'choice',
        options: [
          { key: 'materiel', label: 'Du matériel / équipement de danse' },
          { key: 'ambiance', label: 'Une ambiance musicale pour danser' },
        ],
      },
      styleQuestion(),
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
