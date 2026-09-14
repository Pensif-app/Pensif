/// <reference types="node" />
// Tests de non-régression — CHANTIER AUDIT PRÉ-BÊTA UX/ROBUSTESSE (2026-09-15), corrections #1/#2/#3
// (anti-double-tap sur les sauvegardes, Fiche ouverte sur un contact supprimé, période Calendrier
// invalide).
//
// IMPORTANT — portée réelle de ce fichier : comme pour test-regression-capture-processing-ux.ts et
// test-regression-header-mic-icon.ts, ce projet n'a pas de harnais de composant React Native — on ne
// peut donc pas monter un écran et simuler littéralement deux taps rapides pour observer le nombre
// réel d'entités créées. Ces tests vérifient à la place, par lecture directe du code source, que le
// MÉCANISME exact demandé est en place : la garde est vérifiée EN PREMIER (un second appel est un
// no-op immédiat), verrouillée AVANT toute mutation, jamais déverrouillée sur le chemin de succès
// pour un écran qui NAVIGUE (Fiche/PenseeDetail — puisque le composant se démonte, un second tap
// pendant la transition de sortie retombe toujours sur la garde déjà posée), et déverrouillée
// exactement au point de réouverture (Calendar, qui reste monté) — jamais via un `setTimeout`
// arbitraire de "déblocage".
//
// Usage : npx tsx scripts/test-regression-pre-beta-audit-fixes.ts

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

function readScreen(name: string): string {
  // Normalise CRLF→LF (fichiers du repo en fin de ligne Windows) — sans ça, une comparaison littérale
  // contenant "\n" ne matche jamais, alors qu'un `\s*` dans une regex l'absorbe silencieusement.
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', `${name}.tsx`), 'utf8').replace(/\r\n/g, '\n');
}

const ficheSrc = readScreen('FicheScreen');
const penseeDetailSrc = readScreen('PenseeDetailScreen');
const calendarSrc = readScreen('CalendarScreen');

