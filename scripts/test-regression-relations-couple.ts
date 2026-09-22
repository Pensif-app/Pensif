// Tests de non-régression — CHANTIER "Pré-TestFlight Phase 4B — Relations Couple" (2026-09-22).
// FicheScreen.tsx importe react-native et ne peut pas être chargé sous tsx (même constat que le
// reste de ce projet) — les fonctions concernées (normalizeRelation, coupleRoleOptions,
// swapFamilyRoleGender, genreForFamilyRole, RELATIONS) sont donc reproduites ici À L'IDENTIQUE de
// leur implémentation réelle (src/screens/FicheScreen.tsx), même méthode que
// test-regression-contacts-fiche.ts pour ce fichier. `rowToContact`/mapping Supabase sont vérifiés
// par lecture de source (supabaseRepo.ts fait un pass-through strict, aucune logique relation-
// spécifique — voir §5 ci-dessous), pas par un appel réseau réel.
//
// Usage : npx tsx scripts/test-regression-relations-couple.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

// --- Reproduction fidèle de FicheScreen.tsx (voir ce fichier pour l'original) -------------------
type Genre = 'homme' | 'femme';

const RELATIONS = ['Famille', 'Couple', 'Ami', 'Autres'];
const FAMILY_ROLE_PAIRS: { m: string; f: string }[] = [
  { m: 'Père', f: 'Mère' },
  { m: 'Frère', f: 'Sœur' },
  { m: 'Fils', f: 'Fille' },
  { m: 'Grand-père', f: 'Grand-mère' },
  { m: 'Oncle', f: 'Tante' },
  { m: 'Cousin', f: 'Cousine' },
];
const COUPLE_ROLE_PAIRS: { m: string; f: string }[] = [
  { m: 'Petit ami', f: 'Petite amie' },
  { m: 'Fiancé', f: 'Fiancée' },
  { m: 'Mari', f: 'Épouse' },
];
const GENDERED_ROLE_PAIRS = [...FAMILY_ROLE_PAIRS, ...COUPLE_ROLE_PAIRS];

function familyRoleOptions(genre: Genre | null): string[] {
  if (genre === 'homme') return [...FAMILY_ROLE_PAIRS.map((p) => p.m), 'Autre'];
  if (genre === 'femme') return [...FAMILY_ROLE_PAIRS.map((p) => p.f), 'Autre'];
  return [...FAMILY_ROLE_PAIRS.flatMap((p) => [p.m, p.f]), 'Autre'];
}
function coupleRoleOptions(genre: Genre | null): string[] {
  if (genre === 'homme') return ['Partenaire', ...COUPLE_ROLE_PAIRS.map((p) => p.m)];
  if (genre === 'femme') return ['Partenaire', ...COUPLE_ROLE_PAIRS.map((p) => p.f)];
  return ['Partenaire', ...COUPLE_ROLE_PAIRS.flatMap((p) => [p.m, p.f])];
}
function swapFamilyRoleGender(role: string | null, genre: Genre | null): string | null {
  if (!role || !genre) return role;
  const pair = GENDERED_ROLE_PAIRS.find((p) => p.m === role || p.f === role);
  if (!pair) return role;
  return genre === 'homme' ? pair.m : pair.f;
}
function genreForFamilyRole(role: string): Genre | null {
  const pair = GENDERED_ROLE_PAIRS.find((p) => p.m === role || p.f === role);
  if (!pair) return null;
  return pair.m === role ? 'homme' : 'femme';
}
function normalizeRelation(r?: string | null): string {
  if (r === 'Amie') return 'Ami';
  if (r === 'Collègue' || r === 'Autre') return 'Autres';
  return r && RELATIONS.includes(r) ? r : RELATIONS[0];
}
// -------------------------------------------------------------------------------------------------

console.log('\n[1] Couple reconnu par normalizeRelation');
{
  check('normalizeRelation("Couple") → "Couple" (reconnue, pas ramenée au défaut)', normalizeRelation('Couple') === 'Couple');
  check('"Couple" présente dans RELATIONS (source de vérité UI)', RELATIONS.includes('Couple'));
  check('catégories existantes conservées à l’identique : Famille, Ami, Autres toujours présentes', ['Famille', 'Ami', 'Autres'].every((r) => RELATIONS.includes(r)));
}

