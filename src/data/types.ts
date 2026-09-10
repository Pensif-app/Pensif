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
  | 'nature';

export type BudgetBand = '0-20' | '20-50' | '50-100' | '100+';

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
  | 'Cousine'
  | 'Autre';

export type QuizAnswer = 'A' | 'B';

export type QuizProfile = {
  /** Une réponse par question du Petit Quiz, dans l'ordre de QUIZ_QUESTIONS. */
  answers: QuizAnswer[];
  interests: InterestTag[];
  avoid: InterestTag[];
  wish: string;
  budget: BudgetBand | null;
  /** Format ISO */
  completedAt: string;
};

export type Contact = {
  id: string;
  prenom: string;
  nom: string;
  tel: string;
  /** Format 'YYYY-MM-DD' */
  date: string;
  relation: string;
  /** Précision du lien familial quand relation === 'Famille' (Père, Mère, Grand-mère…). */
  familyRole: FamilyRole | null;
  genre: Genre | null;
  initials: string;
  color: string;
  quiz: QuizProfile | null;
  giftSent: boolean;
  favorite: boolean;
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

export type GiftIdea = {
  id: string;
  title: string;
  price: number;
  why: string;
  emoji: string;
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
