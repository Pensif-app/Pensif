// Traduction des codes internes de protection serveur Capture (§2, voir supabase/functions/capture/
// rateLimit.ts) en messages GÉNÉRIQUES affichés à l'utilisateur — ne JAMAIS afficher le code brut, un
// seuil, un compteur restant ou le mot "quota" : ces codes existent pour le diagnostic interne, pas
// pour l'UI. Pure, sans dépendance réseau — testable indépendamment de captureApi.ts.
export const CAPTURE_RATE_LIMIT_MESSAGE = 'Vous allez un peu vite. Réessayez dans quelques instants.';
export const CAPTURE_MONTHLY_CAP_MESSAGE = 'La capture vocale est temporairement indisponible pour ce compte.';
const CAPTURE_BLOCKED_FALLBACK_MESSAGE = 'La capture vocale est momentanément indisponible. Réessayez plus tard.';

export function mapCaptureBlockedCodeToMessage(code: unknown): string {
  switch (code) {
    case 'CAPTURE_RATE_LIMIT_MINUTE':
    case 'CAPTURE_RATE_LIMIT_HOUR':
      return CAPTURE_RATE_LIMIT_MESSAGE;
    case 'CAPTURE_MONTHLY_CAP':
      return CAPTURE_MONTHLY_CAP_MESSAGE;
    default:
      // Code inconnu/absent (ex. ancienne version du backend, ou champ manquant) — message
      // générique plutôt que de propager un code interne non reconnu à l'écran.
      return CAPTURE_BLOCKED_FALLBACK_MESSAGE;
  }
}
