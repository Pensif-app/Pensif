// Tests de non-régression — CHANTIER "Pensif — Capture Review — Mise en évidence des champs
// proposés non confirmés" (2026-09-18). Couvre les fonctions pures nouvelles de captureReview.ts
// (cardHasPendingReminderSeedConfirmation, pendingConfirmationHelpText) et, par lecture de source
// (CaptureScreen.tsx importe react-native, non chargeable sous tsx — même méthode que le reste de ce
// projet), le câblage de l'état UI `saveAttempted`, du contour corail conditionnel et du message
// sous "Faire confiance à Pensif".
//
// Usage : npx tsx scripts/test-regression-capture-pending-confirmation-highlight.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  CaptureCard,
  DEFAULT_RECURRENCE_DRAFT,
  LocalDate,
  RecurrenceDraft,
  cardHasPendingReminderSeedConfirmation,
  isCardValid,
  needsReview,
  pendingConfirmationHelpText,
} from '../src/data/captureReview';

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

function baseCard(overrides: Partial<CaptureCard> = {}): CaptureCard {
  return {
    cardId: 'card-1',
    texte: 'texte',
    contactId: null,
    contactMatch: { kind: 'none' },
    heardContactName: null,
    currentContactNameInText: null,
    originalContactMatchKind: 'none',
    eventHint: null,
    reminderEnabled: true,
    reminderDate: null,
    reminderTime: null,
    recurrenceDraft: DEFAULT_RECURRENCE_DRAFT,
    confidence: 1,
    status: 'pending',
    saveError: null,
    analysisFailed: false,
    ...overrides,
  };
}

function dailyDraft(): RecurrenceDraft {
  return { enabled: true, frequency: 'daily', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null };
}

const NOW = new Date(2026, 8, 18, 8, 0, 0, 0);

// ============================================================================================
console.log('\n[§1 — cardHasPendingReminderSeedConfirmation] rappel ponctuel : date extraite + heure seed (eventTime) → EN ATTENTE');
{
  const card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  check('seed non confirmée → true', cardHasPendingReminderSeedConfirmation(card, NOW) === true);
  check('cette carte bloque bien isCardValid (cohérence)', isCardValid(card, NOW) === false);
}

console.log('\n[§2 — cardHasPendingReminderSeedConfirmation] rappel ponctuel totalement vide (aucune date extraite) → PAS "en attente" (placeholder honnête, pas une seed trompeuse)');
{
  const card = baseCard({ reminderDate: null, reminderTime: null, eventHint: null });
  check('aucune seed affichée → false (hors périmètre de ce correctif)', cardHasPendingReminderSeedConfirmation(card, NOW) === false);
  check('bloque quand même isCardValid (juste pas mis en évidence par CE mécanisme)', isCardValid(card, NOW) === false);
}

console.log('\n[§3 — cardHasPendingReminderSeedConfirmation] rappel ponctuel entièrement CONFIRMÉ → jamais "en attente"');
{
  const card = baseCard({ reminderDate: { year: 2027, month: 2, day: 6 }, reminderTime: { hour: 20, minute: 0 } });
  check('date ET heure confirmées → false', cardHasPendingReminderSeedConfirmation(card, NOW) === false);
  check('carte valide (rappel futur)', isCardValid(card, NOW) === true);
}

console.log('\n[§4 — cardHasPendingReminderSeedConfirmation] récurrence : reminderDate null + seed calculable (daily 21:40) → EN ATTENTE');
{
  const card = baseCard({ reminderTime: { hour: 21, minute: 40 }, recurrenceDraft: dailyDraft() });
  check('seed de récurrence affichée (violet) → true', cardHasPendingReminderSeedConfirmation(card, NOW) === true);
  check('bloque isCardValid (reminderDate encore null)', isCardValid(card, NOW) === false);
}

console.log('\n[§5 — cardHasPendingReminderSeedConfirmation] récurrence NON résolue (weekly sans jour) → PAS "en attente" (déjà honnêtement "À préciser")');
{
  const unresolvedWeekly: RecurrenceDraft = { enabled: true, frequency: 'weekly', daysOfWeek: [], occurrenceCount: null, untilDate: null, heardExpression: null };
  const card = baseCard({ reminderTime: { hour: 21, minute: 40 }, recurrenceDraft: unresolvedWeekly });
  check('aucune seed calculable → false', cardHasPendingReminderSeedConfirmation(card, NOW) === false);
  check('needsReview reste true (signalé autrement, pas par ce mécanisme)', needsReview(card) === true);
}

