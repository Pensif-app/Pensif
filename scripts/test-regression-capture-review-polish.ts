/// <reference types="node" />
// Tests de non-régression — POLISH Capture Review, hiérarchie des actions et zones tactiles
// (2026-09-18). CaptureScreen.tsx importe react-native — vérification par lecture de source (même
// méthode que le reste de ce projet, voir test-regression-capture-processing-ux.ts et suivants).
// Purement structurel : aucun changement de logique métier attendu (needsReview/isCardValid/
// handleDiscard/handleSaveCard/handleSaveAll doivent rester strictement identiques).
//
// Usage : npx tsx scripts/test-regression-capture-review-polish.ts

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

const screenSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');

// Portée JSX du bloc "reminder" d'une carte (du commentaire "Rappel" jusqu'à "cardActions") — évite
// que des vérifications de marge/style ne capturent par erreur du contenu sans rapport ailleurs dans
// ce fichier de ~1700 lignes (ex. la définition StyleSheet.create tout en bas).
const reminderBlockStart = screenSrc.indexOf('{/* Rappel */}');
const reminderBlockEnd = screenSrc.indexOf('cards.length >= 2 ? (');
const reminderBlock = screenSrc.slice(reminderBlockStart, reminderBlockEnd);
check('bloc "Rappel" localisé (bornes de recherche valides pour la suite)', reminderBlockStart !== -1 && reminderBlockEnd !== -1 && reminderBlockEnd > reminderBlockStart);

console.log('\n[§A — source] style recurrenceFieldRow — zone tactile ~44pt');
{
  const styleMatch = screenSrc.match(/recurrenceFieldRow: \{[^}]*\}/);
  check('style trouvé', styleMatch !== null);
  check('minHeight: 44 (recommandation tactile mobile)', !!styleMatch && styleMatch[0].includes('minHeight: 44'));
}

/** Vérifie qu'une ligne (label + valeur) est un SEUL Pressable — jamais un texte à part cliquable
 *  seul. Approche par position (indexOf), robuste aux sauts de ligne/longueur variable des props,
 *  plutôt qu'une fenêtre de caractères fixe. */
function checkSingleTappableRow(labelText: string, valueCallSnippet: string, rowName: string) {
  const labelIdx = reminderBlock.indexOf(`>${labelText}</Text>`);
  check(`${rowName} — libellé trouvé`, labelIdx !== -1);
  if (labelIdx === -1) return;

  const before = reminderBlock.slice(0, labelIdx);
  const pressableStart = before.lastIndexOf('<Pressable');
  const closingPressableBefore = before.lastIndexOf('</Pressable>');
  check(`${rowName} — le libellé est À L'INTÉRIEUR d'un Pressable (toute la ligne, pas juste la valeur)`, pressableStart > closingPressableBefore && pressableStart !== -1);

  const betweenPressableAndLabel = reminderBlock.slice(pressableStart, labelIdx);
  check(`${rowName} — ce Pressable utilise bien recurrenceFieldRow`, betweenPressableAndLabel.includes('recurrenceFieldRow'));

  const afterLabel = reminderBlock.slice(labelIdx);
  const nextClosingPressable = afterLabel.indexOf('</Pressable>');
  const valueIdx = afterLabel.indexOf(valueCallSnippet);
  check(
    `${rowName} — la valeur (${valueCallSnippet}) est dans le MÊME Pressable que le libellé (avant sa fermeture)`,
    valueIdx !== -1 && nextClosingPressable !== -1 && valueIdx < nextClosingPressable,
  );
}

console.log('\n[§B — source] les 4 lignes (Date de début/Heure/Répétition/Fin) sont chacune UN SEUL Pressable — label ET valeur cliquables');
checkSingleTappableRow('DATE DE DÉBUT', 'recurrenceStartDateLabel(card.reminderDate)', 'DATE DE DÉBUT');
checkSingleTappableRow('HEURE', 'recurrenceTimeLabel(card.reminderTime)', 'HEURE');
checkSingleTappableRow('RÉPÉTITION', 'recurrenceFrequencyLabel(card.recurrenceDraft)', 'RÉPÉTITION');
checkSingleTappableRow('FIN', 'recurrenceEndLabel(card.recurrenceDraft)', 'FIN');
check(
  'ancien pattern (ligne = View non cliquable + Pressable limité à la seule valeur) disparu pour ces 4 champs',
  !/<View style=\{styles\.reminderRow\}>\s*<Text[^>]*>DATE DE DÉBUT/.test(reminderBlock),
);

