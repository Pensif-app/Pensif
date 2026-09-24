// CHANTIER "Confidentialité V1 — nettoyage audio Capture" (2026-09-24) — branchement expo-file-system
// (API moderne `File`, jamais l'API legacy) sur la logique pure de data/captureAudioCleanup.ts.
import { File } from 'expo-file-system';
import { deleteAudioFile } from '../data/captureAudioCleanup';

/** Supprime le fichier audio local d'une capture (idempotent, jamais bloquant, aucun log du contenu). */
export function deleteCaptureAudioFile(uri: string | null | undefined): void {
  deleteAudioFile(uri, (u) => new File(u));
}
