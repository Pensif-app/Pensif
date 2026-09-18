// CHANTIER "Capture robustness — Pensif/Pansif" (2026-09-18). Normalisation DÉTERMINISTE et TRÈS
// CIBLÉE du transcript brut, appliquée AVANT tout envoi au LLM (voir index.ts) — corrige une erreur
// de transcription STT récurrente et précise (Whisper/Groq confondent le nom de marque "Pensif"
// avec le mot inexistant "Pansif"), jamais une correction linguistique générale.
//
// AUCUNE ambition NLP ici (voir consigne explicite "ne pas recoder un moteur linguistique fragile") :
// une seule substitution ciblée, sur un mot précis, avec limite de mot (`\b`) pour ne JAMAIS toucher
// l'adjectif français normal "pensif" ("il avait l'air pensif" reste inchangé — mot différent,
// jamais une sous-chaîne de "pansif"/"Pansif").
const PANSIF_WORD_PATTERN = /\bpansif\b/gi;

/** Remplace toute occurrence du mot "pansif" (insensible à la casse) par "Pensif" — jamais une
 *  substitution partielle/sous-chaîne (limites de mot des deux côtés). PURE, aucune dépendance. */
export function normalizeBrandMentions(text: string): string {
  return text.replace(PANSIF_WORD_PATTERN, 'Pensif');
}
