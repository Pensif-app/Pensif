/// <reference types="node" />
// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES : brouillons persistants par
// contact/occasion/ton (2026-09-16). MessageScreen.tsx/store.tsx importent react-native — pas
// chargeables sous tsx, vérification par lecture de source (même méthode que tout le projet).
// messageDraftKey.ts (pur) est testé RÉELLEMENT dans test-regression-message-draft-key.ts.
//
// Usage : npx tsx scripts/test-regression-message-draft-persistence.ts

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

const screenSrc = readSrc('src', 'screens', 'MessageScreen.tsx');
const storeSrc = readSrc('src', 'data', 'store.tsx');
const storageSrc = readSrc('src', 'data', 'messageDraftStorage.ts');

console.log('\n[§A] Séparation par ton — aucun état global text/hasCustomizedText qui contaminerait les tons');
check('drafts est un state unique, indexé par ton (MessageDrafts)', screenSrc.includes('const [drafts, setDrafts] = useState<MessageDrafts>({});'));
check('plus aucun state global `text`/`hasCustomizedText` (remplacés par drafts + currentText dérivé)', !screenSrc.includes('const [text, setText]') && !screenSrc.includes('const [hasCustomizedText'));
check('currentText dérivé du brouillon du ton ACTIF uniquement (drafts[tone])', screenSrc.includes('const currentEntry = drafts[tone];'));
check('changement de ton ne touche jamais `drafts` (juste setTone)', /function handleToneChange\(nextTone: Tone\) \{\s*setTone\(nextTone\);\s*\}/.test(screenSrc));

console.log('\n[§B] Édition manuelle / génération IA — ciblent UNIQUEMENT le ton actif, jamais les 2 autres');
check('handleTextChange met à jour drafts[tone] par spread, préserve les autres tons', /setDrafts\(\(prev\) => \(\{ \.\.\.prev, \[tone\]: \{ text: nextText, aiGenerated: prev\[tone\]\?\.aiGenerated \?\? false \} \}\)\);/.test(screenSrc));
check('édition d’un résultat IA conserve aiGenerated existant (prev[tone]?.aiGenerated), jamais réinitialisé à false', screenSrc.includes('prev[tone]?.aiGenerated ?? false'));
check('génération réussie fige le ton AU MOMENT DE L’APPEL (toneAtRequestTime), pas le ton au moment de la réponse', screenSrc.includes('const toneAtRequestTime = tone;') && screenSrc.includes('requestMessageSuggestion(contextResult.context, toneAtRequestTime)'));
check('génération réussie remplace drafts[toneAtRequestTime] par spread (les autres tons intacts), aiGenerated:true', /setDrafts\(\(prev\) => \(\{ \.\.\.prev, \[toneAtRequestTime\]: \{ text: generated, aiGenerated: true \} \}\)\);/.test(screenSrc));
check('échec de génération ne touche JAMAIS `drafts` (aucun setDrafts dans le catch)', !/catch \(e\) \{[\s\S]*?setDrafts[\s\S]*?\}\s*finally/.test(screenSrc));

console.log('\n[§C] Aucun template par défaut jamais persisté');
check('currentText retombe sur messageTemplates[tone](contact) SEULEMENT si drafts[tone] est absent', screenSrc.includes("currentEntry?.text ?? (occasion === 'birthday' ? messageTemplates[tone](contact) : '');"));
check('la sauvegarde ne s’exécute que si drafts a au moins une clé (Object.keys(drafts).length === 0 → return)', /if \(Object\.keys\(drafts\)\.length === 0\) return;/.test(screenSrc));

