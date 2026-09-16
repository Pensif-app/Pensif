// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE : cohérence texte/contact
// (src/data/captureReview.ts : normalizeHeardContactName, buildCardFromExtracted,
// confirmContactForCard). Couvre exactement les cas demandés : exact, fuzzy confirmé, fuzzy non
// confirmé, unmatched + choix manuel (corrige désormais — confirmation forte, cas réel "Joanne" →
// Yohan), ambiguous + choix manuel (corrige aussi), none + choix manuel (ne corrige jamais, aucun
// mot identifiable), "Aucun" choisi, prénom apparaissant une seule fois, casse différente. Pur,
// sans dépendance réseau/IA/react-native.
//
// Usage : npx tsx scripts/test-regression-capture-contact-normalization.ts

import { CaptureResult, ExtractedPensee } from '../src/data/captureTypes';
import { ContactMatchResult } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';
import { buildInitialCards, confirmContactForCard, finalizeCardTextForSave, normalizeHeardContactName } from '../src/data/captureReview';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function makeExtracted(overrides: Partial<ExtractedPensee>): ExtractedPensee {
  return {
    texte: 'Test',
    heardContactName: null,
    event: { hasDate: false, date: null, heardExpression: null, confidence: 1 },
    reminder: { hasReminder: false, date: null, time: null, heardExpression: null, confidence: 1 },
    confidence: 0.9,
    ...overrides,
  };
}

const yohan: Contact = { id: 'contact-yohan', prenom: 'Yohan' } as Contact;
const micka: Contact = { id: 'contact-micka', prenom: 'Micka' } as Contact;
const sofia: Contact = { id: 'contact-sofia', prenom: 'Sofia' } as Contact;
const contacts = [yohan, micka, sofia];

function resultWith(texte: string, heardContactName: string | null): CaptureResult {
  return { transcript: texte, pensees: [makeExtracted({ texte, heardContactName })], parseError: null };
}

console.log('\n[normalizeHeardContactName — unité] remplace uniquement l’occurrence du nom entendu, jamais un replace global');
{
  check(
    'exemple exact de la consigne',
    normalizeHeardContactName('Envoyer un message à Johan pour demain 6h30', 'Johan', 'Yohan') ===
      'Envoyer un message à Yohan pour demain 6h30',
  );
  check('"Mika aime le café" → "Micka aime le café"', normalizeHeardContactName('Mika aime le café', 'Mika', 'Micka') === 'Micka aime le café');
  check(
    '"Sophia a son entretien vendredi" → "Sofia a son entretien vendredi"',
    normalizeHeardContactName('Sophia a son entretien vendredi', 'Sophia', 'Sofia') === 'Sofia a son entretien vendredi',
  );
  check('heardContactName absent → texte inchangé', normalizeHeardContactName('Micka aime le café', null, 'Micka') === 'Micka aime le café');
  check(
    'heardContactName introuvable dans le texte → texte inchangé',
    normalizeHeardContactName('Micka aime le café', 'Paul', 'Micka') === 'Micka aime le café',
  );
}

console.log('\n[casse différente] "mika" (minuscule) reconnu et remplacé malgré la casse');
{
  check(
    '"mika aime le café" → "Micka aime le café"',
    normalizeHeardContactName('mika aime le café', 'mika', 'Micka') === 'Micka aime le café',
  );
  check(
    'heardContactName en casse différente du texte ("Mika" vs "mika")',
    normalizeHeardContactName('mika aime le café', 'Mika', 'Micka') === 'Micka aime le café',
  );
}

console.log('\n[prénom une seule fois] ne touche jamais une autre occurrence/mot similaire');
{
  // "Mika" apparaît une seule fois ; "Mikael" (un autre mot qui CONTIENT "Mika") ne doit jamais être
  // altéré — la limite de mot (\b) empêche tout replace partiel dans un mot plus long.
  const texte = 'Mika doit appeler Mikael';
  const out = normalizeHeardContactName(texte, 'Mika', 'Micka');
  check('seule la première occurrence exacte "Mika" est remplacée', out === 'Micka doit appeler Mikael');
}

