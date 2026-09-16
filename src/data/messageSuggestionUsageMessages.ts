// Traduction des codes internes de protection serveur "Réponses intelligentes" (voir
// supabase/functions/suggest-message/rateLimit.ts) en messages GÉNÉRIQUES affichés à l'utilisateur —
// ne JAMAIS afficher le code brut, un seuil ou le mot "quota". Pure, sans dépendance réseau —
// testable indépendamment de messageSuggestionApi.ts. Espace de noms distinct de
// captureUsageMessages.ts (codes/messages propres à cette fonctionnalité, jamais mélangés).
export const MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE = 'Vous allez un peu vite. Réessayez dans quelques instants.';
const MESSAGE_SUGGESTION_BLOCKED_FALLBACK_MESSAGE = 'La personnalisation est momentanément indisponible. Réessayez plus tard.';

export function mapMessageSuggestionBlockedCodeToMessage(code: unknown): string {
  switch (code) {
    case 'MESSAGE_SUGGESTION_RATE_LIMIT_MINUTE':
    case 'MESSAGE_SUGGESTION_RATE_LIMIT_HOUR':
      return MESSAGE_SUGGESTION_RATE_LIMIT_MESSAGE;
    default:
      // Code inconnu/absent — message générique plutôt que de propager un code interne non reconnu.
      return MESSAGE_SUGGESTION_BLOCKED_FALLBACK_MESSAGE;
  }
}
