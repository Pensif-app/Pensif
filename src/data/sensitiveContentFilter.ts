// CHANTIER RÉPONSES INTELLIGENTES — filet de sécurité V1 pour les données sensibles (2026-09-16).
//
// ⚠️ CE QUE C'EST : une heuristique LEXICALE déterministe, un filet de sécurité automatique — PAS
// une classification exhaustive ou sémantique du contenu sensible. Elle ne comprend pas le sens
// d'une pensée, elle détecte des motifs de mots appartenant à des catégories jugées sensibles.
// Volontairement conçue pour SUR-exclure plutôt que SOUS-exclure (un faux positif coûte un message
// un peu plus simple ; un faux négatif exposerait un sujet sensible au modèle — l'asymétrie de
// risque justifie ce choix). Ne remplace pas un futur contrôle explicite de l'utilisateur (flag
// manuel), volontairement PAS fait en V1 pour ne pas ajouter de modèle de données/sync/UX avant
// d'avoir une protection automatique de base.
//
// PÉRIMÈTRE STRICT — ce module n'est utilisé QUE par messageSuggestion.ts (chemin de génération
// automatique de message). Il ne touche JAMAIS :
// - aux données locales (aucune pensée n'est supprimée/modifiée/masquée où que ce soit ailleurs) ;
// - à l'affichage des pensées (PenseesScreen, MemorizedPenseesScreen, FicheScreen...) ;
// - à la composition manuelle d'un message (MessageScreen sans "Personnaliser avec Pensif") ;
// - à Capture (aucun import, aucune dépendance).
//
// Catégories V1 (scope validé) : santé physique, santé mentale, deuil/décès, addictions,
// violence/abus. Volontairement HORS SCOPE V1 : difficultés financières, licenciement, autres
// situations de vie — leur pertinence relationnelle dépend trop du contexte pour une heuristique
// lexicale (une phrase "vient de perdre son emploi" peut être une information neutre à célébrer
// positivement une fois retrouvée, contrairement à une hospitalisation).
import { normalizeSearchText } from './searchText';

export type SensitiveCategory = 'sante_physique' | 'sante_mentale' | 'deuil' | 'addictions' | 'violence_abus';

// Termes déjà en minuscules SANS accent (comparés après normalizeSearchText, qui fait la même
// normalisation côté texte à analyser — un seul et même traitement des deux côtés).
//
// Deux formes de terme :
// - une CHAÎNE = racine ouverte : le pattern ajoute un `\w*` final pour absorber pluriels/suffixes
//   (ex. "hospitalis" → hospitalisé/hospitalisée/hospitalisation/hospitalisations) — réservé aux
//   racines SANS mot français courant non lié qui commence pareil (vérifié terme par terme).
// - `{ exact: [...] }` = ensemble FERMÉ de formes exactes, frontière lexicale des DEUX côtés — pour
//   une racine trop courte/ambiguë dont un suffixe libre produirait un faux positif connu (ex. "viol"
//   en racine ouverte matcherait aussi "violette"/"violet"/"violon"/"violoniste" : sans rapport avec
//   la catégorie et bien trop courants pour rester une racine ouverte).
//
// "mort"/"mourir" volontairement ABSENTS de la catégorie deuil : trop génériques en français courant
// ("mort de rire", "mort de faim", "à mourir de rire"...) — inclure ces racines produirait des faux
// positifs si fréquents que le filtre perdrait toute utilité pratique. On s'appuie sur des ancres
// plus spécifiques (décès, obsèques, funérailles, enterrement, deuil) qui ne souffrent pas de ce
// problème d'usage idiomatique.
type TermSpec = string | { exact: string[] };

