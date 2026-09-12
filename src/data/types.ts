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
  | 'danse';

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

export type ReminderOffset = '0' | '1' | '3' | '7' | '14' | 'custom';

export type Pensee = {
  id: string;
  /** Format 'YYYY-MM-DD' — début de la période pour une pensée de période. */
  date: string;
  /** Format 'YYYY-MM-DD', inclusive — renseigné seulement pour une pensée de période (surlignage). */
  endDate?: string | null;
  texte: string;
  remind: ReminderOffset;
  /** Délai personnalisé avant l'événement, en minutes — uniquement quand remind === 'custom'. */
  customOffsetMinutes?: number | null;
  contactId: string | null;
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