console.log('\n[2] Couple + les 4 liens précis attendus (Partenaire neutre, 3 paires genrées)');
{
  check('coupleRoleOptions(null) contient les 4 valeurs (Partenaire + 3 paires non genrées = 7 au total)', coupleRoleOptions(null).length === 7);
  check('coupleRoleOptions(null) contient "Partenaire"', coupleRoleOptions(null).includes('Partenaire'));
  check('coupleRoleOptions("homme") = Partenaire, Petit ami, Fiancé, Mari (4 exactement)', JSON.stringify(coupleRoleOptions('homme')) === JSON.stringify(['Partenaire', 'Petit ami', 'Fiancé', 'Mari']));
  check('coupleRoleOptions("femme") = Partenaire, Petite amie, Fiancée, Épouse (4 exactement)', JSON.stringify(coupleRoleOptions('femme')) === JSON.stringify(['Partenaire', 'Petite amie', 'Fiancée', 'Épouse']));
  check('"Compagnon"/"Compagne" absents (explicitement hors périmètre de cette passe)', !coupleRoleOptions(null).includes('Compagnon') && !coupleRoleOptions(null).includes('Compagne'));

  // Couple + chacun des 7 libellés demandés explicitement par la consigne §8.
  for (const label of ['Partenaire', 'Petit ami', 'Petite amie', 'Fiancé', 'Fiancée', 'Mari', 'Épouse']) {
    check(`"${label}" est un lien précis valide pour relation=Couple`, coupleRoleOptions(null).includes(label));
  }
}

console.log('\n[3] "Partenaire" reste neutre — jamais swappé ni déduit par genre');
{
  check('swapFamilyRoleGender("Partenaire", "homme") ne change rien (pas dans GENDERED_ROLE_PAIRS)', swapFamilyRoleGender('Partenaire', 'homme') === 'Partenaire');
  check('swapFamilyRoleGender("Partenaire", "femme") ne change rien', swapFamilyRoleGender('Partenaire', 'femme') === 'Partenaire');
  check('genreForFamilyRole("Partenaire") → null (aucun genre déduit d’un lien neutre)', genreForFamilyRole('Partenaire') === null);
}

console.log('\n[4] Les 3 paires Couple genrées suivent le même mécanisme que FAMILY_ROLE_PAIRS');
{
  check('swapFamilyRoleGender("Fiancé", "femme") → "Fiancée"', swapFamilyRoleGender('Fiancé', 'femme') === 'Fiancée');
  check('swapFamilyRoleGender("Épouse", "homme") → "Mari"', swapFamilyRoleGender('Épouse', 'homme') === 'Mari');
  check('genreForFamilyRole("Petit ami") → "homme"', genreForFamilyRole('Petit ami') === 'homme');
  check('genreForFamilyRole("Petite amie") → "femme"', genreForFamilyRole('Petite amie') === 'femme');
  // Non-régression stricte : les paires Famille existantes ne sont pas affectées par l'ajout des
  // paires Couple dans la même liste combinée.
  check('swapFamilyRoleGender("Frère", "femme") → "Sœur" (famille inchangée)', swapFamilyRoleGender('Frère', 'femme') === 'Sœur');
  check('genreForFamilyRole("Mère") → "femme" (famille inchangée)', genreForFamilyRole('Mère') === 'femme');
}

console.log('\n[5] Changement de catégorie — l’ancien lien précis ne doit jamais survivre (source réelle, pas une supposition)');
{
  const ficheSrc = readSrc('src', 'screens', 'FicheScreen.tsx');
  check(
    'le handler du chip RELATION appelle bien setFamilyRole(null) juste après setRelation(r) (déjà présent AVANT cette passe, vérifié sur la source réelle)',
    /setRelation\(r\);\s*setFamilyRole\(null\);/.test(ficheSrc),
  );
  // Simulation fonctionnelle du scénario exact demandé par la consigne §5 : Famille/Frère → Couple.
  let relation = 'Famille';
  let familyRole: string | null = 'Frère';
  // Reproduit exactement le onPress du chip RELATION (FicheScreen.tsx) : changer `r` réinitialise
  // toujours `familyRole`, quelle que soit la catégorie de départ ou d’arrivée.
  function selectRelation(next: string) {
    relation = next;
    familyRole = null;
  }
  selectRelation('Couple');
  check('Famille/Frère → Couple : relation = "Couple"', relation === 'Couple');
  check('Famille/Frère → Couple : familyRole = null (l’ancien "Frère" NE survit PAS)', familyRole === null);

  // Sens inverse demandé par la consigne §8 : Couple → Ami, ancien rôle Couple supprimé.
  let relation2 = 'Couple';
  let familyRole2: string | null = 'Fiancée';
  function selectRelation2(next: string) {
    relation2 = next;
    familyRole2 = null;
  }
  selectRelation2('Ami');
  check('Couple/Fiancée → Ami : relation = "Ami"', relation2 === 'Ami');
  check('Couple/Fiancée → Ami : familyRole = null (l’ancien "Fiancée" NE survit PAS)', familyRole2 === null);
}

