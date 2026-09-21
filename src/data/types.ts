export type TraitKey = 'practical' | 'social' | 'curious' | 'sentimental' | 'experience';

export type InterestTag =
  | 'tech'
  | 'musique'
  | 'gaming'
  | 'sport'
  | 'cuisine'
  | 'mode'
  | 'voyage'
  | 'lecture'
  | 'collection'
  | 'maison'
  | 'auto'
  | 'nature'
  | 'cinema'
  | 'art'
  | 'bienetre'
  | 'animaux'
  | 'photo'
  | 'jardinage'
  | 'bricolage'
  | 'danse'
  // CHANTIER "Cadeaux V2 — Phase 5F" (2026-09-21) : config/quiz ajoutés dans cette passe, mais
  // AUCUN produit catalogue encore associé (voir giftCatalog.ts — pas de fabrication d'ASIN/prix/
  // image, voir consigne §8) — ces 3 thèmes ne sont donc PAS dans COVERED_THEMES tant que de vrais
  // produits n'ont pas été sourcés. Un contact peut déjà les sélectionner (INTEREST_OPTIONS,
  // quiz.ts) sans erreur : generateCandidates() retombe simplement sur le catalogue élargi
  // (< 6 candidats sur l'intérêt choisi), comme pour n'importe quel intérêt encore peu couvert.
  | 'jeux_societe'
  | 'beaute'
  | 'science';

/** Paliers de budget pour une recherche de recommandations (pas une caractéristique du contact —
 *  voir QuizProfile.budget). */
export type BudgetBand = '0-20' | '20-40' | '40-70' | '70-100' | '100+';

export type Genre = 'homme' | 'femme';

/** Lien de famille précis — sert entre autres à personnaliser la Fête des Mères/Pères/etc. */
export type FamilyRole =
  | 'Père'
  | 'Mère'
  | 'Frère'
  | 'Sœur'
  | 'Fils'
  | 'Fille'
  | 'Grand-père'
  | 'Grand-mère'
  | 'Oncle'
  | 'Tante'
  | 'Cousin'
  | 'Autre';

export type QuizAnswer = 'A' | 'B';

/** Raison donnée par l'utilisateur en tapant "Pas convaincu" sur une recommandation — sert à
 *  ajuster le scoring des prochaines idées (voir recommendationEngine.ts). */
export type RejectReason = 'has_it' | 'not_his_style' | 'too_classic' | 'too_expensive' | 'too_similar' | 'more_personal' | 'other';

export type QuizProfile = {
  /** Une réponse par question du Petit Quiz (portrait général), dans l'ordre de QUIZ_QUESTIONS. */
  answers: QuizAnswer[];
  interests: InterestTag[];
  avoid: InterestTag[];
  wish: string;
  /** Format ISO */
  completedAt: string;

  /** Réponses de l'affinage optionnel par thème (voir themeQuizzes.ts), indexées par thème puis
   *  par id de question — ex. themeAnswers.gaming.platform === 'playstation'. Absent sur les
   *  contacts créés avant cette fonctionnalité ; toujours lire via normalizeQuizProfile(). */
  themeAnswers: Partial<Record<InterestTag, Record<string, string>>>;

  /** Retours "Pas convaincu" mémorisés — exclut des produits/thèmes des futures recommandations
   *  et pondère le scoring (voir recommendationEngine.ts). */
  feedback: { asin?: string; theme?: InterestTag; reason: RejectReason; at: string }[];

  /** Léger historique des recommandations déjà montrées, pour ne pas re-proposer immédiatement
   *  les mêmes idées via "Voir d'autres idées". */
  recommendationHistory: { at: string; shownAsins: string[]; likedAsins: string[] }[];

  /** Ancien "budget habituel" demandé dans le quiz général — conservé uniquement pour pré-remplir
   *  le sélecteur de budget d'une recherche (voir GiftsScreen.tsx) ; le quiz général ne l'écrit
   *  plus (le budget appartient désormais à la recherche/occasion, pas au profil du contact). */
  budget: BudgetBand | null;
};

export type Contact = {
  id: string;
  prenom: string;
  nom: string;
  tel: string;
  /** Format 'YYYY-MM-DD' */
  date: string;
  relation: string;
  /** Lien précis, propre à chaque catégorie de relation (Père/Mère pour Famille, Meilleur/Proche
   *  pour Ami, Collègue/Connaissance pour Autres…). */
  familyRole: string | null;
  genre: Genre | null;
  initials: string;
  color: string;
  quiz: QuizProfile | null;
  /** Année (calendaire) de la prochaine/dernière occurrence d'anniversaire pour laquelle le cadeau
   *  a été marqué comme prévu — remplace l'ancien booléen `giftSent`, qui restait bloqué à `true`
   *  d'une année sur l'autre. `null` = rien de prévu pour l'occurrence en cours. Comparer à
   *  `occurrenceYear(contact.date, today)` (voir calendar.ts) pour savoir si c'est à jour. */
  giftPreparedYear: number | null;
  favorite: boolean;
  /** Rappel avant l'anniversaire, en jours (1 = la veille, 7 = J-7, 14 = J-14…) — null tant que
   *  l'utilisateur ne l'a pas réglé. L'alerte du jour J elle-même est toujours envoyée, quel que
   *  soit ce réglage (voir rescheduleAllReminders). */
  birthdayReminderDays: number | null;
};