console.log('\n[1] match EXACT → texte corrigé immédiatement, sans action utilisateur');
{
  const exactMatch = (): ContactMatchResult => ({ kind: 'exact', contactId: yohan.id });
  const result = resultWith('Envoyer un message à Johan pour demain 6h30', 'Johan');
  const [card] = buildInitialCards(result, exactMatch, contacts);
  check('texte déjà corrigé au build (Johan → Yohan)', card.texte === 'Envoyer un message à Yohan pour demain 6h30');
  check('contactId résolu', card.contactId === yohan.id);
}

console.log('\n[2] FUZZY_HIGH_CONFIDENCE non confirmé → texte PAS modifié automatiquement');
{
  const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
  const result = resultWith('Envoyer un message à Johan pour demain 6h30', 'Johan');
  const [card] = buildInitialCards(result, fuzzyMatch, contacts);
  check('texte INCHANGÉ tant que non confirmé', card.texte === 'Envoyer un message à Johan pour demain 6h30');
  check('contact tout de même présélectionné (affichage seulement)', card.contactId === yohan.id);
}

console.log('\n[2bis] FUZZY_HIGH_CONFIDENCE puis CONFIRMATION (tap sur le chip) → texte corrigé');
{
  const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
  const result = resultWith('Envoyer un message à Johan pour demain 6h30', 'Johan');
  const [card] = buildInitialCards(result, fuzzyMatch, contacts);
  const confirmed = confirmContactForCard(card, yohan.id, contacts);
  check('texte corrigé après confirmation', confirmed.texte === 'Envoyer un message à Yohan pour demain 6h30');
  check('contactMatch devient exact', confirmed.contactMatch.kind === 'exact');
}

console.log('\n[3] UNMATCHED + choix manuel → DOIT désormais corriger (confirmation forte, cas réel "Joanne" → Yohan)');
{
  const unmatched = (): ContactMatchResult => ({ kind: 'unmatched' });
  const result = resultWith('envoyer un message à Joanne demain à 15h', 'Joanne');
  const [card] = buildInitialCards(result, unmatched, contacts);
  check('texte inchangé au build (pas encore de choix utilisateur)', card.texte === 'envoyer un message à Joanne demain à 15h');
  check('contactId reste null au build (unmatched ne présélectionne jamais)', card.contactId === null);
  const afterManualPick = confirmContactForCard(card, yohan.id, contacts);
  check(
    'texte corrigé après le choix manuel de Yohan (cas réel exact de la consigne)',
    afterManualPick.texte === 'envoyer un message à Yohan demain à 15h',
  );
  check('contactId appliqué', afterManualPick.contactId === yohan.id);
}

console.log('\n[ambiguous] + choix manuel → DOIT désormais corriger (même confirmation forte)');
{
  const ambiguous = (): ContactMatchResult => ({ kind: 'ambiguous', candidateContactIds: [yohan.id, micka.id] });
  const result = resultWith('Envoyer un message à Johann pour demain 6h30', 'Johann');
  const [card] = buildInitialCards(result, ambiguous, contacts);
  const resolved = confirmContactForCard(card, yohan.id, contacts);
  check('"Johann" → "Yohan" après choix manuel sur un cas ambigu', resolved.texte === 'Envoyer un message à Yohan pour demain 6h30');
}

console.log('\n[none] + choix manuel → ne corrige PAS (carte de repli sans extraction, aucun mot à identifier)');
{
  const noneResult: CaptureResult = { transcript: 'audio incompréhensible', pensees: [], parseError: 'invalid JSON from LLM' };
  const [card] = buildInitialCards(noneResult, () => ({ kind: 'none' }), contacts);
  check('originalContactMatchKind = none', card.originalContactMatchKind === 'none');
  const afterManualPick = confirmContactForCard(card, yohan.id, contacts);
  check('texte inchangé (aucun heardContactName connu à remplacer)', afterManualPick.texte === 'audio incompréhensible');
}

