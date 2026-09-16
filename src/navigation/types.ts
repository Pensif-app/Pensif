import { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Accueil: undefined;
  Contacts: undefined;
  // Ce que l'utilisateur a confié à Pensif (pensées) — remplace l'ancien onglet Cadeaux/"Pensée"
  // dans la tab bar (voir CHANTIER ONGLET PENSÉES V1). Les cadeaux sont désormais une destination
  // contextuelle du RootStack, jamais un onglet.
  // `contactId` optionnel : filtre de contexte (ex. Fiche → "Voir les pensées"), jamais un état
  // persistant — voir CHANTIER PROCHES + FICHE V1 §8/§9. Un tap direct sur l'onglet Pensées le
  // réinitialise toujours (voir tabNavigationHelpers.ts) ; l'onglet reste utilisable sans paramètre.
  Pensées: { contactId?: string } | undefined;
  // focusDate ('YYYY-MM-DD') optionnel : ouvre directement le mois/jour correspondant plutôt que
  // le mois courant — utilisé par l'Accueil/Pensées pour amener sur le détail d'une pensée (voir
  // §6 du chantier Accueil V1 : pas d'écran d'édition dédié, on réutilise le détail déjà affiché ici).
  Calendrier: { focusDate?: string } | undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Fiche: { contactId?: string } | undefined;
  Message: { contactId: string };
  Reglages: undefined;
  // `mode: 'edit'` (BUG "Refaire le quiz" — voir QuizScreen.tsx) : force une réédition explicite
  // depuis zéro (question 1, réponses de contact.quiz préremplies), en ignorant tout brouillon
  // résiduel — jamais un simple `push` seul, qui pouvait rouvrir un brouillon figé sur les
  // résultats. Absent/'default' = comportement normal (nouveau quiz, ou reprise d'un brouillon).
  Quiz: { contactId: string; mode?: 'default' | 'edit' };
  // Destination contextuelle (Accueil, Fiche, Calendrier, notification) — jamais un onglet.
  // `contactId` obligatoire : un écran Cadeaux doit toujours savoir pour quel proche il est ouvert,
  // plus de sélection implicite du "prochain contact avec quiz fait" (voir chantier).
  Cadeaux: { contactId: string };
  // Détail/édition d'une pensée (CHANTIER PENSÉES V2) — `penseeId` présent = édition d'une pensée
  // existante ; absent = création (avec un `contactId` optionnel pour pré-lier un proche, ex.
  // depuis Pensées filtré sur un proche).
  PenseeDetail: { penseeId?: string; contactId?: string } | undefined;
  // CHANTIER PENSÉES V3 (2026-09-16) — bibliothèque des pensées sans date (recherche + filtres
  // locaux), ouverte depuis "Voir toutes les pensées mémorisées" sur PenseesScreen. Aucun paramètre :
  // toujours la vue complète, non filtrée par proche (le filtre contact vit dans l'écran lui-même).
  PenseesMemorisees: undefined;
  // CHANTIER CAPTURE INTELLIGENTE V1 — parcours réel : Micro → Écoute → Analyse → Validation →
  // addPensee(). Point d'entrée du bouton micro (Accueil/Pensées).
  Capture: undefined;
  // Écran de DEBUG (chemin micro → backend → JSON brut affiché) — conservé pour diagnostic, mais
  // plus aucun bouton n'y mène depuis l'app (voir HomeScreen/PenseesScreen, remplacés par Capture).
  CaptureDebug: undefined;
};