/** Choix rapide utilisé au moment de LA SAISIE d'un rappel (Calendrier/Fiche pensée) — jamais
 *  persisté tel quel sur une `Pensee` (voir CHANTIER PENSÉES V2) : traduit en `reminderAt`, une
 *  date/heure absolue, dès l'enregistrement. */
export type ReminderOffset = '0' | '1' | '3' | '7' | '14' | 'custom';

// CHANTIER RAPPELS RÉCURRENTS — incrément 1 (2026-09-18), modèle pur uniquement (voir
// src/data/reminderRecurrence.ts pour les calculs). `reminderAt` reste INCHANGÉ et continue de
// représenter la date/heure de la PREMIÈRE occurrence — cette règle ne fait qu'ajouter une
// répétition à partir de ce même instant, jamais une seconde source de vérité pour l'heure.
export type ReminderRecurrenceFrequency = 'daily' | 'weekly';

export type ReminderRecurrence = {
  frequency: ReminderRecurrenceFrequency;
  /** 0=dimanche..6=samedi (convention `Date.getDay()`, jamais un découpage UTC). Ignoré pour
   *  'daily' (implicitement les 7 jours, normalisé à `[]` par `normalizeReminderRecurrence` — voir
   *  ce module) ; obligatoire et non vide pour 'weekly'. */
  daysOfWeek: number[];
  /** Nombre total d'occurrences autorisées (la première incluse), ou `null` = pas de limite par
   *  compte (voir `untilDate` pour une limite par date — les deux peuvent coexister : la règle
   *  s'arrête à la première des deux bornes atteintes). */
  occurrenceCount: number | null;
  /** 'YYYY-MM-DD', INCLUSIVE — dernier jour local où une occurrence peut avoir lieu, ou `null` =
   *  pas de limite par date. */
  untilDate: string | null;
};

export type Pensee = {
  id: string;
  texte: string;
  contactId: string | null;
  /** Horodatage ISO de création — informatif uniquement, jamais une date de rappel ni utilisé pour
   *  le classement (voir CHANTIER PENSÉES V2 §"séparer une pensée de sa temporalité"). Toujours
   *  renseigné pour une pensée créée depuis cette version ; une pensée plus ancienne sans ce champ
   *  est normalisée à la lecture (voir normalizePensee, calendar.ts) — ne jamais lire ce champ sans
   *  être passé par elle en dehors de la couche de persistance (store.tsx/supabaseRepo.ts).
   */
  createdAt: string;
  /** Format 'YYYY-MM-DD' — ancre calendrier explicite (jour choisi dans le Calendrier, ou début de
   *  période). Absente pour une pensée créée sans jour précis (note générique, éventuellement liée
   *  à un proche mais pas à une date) : elle n'apparaît alors dans aucune vue du Calendrier,
   *  seulement dans l'onglet Pensées — voir CHANTIER PENSÉES V2. */
  date?: string | null;
  /** Format 'YYYY-MM-DD', inclusive — renseigné seulement pour une pensée de période (surlignage). */
  endDate?: string | null;
  /** Date/heure ABSOLUE et autonome du rappel (ISO complet), ou `null`/absente = aucun rappel.
   *  Remplace l'ancien couple remind/customOffsetMinutes, qui dérivait toujours un rappel relatif à
   *  `date` — une pensée sans `date` peut désormais avoir un rappel tout comme une pensée avec
   *  `date`, les deux notions sont indépendantes. */
  reminderAt?: string | null;
  /** CHANTIER PENSÉES V3 (2026-09-16) — épingle une pensée en haut de l'écran Pensées, purement
   *  visuel/organisationnel : ne modifie JAMAIS `date`/`endDate`/`reminderAt` ni aucune autre donnée
   *  métier. `false`/absent = comportement inchangé. Aucun champ équivalent n'existait déjà sur
   *  `Pensee` (vérifié avant d'ajouter celui-ci — voir audit du chantier). */
  pinned?: boolean;
  /** CHANTIER RAPPELS RÉCURRENTS — incrément 1 (2026-09-18) : `null`/absent = comportement actuel
   *  inchangé à 100% (un unique `reminderAt`, jamais répété). Quand présent, `reminderAt` reste la
   *  date/heure de la PREMIÈRE occurrence — voir reminderRecurrence.ts pour le calcul des suivantes.
   *  Non exploité par aucun écran/notification à cet incrément (modèle pur uniquement). */
  reminderRecurrence?: ReminderRecurrence | null;
  /** CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18). Format 'HH:mm' (24h, local) — l'heure
   *  de l'ÉVÉNEMENT porté par `date`, STRICTEMENT INDÉPENDANTE de `reminderAt` (jamais copiée depuis
   *  ni vers elle — voir CaptureCard.eventHint, captureReview.ts). `null`/absent = aucune heure
   *  connue pour cet événement (comportement historique inchangé pour toute pensée qui n'en a pas).
   *  N'a de sens que si `date` est renseignée ; jamais utilisée pour construire un datetime combiné
   *  (voir consigne — `date` reste une date locale pure, jamais convertie). */
  eventTime?: string | null;
};

export type CalEventType = 'anniv' | 'pensee' | 'fete' | 'civil';

export type CalEvent = {
  type: CalEventType;
  label: string;
  kind: string;
  contactId?: string | null;
  penseeId?: string;
  /** Vient d'une pensée de période (surlignage) — affichée en bande continue, pas en point. */
  isPeriod?: boolean;
};