console.log('\n[heardContactName absent] choix manuel sur une carte sans heardContactName → ne corrige pas');
{
  const exactMatch = (): ContactMatchResult => ({ kind: 'exact', contactId: yohan.id });
  const result = resultWith('Micka aime le café', null); // heardContactName null malgré un match exact (cas limite)
  const [card] = buildInitialCards(result, exactMatch, contacts);
  const afterManualPick = confirmContactForCard(card, micka.id, contacts);
  check('texte inchangé (rien à identifier sans heardContactName)', afterManualPick.texte === 'Micka aime le café');
}

console.log('\n["Aucun" choisi] jamais de réécriture, quel que soit le match original');
{
  const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
  const result = resultWith('Envoyer un message à Johan pour demain 6h30', 'Johan');
  const [card] = buildInitialCards(result, fuzzyMatch, contacts);
  const cleared = confirmContactForCard(card, null, contacts);
  check('texte inchangé', cleared.texte === 'Envoyer un message à Johan pour demain 6h30');
  check('contactId redevient null', cleared.contactId === null);
}

console.log('\n[CHAÎNE] Joanne → Yohan → Léa → Micka : chaque changement corrige la BONNE occurrence (bug réel corrigé)');
{
  const lea: Contact = { id: 'contact-lea', prenom: 'Léa' } as Contact;
  const allContacts = [...contacts, lea];
  const unmatched = (): ContactMatchResult => ({ kind: 'unmatched' });
  const result = resultWith('envoyer un message à Joanne demain', 'Joanne');
  let card = buildInitialCards(result, unmatched, allContacts)[0];
  check('texte initial inchangé', card.texte === 'envoyer un message à Joanne demain');
  check('currentContactNameInText initialisé à heardContactName', card.currentContactNameInText === 'Joanne');

  card = confirmContactForCard(card, yohan.id, allContacts);
  check('tap Yohan → "Yohan"', card.texte === 'envoyer un message à Yohan demain');
  check('currentContactNameInText avance à "Yohan"', card.currentContactNameInText === 'Yohan');

  card = confirmContactForCard(card, lea.id, allContacts);
  check('tap Léa (après s’être trompé) → "Léa", PAS "Joanne" résiduel', card.texte === 'envoyer un message à Léa demain');
  check('currentContactNameInText avance à "Léa"', card.currentContactNameInText === 'Léa');

  card = confirmContactForCard(card, micka.id, allContacts);
  check('tap Micka → "Micka"', card.texte === 'envoyer un message à Micka demain');
  check('currentContactNameInText avance à "Micka"', card.currentContactNameInText === 'Micka');
}

console.log('\n[exact initial → autre contact] un match exact reste modifiable ensuite (chaîne continue après l’auto-correction)');
{
  const exactMatch = (): ContactMatchResult => ({ kind: 'exact', contactId: yohan.id });
  const result = resultWith('Envoyer un message à Johan pour demain 6h30', 'Johan');
  let card = buildInitialCards(result, exactMatch, contacts)[0];
  check('auto-corrigé au build : "Yohan"', card.texte === 'Envoyer un message à Yohan pour demain 6h30');
  card = confirmContactForCard(card, micka.id, contacts);
  check('puis changé manuellement vers "Micka" (pas bloqué par l’auto-correction initiale)', card.texte === 'Envoyer un message à Micka pour demain 6h30');
}

console.log('\n[fuzzy → contact A → contact B] confirmer une suggestion fuzzy PUIS changer d’avis fonctionne aussi');
{
  const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
  const result = resultWith('Envoyer un message à Johan pour demain 6h30', 'Johan');
  let card = buildInitialCards(result, fuzzyMatch, contacts)[0];
  card = confirmContactForCard(card, yohan.id, contacts); // confirme la suggestion fuzzy (A)
  check('confirmé sur Yohan (A)', card.texte === 'Envoyer un message à Yohan pour demain 6h30');
  card = confirmContactForCard(card, sofia.id, contacts); // change d'avis (B)
  check('puis changé vers Sofia (B)', card.texte === 'Envoyer un message à Sofia pour demain 6h30');
}