const SENSITIVE_TERMS: Record<SensitiveCategory, TermSpec[]> = {
  sante_physique: [
    'maladie', 'malade', 'diagnostic', 'hospitalis', 'hopital', 'operation', 'opere',
    'chirurgie', 'cancer', 'tumeur', 'chimiotherapie', 'chimio', 'biopsie', 'symptome',
    'ambulance', 'diabete', 'handicap', 'traitement medical', 'maladie chronique',
  ],
  sante_mentale: [
    'depressi', 'depression', 'anxiete', 'anxieux', 'anxieuse', 'angoisse', 'burnout',
    'burn out', 'therapie', 'psychotherapie', 'psychologue', 'psychiatre', 'suicid',
  ],
  deuil: ['deuil', 'deces', 'decede', 'enterrement', 'obseques', 'funerailles'],
  addictions: [
    'addiction', 'addict', 'alcoolisme', 'alcoolique', 'toxicomanie', 'toxicomane',
    'drogue', 'sevrage', 'desintox',
  ],
  violence_abus: [
    // "violen" (pas "violence") : racine ouverte SÛRE qui couvre violence/violent/violente/
    // violences sans collision connue — "violence" seul aurait raté "violent"/"violente" (le
    // suffixe diverge avant la fin du mot "violence"). "violemment" a une orthographe (double m)
    // qui ne partage pas ce préfixe — ajouté séparément juste en dessous.
    'violen', 'violemment',
    'agression', 'agresse', 'abus', 'maltraitance', 'harcelement',
    // "viol" en racine ouverte matcherait "violet(te)"/"violon(iste)" — ensemble fermé à la place.
    { exact: ['viol', 'viole', 'violee', 'violees', 'violes', 'violeur', 'violeurs'] },
  ],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Racine ouverte : `\b` avant le terme évite un match en plein milieu d'un mot (ex. "viol" — s'il
 *  était utilisé ici — ne matcherait jamais dans "violence", le "e" qui suit "viol" étant un
 *  caractère de mot, donc pas de frontière lexicale à cet endroit). `\w*` final absorbe les
 *  suffixes/pluriels sans avoir à les lister un par un — réservé aux racines vérifiées sans
 *  collision (voir commentaire au-dessus de SENSITIVE_TERMS). */
function buildOpenTermPattern(term: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(term)}\\w*`);
}

/** Ensemble fermé : frontière lexicale des DEUX côtés (`\b...\b`) — la forme doit apparaître seule,
 *  aucun suffixe accepté. Utilisé pour une racine trop courte/ambiguë (voir "viol" ci-dessus). */
function buildExactTermPattern(term: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`);
}

function buildTermPattern(spec: TermSpec): RegExp[] {
  if (typeof spec === 'string') return [buildOpenTermPattern(spec)];
  return spec.exact.map(buildExactTermPattern);
}

const CATEGORY_PATTERNS: Record<SensitiveCategory, RegExp[]> = Object.fromEntries(
  (Object.keys(SENSITIVE_TERMS) as SensitiveCategory[]).map((category) => [
    category,
    SENSITIVE_TERMS[category].flatMap(buildTermPattern),
  ]),
) as Record<SensitiveCategory, RegExp[]>;

/** Catégories détectées dans `text` (peut en retourner plusieurs) — utile pour les tests et un futur
 *  diagnostic, jamais exposé au modèle ni à l'utilisateur en V1. */
export function detectSensitiveCategories(text: string): SensitiveCategory[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];
  return (Object.keys(CATEGORY_PATTERNS) as SensitiveCategory[]).filter((category) =>
    CATEGORY_PATTERNS[category].some((pattern) => pattern.test(normalized)),
  );
}

/** Point d'entrée utilisé par messageSuggestion.ts — `true` si CE texte doit être exclu du contexte
 *  envoyé à suggest-message. Ne dit rien de plus que "exclure ou non" : la donnée elle-même n'est
 *  jamais tronquée/modifiée, seulement écartée en bloc de la sélection. */
export function isSensitiveText(text: string): boolean {
  return detectSensitiveCategories(text).length > 0;
}
