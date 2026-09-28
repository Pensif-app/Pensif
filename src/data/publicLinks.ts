// CHANTIER "Réglages — liens utiles" (2026-09-27). Liens PUBLICS vers les pages du site pensif-app.fr, centralisés ici (jamais
// dupliqués dans les écrans). Module PUR (aucun import expo/react-native) : l'ouverture réelle (Linking.openURL) est injectée
// par l'écran, ce qui rend la logique testable sous tsx. Mentions légales et Partenaires restent volontairement sur le site.

export const PUBLIC_SITE_ORIGIN = 'https://pensif-app.fr';

export type PublicLinkId = 'privacy' | 'support' | 'terms' | 'contact';

export type PublicLink = {
  id: PublicLinkId;
  label: string;
  url: string;
  /** Nom d'icône Ionicons (résolu par l'écran). */
  icon: 'shield-checkmark-outline' | 'help-circle-outline' | 'document-text-outline' | 'mail-outline';
};

export const PUBLIC_LINKS: readonly PublicLink[] = [
  { id: 'privacy', label: 'Politique de confidentialité', url: `${PUBLIC_SITE_ORIGIN}/confidentialite.html`, icon: 'shield-checkmark-outline' },
  { id: 'support', label: 'Support', url: `${PUBLIC_SITE_ORIGIN}/support.html`, icon: 'help-circle-outline' },
  { id: 'terms', label: 'Conditions d’utilisation', url: `${PUBLIC_SITE_ORIGIN}/conditions-utilisation.html`, icon: 'document-text-outline' },
  { id: 'contact', label: 'Contact', url: `${PUBLIC_SITE_ORIGIN}/contact.html`, icon: 'mail-outline' },
];

/** Une URL publique valide est en https et appartient à l'origine du site Pensif — jamais une URL arbitraire. */
export function isValidPublicUrl(url: string): boolean {
  return url.startsWith(`${PUBLIC_SITE_ORIGIN}/`) && !/\s/.test(url);
}

/**
 * Ouvre une URL publique dans le navigateur SYSTÈME (via `open`, ex. `Linking.openURL`). Ne lève JAMAIS : URL invalide ou
 * ouverture impossible → `false` (l'appelant affiche une alerte minimale), aucun crash.
 */
export async function openPublicUrl(url: string, open: (url: string) => Promise<unknown>): Promise<boolean> {
  if (!isValidPublicUrl(url)) return false;
  try {
    await open(url);
    return true;
  } catch {
    return false;
  }
}