console.log('\n[§D] Hydratation — garde explicite, aucune écriture avant la fin de lecture, aucune contamination inter-identité');
check('état draftsHydrated déclaré', screenSrc.includes('const [draftsHydrated, setDraftsHydrated] = useState(false);'));
check('hydrationKeyRef (ref, pas un state) pour comparer l’identité au moment où la promesse se résout', screenSrc.includes('const hydrationKeyRef = useRef<string | null>(null);'));
check('à chaque changement d’identité : draftsHydrated repasse à false ET drafts est vidé AVANT la lecture (pas de flash de l’ancien contact)', /hydrationKeyRef\.current = key;\s*setDraftsHydrated\(false\);\s*setDrafts\(\{\}\);/.test(screenSrc));
check('la lecture vérifie hydrationKeyRef.current !== key avant d’appliquer le résultat (rejette une lecture devenue obsolète)', screenSrc.includes('if (hydrationKeyRef.current !== key) return;'));
check('l’effet de sauvegarde exige draftsHydrated avant tout AsyncStorage.setItem', /if \(!contact \|\| !draftsHydrated\) return;/.test(screenSrc));
check('le composer (TextInput) est non-éditable tant que draftsHydrated est faux (ferme la fenêtre où une saisie pourrait être écrasée par l’hydratation)', screenSrc.includes('editable={draftsHydrated}'));
check('le bouton IA est désactivé tant que draftsHydrated est faux, même raison', screenSrc.includes('disabled={loading || !draftsHydrated}'));

console.log('\n[§E] Identité exacte — contact + occasion (+ pensée pour event), résolue depuis le store');
check('clé construite via messageDraftStorageKey(contact.id, occasion, eventPensee?.id)', screenSrc.includes('messageDraftStorageKey(contact.id, occasion, eventPensee?.id)'));
check('chargement via loadMessageDrafts(contact.id, occasion, eventPensee?.id)', screenSrc.includes('loadMessageDrafts(contact.id, occasion, eventPensee?.id)'));
check('sauvegarde via saveMessageDrafts(contact.id, occasion, drafts, eventPensee?.id)', screenSrc.includes('saveMessageDrafts(contact.id, occasion, drafts, eventPensee?.id)'));
check('eventPensee toujours résolu depuis pensees (store), jamais depuis un objet Pensee des params de navigation', screenSrc.includes('pensees.find((p) => p.id === route.params.penseeId)'));

console.log('\n[§F] messageDraftStorage.ts — lecture/écriture/nettoyage, best-effort comme le reste de la persistance locale');
check('loadMessageDrafts retombe sur {} en cas d’échec (jamais une exception qui casserait l’écran)', /export async function loadMessageDrafts[\s\S]*?catch \{\s*return \{\};\s*\}/.test(storageSrc));
check('saveMessageDrafts avale les erreurs (best-effort, comme AsyncStorage.setItem dans store.tsx)', /export async function saveMessageDrafts[\s\S]*?catch \{/.test(storageSrc));
check('clearMessageDraftsForContact fait un scan par préfixe + multiRemove', storageSrc.includes('getAllKeys()') && storageSrc.includes('k.startsWith(prefix)') && storageSrc.includes('multiRemove(toRemove)'));
check('clearMessageDraftForEvent supprime la clé exacte (pas de scan)', storageSrc.includes("messageDraftStorageKey(contactId, 'event', penseeId)") && storageSrc.includes('removeItem'));

console.log('\n[§G] store.tsx — nettoyage câblé dans deleteContact/deletePensee, sans toucher à l’outbox/sémantique existante');
const deleteContactMatch = storeSrc.match(/deleteContact: \(contactId: string\) => \{[\s\S]*?\n {6}\},/);
const deleteContactBody = deleteContactMatch ? deleteContactMatch[0] : '';
check('deleteContact appelle clearMessageDraftsForContact(contactId)', deleteContactBody.includes('void clearMessageDraftsForContact(contactId);'));
check('deleteContact garde son comportement existant intact (détachement pensées + enqueueDeleteContact toujours présents)', deleteContactBody.includes('contactId: null') && deleteContactBody.includes('enqueueDeleteContact('));

const deletePenseeMatch = storeSrc.match(/deletePensee: \(penseeId: string\) => \{[\s\S]*?\n {6}\},/);
const deletePenseeBody = deletePenseeMatch ? deletePenseeMatch[0] : '';
check('deletePensee capture la pensée AVANT le filtrage (pour retrouver son contactId)', deletePenseeBody.includes('const deletedPensee = pensees.find((p) => p.id === penseeId);'));
check('deletePensee appelle clearMessageDraftForEvent SEULEMENT si la pensée avait un contact (jamais pour une pensée déjà sans contact)', deletePenseeBody.includes('if (deletedPensee?.contactId) void clearMessageDraftForEvent(deletedPensee.contactId, penseeId);'));
check('deletePensee garde son comportement existant intact (enqueueDeletePensee toujours présent)', deletePenseeBody.includes('enqueueDeletePensee('));

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
