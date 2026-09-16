// CHANTIER PENSÉES V3 — normalisation de texte pour la recherche locale (écran "Pensées
// mémorisées"). Casse, espaces superflus ET accents (décomposition NFD + suppression des marques
// combinantes Unicode U+0300-U+036F — même technique déjà utilisée côté matching de contact
// Capture, réécrite ici en version minimale et EXPORTÉE : contactMatching.ts n'exporte pas la
// sienne, et ce fichier n'a aucune raison de dépendre du module de matching Capture, hors périmètre
// de ce chantier). Recherche locale pure — aucun réseau, aucun LLM, aucun token consommé.
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** `true` si `haystack` contient `query` une fois les deux normalisés — `query` vide matche toujours
 *  (aucun filtre appliqué), jamais une erreur sur une chaîne vide. */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return normalizeSearchText(haystack).includes(q);
}
