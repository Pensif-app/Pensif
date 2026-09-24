// CHANTIER "Mini tutoriel onboarding global" (2026-09-24). Module PUR (aucune dépendance react-native) :
// configuration des 4 pages du tutoriel + règles d'affichage one-shot + navigation. Le rendu vit dans
// components/TutorialOverlay.tsx / TutorialMocks.tsx. Les écrans montrés sont des MAQUETTES dédiées
// alimentées de données fictives (jamais les vrais écrans, qui sont vides pour un nouvel utilisateur).

export const TUTORIAL_SEEN_KEY = 'pensif.tutorialSeen';

export type TutorialAccent = 'blue' | 'pink' | 'violet';
export type TutorialArrow = 'up' | 'down' | 'left' | 'right';
export type TutorialMockId = 'home' | 'proches' | 'nouveauProche' | 'pensees' | 'capture' | 'calendrierMois' | 'calendrierSemaine';

export type TutorialCallout = {
  n: number;
  text: string;
  accent: TutorialAccent;
  /** Position verticale de la bulle, en % de la hauteur de la zone d'écran (0 = haut). */
  top: number;
  /** Côté d'ancrage horizontal de la bulle. */
  side: 'left' | 'right';
  /** Direction de la flèche qui désigne l'élément expliqué. */
  arrow: TutorialArrow;
};

export type TutorialView = { id: string; mock: TutorialMockId; callouts: TutorialCallout[] };
export type TutorialPageId = 'home' | 'proches' | 'pensees' | 'calendrier';
export type TutorialPage = { id: TutorialPageId; title: string; views: TutorialView[] };

