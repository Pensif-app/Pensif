// Contrat de l'Edge Function `suggest-message` — CHANTIER RÉPONSES INTELLIGENTES, incrément 1
// (2026-09-16). Types autonomes, volontairement DUPLIQUÉS depuis src/data/messageSuggestion.ts
// (incrément 0, côté app) plutôt qu'importés : cette fonction Deno n'a aucune dépendance vers
// src/, exactement comme `capture` ne dépend d'aucun fichier hors de son propre dossier +
// `_shared/`. Toute évolution du contrat doit rester synchronisée manuellement des deux côtés — le
// client re-sérialise `MessageSuggestionContext` (déjà exactement cette forme) en JSON tel quel.
export type MessageOccasion = 'birthday' | 'thinking_of_you' | 'event';

export type MessageTone = 'chaleureux' | 'complice' | 'court';

export type MessageSuggestionOccasionContext =
  | { occasion: 'birthday'; daysUntil: number }
  | { occasion: 'thinking_of_you' }
  | { occasion: 'event'; texte: string; date: string };

export type MessageSuggestionContext = {
  contact: { prenom: string; genre: 'homme' | 'femme' | null; relation: string; familyRole: string | null };
  occasion: MessageSuggestionOccasionContext;
  quiz: { interests: string[]; wish: string } | null;
  pensees: { optional: true; items: string[] };
};

/** Corps de requête attendu par POST /suggest-message. */
export type SuggestMessageRequestBody = {
  context: MessageSuggestionContext;
  tone: MessageTone;
};

/** Contrat de réponse strict — la SEULE forme jamais renvoyée en cas de succès. */
export type SuggestMessageContract = {
  message: string;
};
