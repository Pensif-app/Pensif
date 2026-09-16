// Garantie déterministe (2026-09-16) — CHANTIER RÉPONSES INTELLIGENTES. Décision produit : aucune
// suggestion Pensif ne doit jamais contenir de tiret cadratin (—) ni de demi-cadratin (–), même si
// le prompt système l'interdit déjà (règle 8, prompt.ts) et que le modèle l'ignore malgré tout.
//
// Stratégie (validée avant implémentation, car un remplacement générique naïf casserait une plage
// numérique) :
//   1. Une plage numérique ("10–15", "20 – 25 ans") est le seul cas où le tiret porte un sens qu'une
//      virgule romprait ("10, 15" serait faux) : réécrite avec "à" AVANT la passe générique.
//   2. Tout tiret restant (cadratin/demi-cadratin, espacé ou non) marque une pause ou une incise en
//      français courant : remplacé par une virgule, qui ne casse jamais la grammaire de la phrase.
//   3. Nettoyage : une virgule qui se retrouve juste avant une autre ponctuation, en tout début, ou en
//      fin de message (tiret initial de liste, tiret final tronqué) est supprimée plutôt que laissée
//      orpheline, puis les espaces multiples introduits par les remplacements sont recollapsés.
const DASH_CHARS = /[–—]/;
const NUMERIC_RANGE = /(\d)\s*[–—]\s*(\d)/g;
const ANY_REMAINING_DASH = /\s*[–—]\s*/g;
const ORPHAN_COMMA_BEFORE_PUNCTUATION = /,\s*(?=[,.;:!?]|$)/g;
const LEADING_COMMA = /^\s*,\s*/;
const MULTIPLE_SPACES = /[ \t]{2,}/g;
// Uniquement , et . : le français utilise volontairement une espace avant ! ? ; : (jamais à retirer).
const SPACE_BEFORE_COMMA_OR_PERIOD = /[ \t]+([,.])/g;

/** Réécrit tout tiret cadratin/demi-cadratin résiduel vers une ponctuation française naturelle, sans
 *  jamais laisser de phrase grammaticalement cassée (virgule orpheline, espaces dupliqués). Idempotent
 *  et sans effet si le texte ne contient aucun tiret. */
export function normalizeDashPunctuation(text: string): string {
  if (!DASH_CHARS.test(text)) return text;

  let result = text.replace(NUMERIC_RANGE, '$1 à $2').replace(ANY_REMAINING_DASH, ', ');

  result = result.replace(ORPHAN_COMMA_BEFORE_PUNCTUATION, '').replace(LEADING_COMMA, '');

  return result.replace(MULTIPLE_SPACES, ' ').replace(SPACE_BEFORE_COMMA_OR_PERIOD, '$1').trim();
}