export const TUTORIAL_PAGES: TutorialPage[] = [
  {
    id: 'home',
    title: 'Accueil',
    views: [
      {
        id: 'home-main',
        mock: 'home',
        callouts: [
          { n: 1, text: 'Ta journée commence ici, un aperçu personnel de ce qui compte pour toi aujourd’hui.', accent: 'blue', top: 4, side: 'left', arrow: 'up' },
          { n: 2, text: 'AUJOURD’HUI : ce qui demande ton attention maintenant, en priorité.', accent: 'pink', top: 30, side: 'right', arrow: 'left' },
          { n: 3, text: 'CETTE SEMAINE et À ANTICIPER : tes pensées et rappels, triés par urgence.', accent: 'violet', top: 60, side: 'left', arrow: 'up' },
          { n: 4, text: 'Accueil : ton tableau de bord, la vue de synthèse.', accent: 'blue', top: 84, side: 'right', arrow: 'down' },
        ],
      },
    ],
  },
  {
    id: 'proches',
    title: 'Proches',
    views: [
      {
        id: 'proches-liste',
        mock: 'proches',
        callouts: [
          { n: 1, text: 'Les personnes importantes que tu suis, en un coup d’œil.', accent: 'blue', top: 10, side: 'left', arrow: 'up' },
          { n: 2, text: 'Le quiz : plus il est complet, plus les idées de Pensif sont justes.', accent: 'pink', top: 40, side: 'right', arrow: 'left' },
          { n: 3, text: 'Ajoute un proche avec le bouton +.', accent: 'violet', top: 74, side: 'left', arrow: 'right' },
        ],
      },
      {
        id: 'proches-fiche',
        mock: 'nouveauProche',
        callouts: [
          { n: 1, text: 'Importe une personne depuis tes contacts en un tap.', accent: 'blue', top: 12, side: 'left', arrow: 'up' },
          { n: 2, text: 'Ou ajoute-la à la main.', accent: 'pink', top: 38, side: 'right', arrow: 'left' },
          { n: 3, text: 'Plus la fiche est riche, plus Pensif t’est utile.', accent: 'violet', top: 66, side: 'left', arrow: 'up' },
        ],
      },
    ],
  },
  {
    id: 'pensees',
    title: 'Pensées',
    views: [
      {
        id: 'pensees-liste',
        mock: 'pensees',
        callouts: [
          { n: 1, text: 'Tes pensées, classées par moment et par importance.', accent: 'blue', top: 8, side: 'left', arrow: 'up' },
          { n: 2, text: 'Filtre par proche pour retrouver ce qui le concerne.', accent: 'pink', top: 30, side: 'right', arrow: 'up' },
          { n: 3, text: 'Ajoute une pensée à la main avec le bouton +.', accent: 'violet', top: 62, side: 'left', arrow: 'down' },
          { n: 4, text: 'Ou capture-la à la voix avec le micro.', accent: 'blue', top: 80, side: 'right', arrow: 'down' },
        ],
      },
      {
        id: 'pensees-capture',
        mock: 'capture',
        callouts: [
          { n: 1, text: 'Maintiens le micro et parle : Pensif comprend la date, le rappel et le proche.', accent: 'blue', top: 10, side: 'left', arrow: 'down' },
          { n: 2, text: 'Tu vérifies la pensée avant de l’enregistrer.', accent: 'pink', top: 42, side: 'right', arrow: 'left' },
          { n: 3, text: 'Ta voix sert uniquement à transformer ta capture en pensée.', accent: 'violet', top: 70, side: 'left', arrow: 'up' },
        ],
      },
    ],
  },
  {
    id: 'calendrier',
    title: 'Calendrier',
    views: [
      {
        id: 'calendrier-mois',
        mock: 'calendrierMois',
        callouts: [
          { n: 1, text: 'Vue Mois : chaque point est un repère (anniversaire, pensée, fête).', accent: 'blue', top: 8, side: 'left', arrow: 'up' },
          { n: 2, text: 'Touche un jour pour voir son détail.', accent: 'pink', top: 44, side: 'right', arrow: 'left' },
          { n: 3, text: 'Ajoute une pensée depuis une date.', accent: 'violet', top: 72, side: 'left', arrow: 'down' },
        ],
      },
      {
        id: 'calendrier-semaine',
        mock: 'calendrierSemaine',
        callouts: [
          { n: 1, text: 'Vue Semaine : ta semaine jour par jour.', accent: 'blue', top: 10, side: 'left', arrow: 'up' },
          { n: 2, text: 'Le détail de chaque jour, avec ses repères.', accent: 'pink', top: 48, side: 'right', arrow: 'left' },
        ],
      },
    ],
  },
];

export const TUTORIAL_PAGE_COUNT = TUTORIAL_PAGES.length;

/** Index de la page suivante, ou `null` si on est déjà sur la dernière (→ fin du tutoriel). */
export function nextTutorialPage(index: number, total: number = TUTORIAL_PAGE_COUNT): number | null {
  return index + 1 < total ? index + 1 : null;
}

export function isLastTutorialPage(index: number, total: number = TUTORIAL_PAGE_COUNT): boolean {
  return index >= total - 1;
}

/** Libellé du bouton de droite : "Continuer >" partout, "Terminer" sur la dernière page. */
export function tutorialContinueLabel(index: number, total: number = TUTORIAL_PAGE_COUNT): string {
  return isLastTutorialPage(index, total) ? 'Terminer' : 'Continuer >';
}

/**
 * Le tutoriel ne s'affiche qu'UNE fois, pour un NOUVEL utilisateur : flag jamais posé (`seen === false`,
 * `null` = pas encore lu → jamais affiché), store prêt, auth gate passé, prénom saisi (pas de tutoriel
 * par-dessus la modale prénom) et aucune donnée existante (un utilisateur déjà installé ne le voit pas).
 */
export function shouldShowTutorial(input: {
  seen: boolean | null;
  ready: boolean;
  authGateNone: boolean;
  hasUserName: boolean;
  namePromptOpen: boolean;
  hasData: boolean;
}): boolean {
  if (input.seen !== false) return false;
  if (!input.ready || !input.authGateNone) return false;
  if (!input.hasUserName || input.namePromptOpen) return false;
  return !input.hasData;
}
