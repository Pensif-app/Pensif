// CHANTIER CAPTURE INTELLIGENTE — matching déterministe proche entendu → contact local. Le LLM ne
// renvoie qu'un nom brut (`heardContactName`, voir captureTypes.ts) ; c'est Pensif, ici, qui décide
// — jamais le fournisseur IA, et jamais d'UUID envoyé au LLM. Pur (aucun import react-native/expo),
// testable sous ts-node.
//
// V2 (CHANTIER MATCHING FUZZY/PHONÉTIQUE) : l'exact reste TOUJOURS prioritaire et absolu — le
// fuzzy n'est même jamais évalué si un exact match existe (voir garde `if (exactCandidates.length)`
// avant tout calcul fuzzy plus bas). Le fuzzy ne sert qu'à récupérer certaines erreurs de
// reconnaissance vocale réellement observées (Micka/Mika, Sofia/Sophia, Yohan/Yoann/Johan), jamais
// à rapprocher des prénoms français distincts qui se ressemblent orthographiquement (Julien/Julie,
// Simon/Simone, Paul/Paule — voir `isPrefixRelation`, le garde-fou qui les exclut explicitement).
import { Contact } from './types';

export type ContactMatchResult =
  | { kind: 'none' } // aucun nom entendu
  | { kind: 'exact'; contactId: string }
  | { kind: 'exact_ambiguous'; candidateContactIds: string[] } // plusieurs proches partagent EXACTEMENT ce prénom
  | { kind: 'fuzzy_high_confidence'; contactId: string } // un seul candidat plausible, à confirmer par l'utilisateur
  | { kind: 'ambiguous'; candidateContactIds: string[] } // plusieurs candidats fuzzy plausibles — jamais de choix silencieux
  | { kind: 'unmatched' }; // aucun proche local ne correspond, même approximativement

// Écrit via une boucle sur les code points (codes U+0300 à U+036F, marques diacritiques combinantes
// après décomposition NFD) plutôt qu'une regex à échappement unicode, pour éviter toute ambiguïté
// d'encodage selon l'outil qui édite ce fichier — même précaution que stripControlChars (supabase.ts).
function stripCombiningDiacritics(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x0300 || code > 0x036f) out += value[i];
  }
  return out;
}

/** Insensible à la casse et aux accents ("Micka" === "micka" === "mickà") — une variation de saisie
 *  ou de reconnaissance vocale ne doit jamais faire manquer une correspondance évidente. */
function normalizeName(value: string): string {
  return stripCombiningDiacritics(value.normalize('NFD')).trim().toLowerCase();
}

// ───────────────────────── Fuzzy/phonétique (fallback uniquement) ─────────────────────────

const FUZZY_LEVENSHTEIN_RATIO_THRESHOLD = 0.8;
const FUZZY_MAX_ABSOLUTE_DISTANCE_LEVENSHTEIN = 2;
const FUZZY_MAX_ABSOLUTE_DISTANCE_PHONETIC = 3;
/** Sous cette longueur, un nom n'est jamais candidat au fuzzy — trop court pour qu'une similarité
 *  soit significative (évite les correspondances trop permissives sur les noms très courts). */
const FUZZY_MIN_NAME_LENGTH = 3;

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

/**
 * Transformations phonétiques FR EXPLICITES et volontairement peu nombreuses (pas une table
 * prénom→variantes, pas un algorithme phonétique général type Soundex qui serait trop permissif) :
 * 1. digraphe "ph" → "f" (Sophia/Sofia, Philippe/Filip...) — règle orthographique sûre et connue.
 * 2. "h" muet supprimé, SAUF s'il suit un "c" (le digraphe "ch" change le son, jamais silencieux) —
 *    récupère Yohan/Yoan, Nathan/Natan, etc. sans toucher à "ch".
 * 3. consonne doublée → simple pour n/m/l, phonétiquement neutre en français (Yoann→Yoan).
 * 4. alternance "Jo-"/"Yo-" UNIQUEMENT en tête de prénom (Johan/Yohan) — jamais une alternance J/Y
 *    générale ailleurs dans le mot, qui serait beaucoup trop permissive.
 * Volontairement PAS de règle du type "Mickaël → Micka" : un diminutif reste un prénom
 * potentiellement différent, jamais fusionné automatiquement.
 */
function foldPhoneticFr(normalized: string): string {
  let out = normalized.split('ph').join('f');
  let strippedH = '';
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 'h' && out[i - 1] !== 'c') continue;
    strippedH += out[i];
  }
  out = strippedH;
  out = out.split('nn').join('n').split('mm').join('m').split('ll').join('l');
  if (out.startsWith('jo')) out = `yo${out.slice(2)}`;
  return out;
}

/** Un nom strictement préfixe de l'autre (ex. "julie"/"julien", "paul"/"paule", "simon"/"simone")
 *  signale très souvent deux prénoms français DISTINCTS (variante masculin/féminin, diminutif),
 *  jamais une simple erreur de reconnaissance vocale — exclu du fuzzy dans les deux branches. */
function isPrefixRelation(a: string, b: string): boolean {
  return a !== b && (a.startsWith(b) || b.startsWith(a));
}

function isFuzzyMatch(heardNormalized: string, contactNormalized: string): boolean {
  if (heardNormalized.length < FUZZY_MIN_NAME_LENGTH || contactNormalized.length < FUZZY_MIN_NAME_LENGTH) return false;
  if (isPrefixRelation(heardNormalized, contactNormalized)) return false;

  const distance = levenshteinDistance(heardNormalized, contactNormalized);
  const ratio = 1 - distance / Math.max(heardNormalized.length, contactNormalized.length);
  const strictLevenshtein = ratio >= FUZZY_LEVENSHTEIN_RATIO_THRESHOLD && distance <= FUZZY_MAX_ABSOLUTE_DISTANCE_LEVENSHTEIN;
  const phoneticMatch = foldPhoneticFr(heardNormalized) === foldPhoneticFr(contactNormalized) && distance <= FUZZY_MAX_ABSOLUTE_DISTANCE_PHONETIC;
  return strictLevenshtein || phoneticMatch;
}

// ───────────────────────────────────── Point d'entrée ─────────────────────────────────────

/**
 * Ne compare que le prénom (`contact.prenom`) — c'est ce qu'on entend dans une dictée naturelle
 * ("Micka", jamais "Micka Dupont"). L'exact est TOUJOURS évalué en premier et est prioritaire dans
 * tous les cas : si un exact match existe (unique ou multiple), le fuzzy n'est même pas calculé.
 */
export function matchContactByHeardName(heardContactName: string | null, contacts: Contact[]): ContactMatchResult {
  if (!heardContactName || !heardContactName.trim()) return { kind: 'none' };
  const normalizedHeard = normalizeName(heardContactName);

  const exactCandidates = contacts.filter((c) => normalizeName(c.prenom) === normalizedHeard);
  if (exactCandidates.length === 1) return { kind: 'exact', contactId: exactCandidates[0].id };
  if (exactCandidates.length > 1) return { kind: 'exact_ambiguous', candidateContactIds: exactCandidates.map((c) => c.id) };

  const fuzzyCandidates = contacts.filter((c) => isFuzzyMatch(normalizedHeard, normalizeName(c.prenom)));
  if (fuzzyCandidates.length === 1) return { kind: 'fuzzy_high_confidence', contactId: fuzzyCandidates[0].id };
  if (fuzzyCandidates.length > 1) return { kind: 'ambiguous', candidateContactIds: fuzzyCandidates.map((c) => c.id) };
  return { kind: 'unmatched' };
}
