import NetInfo from '@react-native-community/netinfo';

/**
 * CHANTIER SYNC OFFLINE→SUPABASE : le projet n'avait aucun mécanisme de détection du retour réseau
 * (audité — aucune référence à NetInfo/isConnected avant ce chantier). Sans ça, le drain de l'outbox
 * ne pouvait se déclencher qu'au boot ou au retour au premier plan (AppState → active) — jamais si
 * l'utilisateur réactive Internet SANS mettre l'app en arrière-plan.
 *
 * Abonnement unique, piloté par événements natifs (`NetInfo.addEventListener`) — aucun polling.
 * Ne notifie QUE sur la transition offline→online (jamais à chaque événement réseau, qui peut être
 * bruyant), pour que l'appelant puisse déclencher un drain sans avoir à dédupliquer lui-même.
 */
export function subscribeToConnectivityRestored(onRestored: () => void): () => void {
  let wasOffline = false;
  const unsubscribe = NetInfo.addEventListener((state) => {
    // `isInternetReachable` peut valoir `null` (indéterminé) juste après le démarrage — traité comme
    // "pas confirmé en ligne" plutôt que comme "en ligne", pour ne pas déclencher un drain prématuré.
    const online = state.isConnected === true && state.isInternetReachable !== false;
    if (!online) {
      wasOffline = true;
      return;
    }
    if (wasOffline) {
      wasOffline = false;
      onRestored();
    }
  });
  return unsubscribe;
}
