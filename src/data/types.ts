export type Contact = {
  id: string;
  prenom: string;
  nom: string;
  tel: string;
  /** Format 'YYYY-MM-DD' */
  date: string;
  relation: string;
  initials: string;
  color: string;
  q1: string;
  q2: string;
  q3: string;
  giftSent: boolean;
  favorite: boolean;
};

export type ReminderOffset = '0' | '1' | '3' | '7' | '14';

export type Pensee = {
  id: string;
  /** Format 'YYYY-MM-DD' */
  date: string;
  texte: string;
  remind: ReminderOffset;
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
};