console.log('\n[§C — source] espacement légèrement accru entre les lignes, sans excès');
{
  check('marge entre lignes du bloc récurrent = 10 (était 6)', (reminderBlock.match(/styles\.recurrenceFieldRow, \{ marginTop: 10 \}/g) ?? []).length >= 3);
  check('marge sous le toggle "ME LE RAPPELER" légèrement augmentée (8 → 12)', reminderBlock.includes('<View style={{ marginTop: 12 }}>'));
  check(
    'pas d’augmentation démesurée : aucune marge à 3 chiffres (>=100) introduite dans ce bloc',
    !/marginTop: \d{3,}/.test(reminderBlock),
  );
}

console.log('\n[§D — source] le toggle "ME LE RAPPELER" reste une zone STRICTEMENT indépendante, jamais imbriquée dans une ligne de récurrence');
{
  const switchIdx = reminderBlock.indexOf('<Switch');
  check('Switch du rappel trouvé', switchIdx !== -1);
  const switchBlock = reminderBlock.slice(switchIdx, switchIdx + 300);
  check('câblage inchangé : value={card.reminderEnabled}, onValueChange → toggleReminder', switchBlock.includes('value={card.reminderEnabled}') && switchBlock.includes('toggleReminder(card.cardId, v)'));
  check('le Switch n’est jamais à l’intérieur d’un Pressable recurrenceFieldRow (zone indépendante)', !switchBlock.includes('recurrenceFieldRow') && !reminderBlock.slice(Math.max(0, switchIdx - 300), switchIdx).includes('recurrenceFieldRow'));
}

console.log('\n[§E — source] actions par carte masquées UNIQUEMENT si cards.length === 1, comportement ≥2 cartes inchangé');
{
  const actionsBlockMatch = screenSrc.match(/\{cards\.length >= 2 \? \(\s*<View style=\{\[styles\.cardActions, \{ borderTopColor: theme\.line \}\]\}>[\s\S]*?\n\s*\) : null\}/);
  check('bloc cardActions conditionné à "cards.length >= 2", séparateur (borderTopColor) inclus dans le MÊME conditionnel', actionsBlockMatch !== null);
  const actionsBlock = actionsBlockMatch ? actionsBlockMatch[0] : '';
  check('"Supprimer" toujours câblée à handleDiscard à l’intérieur de ce bloc', actionsBlock.includes('handleDiscard(card.cardId)'));
  check('"Enregistrer" toujours câblée à handleSaveCard à l’intérieur de ce bloc', actionsBlock.includes('handleSaveCard(card.cardId)'));
  check('le contrôle de validité (cardValid) reste utilisé tel quel pour désactiver "Enregistrer"', actionsBlock.includes('!cardValid || card.status === \'saving\''));
}

console.log('\n[§F — source] AUCUNE fonction/handler supprimé — même non rendus pour 1 carte, ils restent définis et inchangés');
{
  check('handleDiscard toujours défini', /function handleDiscard\(cardId: string\)/.test(screenSrc));
  check('handleSaveCard toujours défini', /function handleSaveCard\(cardId: string\)/.test(screenSrc));
  check('handleSaveAll ("Faire confiance à Pensif") toujours défini, logique de garde anti-double-tap non touchée', /function handleSaveAll\(\)/.test(screenSrc) && screenSrc.includes('savingAllRef'));
  check('garde anti-double-tap par carte (savingCardIdsRef) toujours présente', screenSrc.includes('savingCardIdsRef'));
  check('"Faire confiance à Pensif" reste câblée à handleSaveAll, hors du conditionnel cards.length (CTA global inchangé)', /label="Faire confiance à Pensif" onPress=\{handleSaveAll\}/.test(screenSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