console.log('\n[§6 — cardHasPendingReminderSeedConfirmation] récurrence : reminderDate déjà connue, reminderTime manquante ("HEURE" = "À définir", honnête) → PAS "en attente"');
{
  const card = baseCard({ reminderDate: { year: 2026, month: 8, day: 20 }, reminderTime: null, recurrenceDraft: dailyDraft() });
  check('HEURE affichée honnêtement ("À définir"), aucune seed trompeuse → false', cardHasPendingReminderSeedConfirmation(card, NOW) === false);
  check('bloque quand même isCardValid', isCardValid(card, NOW) === false);
}

console.log('\n[§7 — cardHasPendingReminderSeedConfirmation] rappel désactivé → jamais "en attente" (rien n’est affiché)');
{
  const card = baseCard({ reminderEnabled: false, reminderDate: null, reminderTime: null, recurrenceDraft: dailyDraft() });
  check('reminderEnabled=false → false', cardHasPendingReminderSeedConfirmation(card, NOW) === false);
}

// ============================================================================================
console.log('\n[§8 — pendingConfirmationHelpText] 0 → null (rien à afficher)');
check('count=0 → null', pendingConfirmationHelpText(0) === null);

console.log('\n[§9 — pendingConfirmationHelpText] 1 → message SINGULIER');
{
  const help = pendingConfirmationHelpText(1);
  check('headline singulier', help?.headline === "1 élément à confirmer avant d'enregistrer.");
  check('hint singulier', help?.hint === 'Appuie sur le champ surligné pour le valider.');
}

console.log('\n[§10 — pendingConfirmationHelpText] 2+ → message PLURIEL');
{
  const help = pendingConfirmationHelpText(2);
  check('headline pluriel avec le compte', help?.headline === "2 éléments à confirmer avant d'enregistrer.");
  check('hint pluriel', help?.hint === 'Appuie sur les champs surlignés pour les valider.');
  const help3 = pendingConfirmationHelpText(3);
  check('headline pluriel, compte exact (3)', help3?.headline === "3 éléments à confirmer avant d'enregistrer.");
}

console.log('\n[§11 — scénario complet] Capture "…rappelle-moi la veille" → avant tentative aucune mise en évidence, après tentative : 1 élément, contour visé, disparaît une fois confirmé');
{
  let card = baseCard({
    reminderDate: { year: 2027, month: 2, day: 6 },
    reminderTime: null,
    eventHint: { date: '2027-03-07', time: '20:00', heardExpression: 'le concert' },
  });
  // Avant toute tentative : le prédicat renvoie true en soi, mais CaptureScreen.tsx ne le CONSULTE
  // que si `saveAttempted` (voir §G — source, plus bas) — c'est la conjonction des deux qui pilote
  // réellement le contour affiché, jamais le prédicat seul.
  check('la carte a bien une seed en attente (le prédicat lui-même est déjà vrai)', cardHasPendingReminderSeedConfirmation(card, NOW) === true);

  const helpBeforeAnyAttempt = pendingConfirmationHelpText(0); // saveAttempted=false → count forcé à 0 côté écran
  check('avant toute tentative, aucun message (count=0 imposé par saveAttempted=false)', helpBeforeAnyAttempt === null);

  const helpAfterFailedAttempt = pendingConfirmationHelpText(1); // saveAttempted=true, 1 carte concernée
  check('après tentative bloquée, message singulier "1 élément..."', helpAfterFailedAttempt?.headline === "1 élément à confirmer avant d'enregistrer.");

  // L'utilisateur ouvre le champ et fait "Terminé" — confirmReminderSeed (CaptureScreen.tsx) écrit
  // exactement reminderPickerSeedParts(card, now), simulé ici.
  card = { ...card, reminderDate: card.reminderDate, reminderTime: { hour: 20, minute: 0 } };
  check('après confirmation, plus de seed en attente', cardHasPendingReminderSeedConfirmation(card, NOW) === false);
  check('carte désormais valide', isCardValid(card, NOW) === true);
  check('message disparaît (count retombe à 0)', pendingConfirmationHelpText(0) === null);
}

// ============================================================================================
const screenSrc = readSrc('src', 'screens', 'CaptureScreen.tsx');

