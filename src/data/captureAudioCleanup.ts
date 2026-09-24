// CHANTIER "Confidentialité V1 — nettoyage audio Capture" (2026-09-24). Logique PURE (aucun import
// expo/react-native) : le fichier `recording-<UUID>.m4a` créé par expo-audio dans le cache doit être
// supprimé dès qu'il n'est plus utile (transcription réussie/échouée, tap trop court, silence). La
// suppression réelle (expo-file-system, API `File`) est injectée par lib/captureAudio.ts — ce module reste
// testable sous tsx avec des faux fichiers.

export type DeletableFile = { exists: boolean; delete: () => void };

/** Supprime le fichier s'il existe. IDEMPOTENT et JAMAIS bloquant : URI absente, fichier déjà absent ou
 *  erreur native → no-op silencieux (le nettoyage ne doit jamais faire échouer une Capture). */
export function deleteAudioFile(uri: string | null | undefined, createFile: (uri: string) => DeletableFile): void {
  if (!uri) return;
  try {
    const file = createFile(uri);
    if (file.exists) file.delete();
  } catch {
    // avalé volontairement : un échec de nettoyage (cache) ne doit jamais remonter à l'utilisateur
  }
}

/** Exécute `work` (lecture + upload du fichier) puis SUPPRIME le fichier dans un `finally` : succès ou
 *  erreur, jamais AVANT la fin de `work`. Le résultat/l'erreur de `work` est propagé tel quel. */
export async function runWithAudioCleanup<T>(uri: string | null | undefined, work: () => Promise<T>, cleanup: (uri: string | null | undefined) => void): Promise<T> {
  try {
    return await work();
  } finally {
    cleanup(uri);
  }
}