console.log('\n["Aucun" APRÈS une sélection] ne modifie pas le texte, et un nouveau choix ensuite corrige toujours');
{
  const unmatched = (): ContactMatchResult => ({ kind: 'unmatched' });
  const result = resultWith('envoyer un message à Joanne demain', 'Joanne');
  let card = buildInitialCards(result, unmatched, contacts)[0];
  card = confirmContactForCard(card, yohan.id, contacts);
  check('après tap Yohan : "Yohan"', card.texte === 'envoyer un message à Yohan demain');
  card = confirmContactForCard(card, null, contacts); // "Aucun"
  check('"Aucun" → texte inchangé (reste "Yohan", pas de réécriture)', card.texte === 'envoyer un message à Yohan demain');
  check('contactId redevient null', card.contactId === null);
  check('currentContactNameInText conservé ("Yohan", pas réinitialisé à "Joanne")', card.currentContactNameInText === 'Yohan');
  card = confirmContactForCard(card, micka.id, contacts);
  check('un nouveau choix après "Aucun" corrige toujours (cible "Yohan", pas "Joanne")', card.texte === 'envoyer un message à Micka demain');
}

console.log('\n[CORRECTIF UX] finalizeCardTextForSave — filet de sécurité appelé juste avant sauvegarde');
{
  console.log('  [1] "Johan" reconnu comme Yohan (fuzzy) + enregistrement DIRECT sans taper "Confirmer" → texte final contient Yohan');
  {
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
    const result = resultWith('Je dois envoyer un message demain à 8h à Johan.', 'Johan');
    const [card] = buildInitialCards(result, fuzzyMatch, contacts);
    check('avant sauvegarde : texte encore "Johan" (non confirmé)', card.texte === 'Je dois envoyer un message demain à 8h à Johan.');
    check('mais contactId déjà pré-rempli sur Yohan (architecture existante, buildCardFromExtracted)', card.contactId === yohan.id);
    const finalized = finalizeCardTextForSave(card, contacts);
    check('APRÈS le filet de sécurité : texte corrigé en "Yohan"', finalized.texte === 'Je dois envoyer un message demain à 8h à Yohan.');
    check('contactId inchangé (toujours Yohan)', finalized.contactId === yohan.id);
  }

  console.log('  [2] contact exact déjà correct ("Yohan" entendu = "Yohan" contact) → reste "Yohan", idempotent');
  {
    const exactMatch = (): ContactMatchResult => ({ kind: 'exact', contactId: yohan.id });
    const result = resultWith('Appeler Yohan ce soir', 'Yohan');
    const [card] = buildInitialCards(result, exactMatch, contacts);
    check('déjà "Yohan" au build (match exact, auto-corrigé)', card.texte === 'Appeler Yohan ce soir');
    const finalized = finalizeCardTextForSave(card, contacts);
    check('filet de sécurité idempotent : toujours "Yohan", inchangé', finalized.texte === 'Appeler Yohan ce soir');
  }

  console.log('  [3] suggestion Yohan puis "Aucun" → "Johan" n’est JAMAIS transformé en Yohan, même au moment de sauvegarder');
  {
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
    const result = resultWith('Écrire à Johan demain', 'Johan');
    let card = buildInitialCards(result, fuzzyMatch, contacts)[0];
    card = confirmContactForCard(card, null, contacts); // "Aucun"
    check('"Aucun" : contactId redevient null, texte inchangé', card.contactId === null && card.texte === 'Écrire à Johan demain');
    const finalized = finalizeCardTextForSave(card, contacts);
    check('filet de sécurité : AUCUNE normalisation (contactId null → return immédiat)', finalized.texte === 'Écrire à Johan demain');
  }

  console.log('  [4] suggestion Yohan puis changement vers Jean-Luc → ne conserve pas artificiellement Yohan');
  {
    const jeanLuc: Contact = { id: 'contact-jean-luc', prenom: 'Jean-Luc' } as Contact;
    const allContacts = [...contacts, jeanLuc];
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
    const result = resultWith('Écrire à Johan demain', 'Johan');
    let card = buildInitialCards(result, fuzzyMatch, allContacts)[0];
    card = confirmContactForCard(card, jeanLuc.id, allContacts); // "Changer" → Jean-Luc
    check('changé vers Jean-Luc : texte déjà corrigé par confirmContactForCard', card.texte === 'Écrire à Jean-Luc demain');
    const finalized = finalizeCardTextForSave(card, allContacts);
    check('filet de sécurité idempotent : reste "Jean-Luc", jamais "Yohan" résiduel', finalized.texte === 'Écrire à Jean-Luc demain');
  }

  console.log('  [5] phrase contenant d’autres mots ressemblants → aucun remplacement parasite');
  {
    // "Johan" doit être remplacé, mais "Johansson" (un autre mot qui CONTIENT "Johan") ne doit
    // jamais être altéré — même garde de limite de mot que replaceContactNameOccurrence.
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
    const result = resultWith('Johan doit rappeler Johansson demain', 'Johan');
    const card = buildInitialCards(result, fuzzyMatch, contacts)[0];
    const finalized = finalizeCardTextForSave(card, contacts);
    check('seul "Johan" (mot entier) remplacé, "Johansson" jamais touché', finalized.texte === 'Yohan doit rappeler Johansson demain');
  }

  console.log('  [6] casse — "johan" (minuscule) reconnu et normalisé au moment de la sauvegarde');
  {
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
    const result = resultWith('rappeler johan ce soir', 'johan');
    const card = buildInitialCards(result, fuzzyMatch, contacts)[0];
    const finalized = finalizeCardTextForSave(card, contacts);
    check('"johan" (minuscule) → "Yohan" (casse canonique du contact)', finalized.texte === 'rappeler Yohan ce soir');
  }

  console.log('  [7] accents/noms composés — fonctionne aussi pour un contact au prénom accentué/composé');
  {
    const jeanBaptiste: Contact = { id: 'contact-jb', prenom: 'Jean-Baptiste' } as Contact;
    const sofiaAccent: Contact = { id: 'contact-sofia-e', prenom: 'Sofía' } as Contact;
    const allContacts = [...contacts, jeanBaptiste, sofiaAccent];
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: jeanBaptiste.id });
    const result = resultWith('Envoyer un message à Jean Baptiste demain', 'Jean Baptiste');
    const card = buildInitialCards(result, fuzzyMatch, allContacts)[0];
    const finalized = finalizeCardTextForSave(card, allContacts);
    check('nom composé du contact appliqué tel quel', finalized.texte === 'Envoyer un message à Jean-Baptiste demain');
  }

  console.log('  [orphelin] contact supprimé entre-temps → filet de sécurité ne crashe jamais, ne modifie rien');
  {
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: 'contact-supprime' });
    const result = resultWith('Écrire à Johan demain', 'Johan');
    const card = buildInitialCards(result, fuzzyMatch, contacts)[0];
    const finalized = finalizeCardTextForSave(card, contacts); // 'contact-supprime' absent de `contacts`
    check('aucun crash, texte inchangé (contact introuvable)', finalized.texte === 'Écrire à Johan demain');
  }

  console.log('  [édition manuelle] l’utilisateur retape la phrase en retirant le nom → filet de sécurité ne réinsère rien');
  {
    const fuzzyMatch = (): ContactMatchResult => ({ kind: 'fuzzy_high_confidence', contactId: yohan.id });
    const result = resultWith('Écrire à Johan demain', 'Johan');
    let card = buildInitialCards(result, fuzzyMatch, contacts)[0];
    // L'utilisateur édite manuellement le TextInput — seul `texte` change, jamais currentContactNameInText
    // (voir CaptureScreen.tsx : patchCard ne touche que `texte`).
    card = { ...card, texte: 'Prendre des nouvelles la semaine prochaine' };
    const finalized = finalizeCardTextForSave(card, contacts);
    check('édition manuelle intégralement préservée, rien réinséré ("Johan" absent → replaced:false)', finalized.texte === 'Prendre des nouvelles la semaine prochaine');
  }
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