console.log('\n[6] Compatibilité anciennes fiches — normalisation historique strictement inchangée');
{
  check('"Amie" → "Ami" (inchangé)', normalizeRelation('Amie') === 'Ami');
  check('"Collègue" → "Autres" (inchangé)', normalizeRelation('Collègue') === 'Autres');
  check('"Autre" → "Autres" (inchangé)', normalizeRelation('Autre') === 'Autres');
  check('valeur vide/absente → "Famille" (défaut historique inchangé, RELATIONS[0])', normalizeRelation('') === 'Famille' && normalizeRelation(undefined) === 'Famille' && normalizeRelation(null) === 'Famille');
  check('valeur totalement inconnue → "Famille" (défaut historique inchangé)', normalizeRelation('Voisin') === 'Famille');
}

console.log('\n[7] Aucune conversion automatique implicite vers Couple (information non déductible, jamais inventée)');
{
  // normalizeRelation ne doit JAMAIS transformer une ancienne relation Ami/Autres/Famille en Couple
  // — seule une action UTILISATEUR explicite (choix du chip "Couple") peut le faire.
  check('"Ami" reste "Ami" (jamais auto-promu en Couple)', normalizeRelation('Ami') === 'Ami');
  check('"Autres" reste "Autres" (jamais auto-promu en Couple)', normalizeRelation('Autres') === 'Autres');
  check('"Famille" reste "Famille" (jamais auto-promu en Couple)', normalizeRelation('Famille') === 'Famille');
}

console.log('\n[8] Affichage — familyRole ?? relation fonctionne tel quel pour Couple (aucun changement requis)');
{
  const contactsSrc = readSrc('src', 'screens', 'ContactsScreen.tsx');
  const ficheSrc = readSrc('src', 'screens', 'FicheScreen.tsx');
  check('ContactsScreen.tsx affiche bien "familyRole ?? relation" (générique, fonctionne pour Couple sans changement)', /c\.familyRole \?\? c\.relation/.test(contactsSrc));
  check('FicheScreen.tsx (résumé) affiche bien "familyRole ?? relation" (générique, fonctionne pour Couple sans changement)', /\{familyRole \?\? relation\}/.test(ficheSrc));
  // Vérification fonctionnelle directe des libellés attendus par la consigne §6.
  const display = (familyRole: string | null, relation: string) => familyRole ?? relation;
  check('affichage "Fiancée"', display('Fiancée', 'Couple') === 'Fiancée');
  check('affichage "Mari"', display('Mari', 'Couple') === 'Mari');
  check('affichage "Partenaire"', display('Partenaire', 'Couple') === 'Partenaire');
  check('sans lien précis choisi → affichage replié sur "Couple"', display(null, 'Couple') === 'Couple');
}

console.log('\n[9] Capture / matching — aucune régression (Couple ne touche aucun de ces fichiers)');
{
  const captureMatchingSrc = readSrc('src', 'data', 'contactMatching.ts');
  const captureReviewSrc = readSrc('src', 'data', 'captureReview.ts');
  check('contactMatching.ts ne référence toujours aucune notion de relation/familyRole (inchangé)', !/\brelation\b|\bfamilyRole\b/.test(captureMatchingSrc));
  check('captureReview.ts ne référence toujours aucune notion de relation/familyRole (inchangé)', !/\brelation\b|\bfamilyRole\b/.test(captureReviewSrc));
}

console.log('\n[10] Persistance round-trip Supabase/local — relation/familyRole conservés tels quels (pass-through, vérifié par lecture de source)');
{
  const repoSrc = readSrc('src', 'lib', 'supabaseRepo.ts');
  check('rowToContact : relation = row.relation ?? \'\' (pass-through strict, aucune traduction de valeur)', /relation: row\.relation \?\? ''/.test(repoSrc));
  check('rowToContact : familyRole = row.family_role ?? null (pass-through strict)', /familyRole: row\.family_role \?\? null/.test(repoSrc));
  check(
    'écriture (insert/update) : relation/family_role écrits tels quels depuis contact.relation/contact.familyRole (aucune whitelist de valeurs, "Couple" passe sans changement de code)',
    (repoSrc.match(/relation: c(?:ontact)?\.relation,/g) ?? []).length >= 2 && (repoSrc.match(/family_role: c(?:ontact)?\.familyRole,/g) ?? []).length >= 2,
  );
  const schemaSrc = readSrc('supabase', 'schema.sql');
  check('schema.sql : relation TEXT sans contrainte CHECK (aucun enum DB, "Couple" ne nécessite aucune migration)', /relation text/.test(schemaSrc) && !/check.*relation/i.test(schemaSrc));
  check('schema.sql : family_role TEXT sans contrainte CHECK', /family_role text/.test(schemaSrc) && !/check.*family_role/i.test(schemaSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