console.log('\n[§G — source] état UI saveAttempted : jamais persisté, réinitialisé à chaque nouvelle capture');
{
  check('state saveAttempted déclaré via useState(false)', /const \[saveAttempted, setSaveAttempted\] = useState\(false\);/.test(screenSrc));
  check('réinitialisé lors du chargement d’un résultat de Capture (nouvelle carte)', /setCards\(buildInitialCards\([\s\S]{0,200}setSaveAttempted\(false\)/.test(screenSrc));
  check('réinitialisé dans resetCaptureState (Nouvelle capture / retour idle)', /function resetCaptureState\(\) \{[\s\S]*?setSaveAttempted\(false\);[\s\S]*?\n  \}/.test(screenSrc));
  check('jamais écrit dans une CaptureCard ni dans buildPenseeFromCard (aucune référence hors CaptureScreen.tsx)', !readSrc('src', 'data', 'captureReview.ts').includes('saveAttempted'));
}

console.log('\n[§H — source] handleSaveAll : le bouton reste TOUJOURS tappable, un tap bloqué révèle l’aide SANS jamais contourner canSaveAll/isCardValid');
{
  const fnMatch = screenSrc.match(/function handleSaveAll\(\) \{[\s\S]*?\n  \}/);
  const fnBody = fnMatch ? fnMatch[0] : '';
  check('handleSaveAll trouvée', fnBody.length > 0);
  check('garde anti-double-tap (savingAllRef) toujours la première vérification', /if \(savingAllRef\.current\) return;/.test(fnBody));
  check(
    'si !canSaveAll(cards) : setSaveAttempted(true) PUIS return — ne sauvegarde jamais, ne positionne jamais savingAllRef',
    /if \(!canSaveAll\(cards\)\) \{\s*setSaveAttempted\(true\);\s*return;\s*\}/.test(fnBody),
  );
  check('savingAllRef.current = true reste APRÈS ce garde-fou (jamais avant, jamais contourné)', fnBody.indexOf('savingAllRef.current = true;') > fnBody.indexOf('setSaveAttempted(true);'));
  check(
    'PrimaryButton "Faire confiance à Pensif" n’a AUCUNE prop disabled (reçoit toujours le tap)',
    /<PrimaryButton label="Faire confiance à Pensif" onPress=\{handleSaveAll\} \/>/.test(screenSrc),
  );
}

console.log('\n[§I — source] contour corail : dérivé de saveAttempted + cardHasPendingReminderSeedConfirmation, jamais un contour permanent/toute la carte');
{
  check(
    'pendingReminderSeedCardIds vide tant que saveAttempted est faux (ternaire explicite)',
    /const pendingReminderSeedCardIds = saveAttempted\s*\?\s*new Set\(cards\.filter\(\(c\) => cardHasPendingReminderSeedConfirmation\(c, new Date\(\)\)\)\.map\(\(c\) => c\.cardId\)\)\s*:\s*new Set<string>\(\);/.test(
      screenSrc,
    ),
  );
  check('pendingHelp dérivé de pendingReminderSeedCardIds.size via pendingConfirmationHelpText', /const pendingHelp = pendingConfirmationHelpText\(pendingReminderSeedCardIds\.size\);/.test(screenSrc));
  check('cardPendingHighlight calculé PAR CARTE (jamais un contour global sur toute la carte)', /const cardPendingHighlight = pendingReminderSeedCardIds\.has\(card\.cardId\);/.test(screenSrc));
  check('chip ponctuel iOS : borderColor conditionnel (theme.plum si en attente, theme.line sinon — jamais de fond rouge, aucune autre prop touchée)', /borderColor: cardPendingHighlight \? theme\.plum : theme\.line/.test(screenSrc));
  check(
    'ligne "DATE DE DÉBUT" récurrente : contour ajouté UNIQUEMENT si cardPendingHighlight (pas de style permanent modifié)',
    /cardPendingHighlight \? \{ borderWidth: 1, borderColor: theme\.plum, borderRadius: 8, paddingHorizontal: 8 \} : null/.test(screenSrc),
  );
}

console.log('\n[§J — source] message d’aide sous le bouton : pas d’Alert native, texte court, coexiste avec le message générique existant');
{
  check('aucun nouvel Alert.alert introduit pour ce message (recherche du texte exact hors Alert)', !new RegExp(`Alert\\.alert\\([^)]*${"1 élément à confirmer"}`).test(screenSrc));
  check('headline rendu via <Text>, jamais Alert', /\{pendingHelp\.headline\}/.test(screenSrc));
  check('hint rendu via <Text> séparé, plus discret (inkSoft)', /\{pendingHelp\.hint\}/.test(screenSrc));
  check('message générique existant ("Complète ou supprime...") toujours présent, non supprimé', screenSrc.includes('Complète ou supprime les cartes signalées pour continuer.'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