console.log('\n[§1 anti-double-tap] FicheScreen.save() — Fiche → ne crée qu’un contact');
{
  check('garde vérifiée EN PREMIER dans save()', /function save\(\) \{\s*if \(savingRef\.current\) return;/.test(ficheSrc));
  check(
    'verrou posé APRÈS toute validation, AVANT la mutation (upsertContact)',
    /savingRef\.current = true;\s*try \{\s*const contact: Contact = \{/.test(ficheSrc),
  );
  check('upsertContact() appelé une seule fois dans save()', (ficheSrc.match(/upsertContact\(contact\)/g) ?? []).length === 1);
  check(
    'JAMAIS de réinitialisation de savingRef sur le chemin de succès (navigation.goBack() démonte l’écran)',
    !/upsertContact\(contact\);\s*navigation\.goBack\(\);\s*savingRef\.current = false/.test(ficheSrc),
  );
  check('réinitialisée UNIQUEMENT si une exception empêche la navigation', /catch \(e\) \{\s*\/\/[^\n]*\s*savingRef\.current = false;\s*throw e;/.test(ficheSrc));
  check('aucun setTimeout introduit pour gérer cette garde (pas de debounce arbitraire)', !/setTimeout[\s\S]{0,80}savingRef/.test(ficheSrc));
}

console.log('\n[§1 anti-double-tap] PenseeDetailScreen.save() — PenseeDetail → ne crée qu’une pensée');
{
  check('garde vérifiée EN PREMIER dans save()', /function save\(\) \{\s*if \(savingRef\.current\) return;/.test(penseeDetailSrc));
  check(
    'verrou posé APRÈS toute validation (texte, rappel dans le passé), AVANT la mutation',
    /savingRef\.current = true;\s*try \{\s*if \(existing\) \{/.test(penseeDetailSrc),
  );
  check('addPensee() appelé une seule fois dans le fichier (branche création)', (penseeDetailSrc.match(/addPensee\(\{/g) ?? []).length === 1);
  check(
    'JAMAIS de réinitialisation de savingRef sur le chemin de succès',
    !/navigation\.goBack\(\);\s*\}\s*catch \(e\) \{\s*savingRef\.current = false;\s*throw e;\s*\}\s*savingRef\.current = false/.test(penseeDetailSrc),
  );
  check('réinitialisée UNIQUEMENT si une exception empêche la navigation', /catch \(e\) \{\s*savingRef\.current = false;\s*throw e;/.test(penseeDetailSrc));
}

console.log('\n[§1 anti-double-tap] CalendarScreen.saveThought() — Calendar saveThought → ne crée qu’une pensée');
{
  check('garde vérifiée EN PREMIER dans saveThought()', /function saveThought\(\) \{\s*if \(savingThoughtRef\.current\) return;/.test(calendarSrc));
  check(
    'verrou posé APRÈS toute validation (texte, rappel dans le passé), AVANT addPensee',
    /savingThoughtRef\.current = true;\s*try \{\s*addPensee\(\{/.test(calendarSrc),
  );
  check(
    'réinitialisée au point de RÉOUVERTURE du formulaire ("+ Ajouter une pensée"), pas via un timer',
    /savingThoughtRef\.current = false; \/\/ nouvelle session de saisie[\s\S]{0,80}setFormOpen\(true\);/.test(calendarSrc),
  );
  check('réinitialisée aussi si une exception laisse le formulaire ouvert', /catch \(e\) \{[\s\S]{0,200}savingThoughtRef\.current = false;\s*throw e;/.test(calendarSrc));
}

console.log('\n[§1 anti-double-tap] CalendarScreen.savePeriod() — Calendar savePeriod → ne crée qu’une période');
{
  check('garde vérifiée EN PREMIER dans savePeriod()', /function savePeriod\(\) \{\s*if \(savingPeriodRef\.current\) return;/.test(calendarSrc));
  check('verrou posé APRÈS la validation de période (voir §3), AVANT addPensee', /savingPeriodRef\.current = true;\s*try \{\s*addPensee\(\{/.test(calendarSrc));
  check(
    'réinitialisée au point de RÉOUVERTURE de la modale (fin du geste de sélection), pas via un timer arbitraire de déblocage',
    /savingPeriodRef\.current = false; \/\/ nouvelle session de saisie[\s\S]{0,80}setPeriodModal\(\{ start, end \}\);/.test(calendarSrc),
  );
  check('réinitialisée aussi si une exception laisse la modale ouverte', /catch \(e\) \{[\s\S]{0,150}savingPeriodRef\.current = false;\s*throw e;/.test(calendarSrc));
}

console.log('\n[§2] FicheScreen — contact supprimé pendant que l’écran est ouvert');
{
  check(
    'garde ajoutée : contactId présent mais entité absente → jamais de bascule silencieuse en création',
    /if \(contactId && !existing\) \{/.test(ficheSrc),
  );
  check('texte exact "Ce proche n’est plus disponible"', ficheSrc.includes('Ce proche n’est plus disponible'));
  check('action de retour proposée (navigation.goBack())', /Ce proche n’est plus disponible[\s\S]{0,300}navigation\.goBack\(\)/.test(ficheSrc));
  check(
    'la garde est placée APRÈS tous les hooks (règle des Hooks React) mais AVANT save()/remove()',
    ficheSrc.indexOf('if (contactId && !existing) {') > ficheSrc.indexOf('useEffect(() => {') &&
      ficheSrc.indexOf('if (contactId && !existing) {') < ficheSrc.indexOf('function save()'),
  );
  check(
    'save() ne peut donc JAMAIS s’exécuter avec contactId défini mais existing indéfini (id: existing?.id ?? generateId() n’est plus atteignable dans ce cas)',
    ficheSrc.indexOf('if (contactId && !existing) {') < ficheSrc.indexOf('id: existing?.id ?? generateId()'),
  );
}

console.log('\n[§3] CalendarScreen.savePeriod() — période invalide (endDate < date)');
{
  check(
    'refuse explicitement endDate < date, sans rien écrire dans le store (return avant addPensee)',
    /if \(endIso !== null && endIso < startIso\) \{\s*Alert\.alert\('Période invalide'/.test(calendarSrc),
  );
  check(
    'le refus intervient AVANT tout appel à addPensee (aucune écriture store pour ce cas)',
    /if \(endIso !== null && endIso < startIso\) \{[\s\S]*?return;\s*\}\s*savingPeriodRef\.current = true;\s*try \{\s*addPensee\(\{/.test(calendarSrc),
  );
  check('endDate === date (sélection d’un seul jour) accepté : encodé comme endDate: null, pas une égalité de chaînes', calendarSrc.includes('const endIso = periodModal.start === periodModal.end ? null : isoOf(view.year, view.month, periodModal.end);'));
  check('endDate > date (vraie période) accepté : passe la validation et atteint addPensee', /endIso !== null && endIso < startIso[\s\S]{0,400}addPensee\(\{/.test(calendarSrc));
  check('le modèle de données n’a pas changé (toujours date/endDate/texte/reminderAt/contactId/createdAt)', /date: startIso,\s*endDate: endIso,\s*texte: periodText\.trim\(\),/.test(calendarSrc));
}

console.log('\n[§4] Nettoyage isolé — console.log diagnostic retiré de supabase.ts');
{
  const supabaseSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'supabase.ts'), 'utf8');
  check('le console.log "[Supabase env]" a bien été retiré', !supabaseSrc.includes('[Supabase env]'));
  check('rawUrl/rawAnonKey restent utilisés ailleurs (retrait bien isolé, pas de code mort laissé)', supabaseSrc.includes('cleanEnvValue(rawUrl)') && supabaseSrc.includes('cleanEnvValue(rawAnonKey)'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
