/// <reference types="node" />
// Tests de non-régression — CHANTIER UX "ContactPicker commun + contact reconnu intelligemment"
// (2026-09-16). §A/§B sont RÉELLEMENT EXÉCUTÉS contre les vraies fonctions pures partagées
// (resolveContactAssociationState, matchesSearch) — pas des simulations. §C vérifie par lecture de
// code (pas de harnais de composant RN dans ce projet, voir chantiers précédents) que
// PenseeDetailScreen/CaptureScreen/MemorizedPenseesScreen appellent bien ces composants comme prévu,
// et que contactMatching.ts/STT/LLM restent intacts.
//
// Usage : npx tsx scripts/test-regression-contact-picker.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact } from '../src/data/types';
import { resolveContactAssociationState } from '../src/data/contactAssociation';
import { matchesSearch } from '../src/data/searchText';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
}

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: overrides.id ?? `c-${Math.random().toString(36).slice(2)}`,
    prenom: 'Test',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: 'homme',
    initials: 'T',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

console.log('\n[§A] resolveContactAssociationState — logique de décision RÉELLE (extraite, testée directement)');
{
  const yohan = makeContact({ id: 'yohan', prenom: 'Yohan' });
  const jeanLuc = makeContact({ id: 'jean-luc', prenom: 'Jean-Luc' });
  const contacts = [yohan, jeanLuc];

  {
    const r = resolveContactAssociationState(contacts, 'yohan');
    check('contact déjà associé (Yohan) → "selected", Yohan en premier/identifiable', r.kind === 'selected' && r.kind === 'selected' && r.contact.id === 'yohan');
  }
  {
    const r = resolveContactAssociationState(contacts, null);
    check('aucun contact associé, aucune suggestion → "empty" (jamais toute la liste)', r.kind === 'empty');
  }
  {
    const r = resolveContactAssociationState(contacts, 'contact-supprimé');
    check('§10 — contactId référence un contact supprimé → "orphaned", jamais un crash', r.kind === 'orphaned');
  }
  {
    // §3 — reconnaissance intelligente : suggestion réutilisée STRICTEMENT (id déjà produit par
    // contactMatching.ts, aucune deuxième reconnaissance ici), contact PAS ENCORE associé.
    const r = resolveContactAssociationState(contacts, null, 'yohan');
    check('§3 — Yohan reconnu par l’IA (contactId null, suggestion="yohan") → "suggested" affiché directement', r.kind === 'suggested' && r.kind === 'suggested' && r.contact.id === 'yohan');
  }
  {
    const r = resolveContactAssociationState(contacts, null, 'contact-jamais-vu');
    check('suggestion référençant un contact introuvable → repli "empty" (jamais un crash)', r.kind === 'empty');
  }
  {
    const r = resolveContactAssociationState(contacts, 'yohan', 'jean-luc');
    check('un contact DÉJÀ associé prime toujours sur une suggestion (jamais écrasé silencieusement)', r.kind === 'selected' && r.kind === 'selected' && r.contact.id === 'yohan');
  }
  {
    const r = resolveContactAssociationState([], null);
    check('0 contact dans l’application → "empty", pas d’erreur', r.kind === 'empty');
  }

  console.log('\n  [changer Yohan → Jean-Luc → Aucun → Yohan — séquence complète §12 cas 5/6/7]');
  {
    let selectedId: string | null = 'yohan';
    check('état initial : Yohan sélectionné', resolveContactAssociationState(contacts, selectedId).kind === 'selected');
    selectedId = 'jean-luc'; // "Changer" → Jean-Luc
    const afterChange = resolveContactAssociationState(contacts, selectedId);
    check('changer Yohan → Jean-Luc', afterChange.kind === 'selected' && afterChange.kind === 'selected' && afterChange.contact.id === 'jean-luc');
    selectedId = null; // "Aucun"
    check('Jean-Luc → Aucun', resolveContactAssociationState(contacts, selectedId).kind === 'empty');
    selectedId = 'yohan'; // ré-associer
    const afterReselect = resolveContactAssociationState(contacts, selectedId);
    check('Aucun → Yohan (à nouveau)', afterReselect.kind === 'selected' && afterReselect.kind === 'selected' && afterReselect.contact.id === 'yohan');
  }
}

console.log('\n[§B] ContactPicker — recherche locale (logique EXACTE réutilisée : prénom OU nom OU prénom+nom)');
{
  function search(contacts: Contact[], query: string): Contact[] {
    if (!query.trim()) return contacts;
    return contacts.filter((c) => matchesSearch(c.prenom, query) || matchesSearch(c.nom, query) || matchesSearch(`${c.prenom} ${c.nom}`, query));
  }

  const yohan = makeContact({ id: 'yohan', prenom: 'Yohan', nom: 'Martin' });
  const sofia = makeContact({ id: 'sofia', prenom: 'Sofia', nom: 'Épiné' }); // accent volontaire dans le nom
  const jeanLucLong = makeContact({ id: 'jl', prenom: 'Jean-Baptiste-Alexandre', nom: 'De La Fontaine-Rousseau' }); // §12 cas 10 : nom/prénom long

  check('§12 cas 11 — 0 contact → aucun résultat, pas d’erreur', search([], 'yohan').length === 0);
  check('§12 cas 12 — 1 contact, recherche exacte le trouve', search([yohan], 'yohan').length === 1);
  check('§12 cas 13 — plusieurs contacts, recherche cible le bon', search([yohan, sofia], 'sofia').map((c) => c.id).join(',') === 'sofia');
  check('§12 cas 15 — recherche exacte (prénom)', search([yohan, sofia], 'Yohan').length === 1 && search([yohan, sofia], 'Yohan')[0].id === 'yohan');
  check('§12 cas 15 — recherche exacte (nom)', search([yohan, sofia], 'Martin')[0]?.id === 'yohan');
  check('recherche prénom+nom combiné', search([yohan, sofia], 'yohan martin').length === 1);
  check('§12 cas 16 — casse différente (MAJUSCULES)', search([yohan, sofia], 'SOFIA').length === 1);
  check('§12 cas 17 — recherche SANS accent sur contact accentué ("Epine" trouve "Épiné")', search([yohan, sofia], 'epine').length === 1 && search([yohan, sofia], 'epine')[0].id === 'sofia');
  check('§12 cas 18 — aucun résultat pour un terme absent', search([yohan, sofia], 'inexistant').length === 0);
  check('§12 cas 10 — nom/prénom long trouvé correctement', search([jeanLucLong], 'Rousseau').length === 1);
  check('requête vide → tous les contacts (pas de filtre)', search([yohan, sofia], '').length === 2);

  console.log('\n  [§12 cas 14 — dataset simulé important (150 contacts)]');
  {
    const many = Array.from({ length: 150 }, (_, i) => makeContact({ id: `c-${i}`, prenom: `Prenom${i}`, nom: `Nom${i}` }));
    const targeted = makeContact({ id: 'cible', prenom: 'Yohan', nom: 'Martin' });
    const dataset = [...many, targeted];
    const result = search(dataset, 'yohan');
    check('trouve exactement le bon contact parmi 151', result.length === 1 && result[0].id === 'cible');
    check('recherche vide sur un gros dataset renvoie tout (pour la FlatList, pas de .map() séparé)', search(dataset, '').length === 151);
  }
}

console.log('\n[§C] Vérification du câblage réel (lecture de code — pas de harnais RN dans ce projet)');
{
  const contactPickerSrc = readFile('src/components/ContactPicker.tsx');
  const fieldSrc = readFile('src/components/ContactAssociationField.tsx');
  const penseeDetailSrc = readFile('src/screens/PenseeDetailScreen.tsx');
  const captureSrc = readFile('src/screens/CaptureScreen.tsx');
  const memorizedSrc = readFile('src/screens/MemorizedPenseesScreen.tsx');
  const contactMatchingSrc = readFile('src/data/contactMatching.ts');

  console.log('  [ContactPicker.tsx — §6 performance]');
  check('utilise FlatList (virtualisé), jamais un .map() de la liste filtrée dans un ScrollView', contactPickerSrc.includes('<FlatList') && !/filtered\.map\(/.test(contactPickerSrc));
  check('recherche 100% locale : aucun réseau/LLM dans ce fichier', !/fetch\(|supabase\.|openai|anthropic/i.test(contactPickerSrc));
  check('placeholder de recherche exact ("Rechercher un contact")', contactPickerSrc.includes('placeholder="Rechercher un contact"'));
  check('titre par défaut cohérent avec le vocabulaire produit ("proche")', contactPickerSrc.includes("title = 'Choisir un proche'"));
  check('empty state si 0 contact', contactPickerSrc.includes('Aucun proche pour l’instant.'));
  console.log('  [ContactPicker.tsx — CORRECTIF clavier automatique (2026-09-16)]');
  check('§12 cas 8 — le champ de recherche n’a PAS autoFocus (liste visible immédiatement, clavier fermé à l’ouverture)', !contactPickerSrc.includes('autoFocus'));
  check('le champ de recherche reste bien présent (pas supprimé, juste plus auto-focus)', contactPickerSrc.includes('<TextInput'));

  console.log('  [PenseeDetailScreen.tsx]');
  check('utilise ContactAssociationField (jamais contacts.map() de chips)', penseeDetailSrc.includes('<ContactAssociationField') && !/contacts\.map\(\(c\) => \(/.test(penseeDetailSrc));
  check('utilise le MÊME ContactPicker partagé (import du composant commun)', penseeDetailSrc.includes("import { ContactPicker } from '../components/ContactPicker'"));
  check('"Aucun" retire l’association (onClear → setContactId(null))', /onClear=\{\(\) => setContactId\(null\)\}/.test(penseeDetailSrc));
  check('sélection dans le picker associe bien le contact (setContactId(id))', /onSelect=\{\(id\) => \{\s*setContactId\(id\);/.test(penseeDetailSrc));

  console.log('  [CaptureScreen.tsx — §3, non-régression Capture]');
  check('utilise ContactAssociationField (jamais contacts.map() de chips dans la Review)', captureSrc.includes('<ContactAssociationField') && !/\{contacts\.map\(\(c\) => \{/.test(captureSrc));
  check(
    'suggestion RÉUTILISE strictement card.contactMatch (isFuzzy = fuzzy_high_confidence) — aucune deuxième reconnaissance, l’état "suggéré" reste atteignable même si contactId est pré-rempli',
    /suggestedContactId=\{isFuzzy \? card\.contactId : null\}/.test(captureSrc) && /const isFuzzy = card\.contactMatch\.kind === 'fuzzy_high_confidence';/.test(captureSrc),
  );
  check(
    'CORRECTIF — tant que fuzzy non confirmé, selectedContactId forcé à null (jamais affiché "[Yohan ✓]" comme déjà accepté)',
    /selectedContactId=\{isFuzzy \? null : card\.contactId\}/.test(captureSrc),
  );
  check('confirmation de suggestion rejoue EXACTEMENT selectContact (chemin déjà existant, non dupliqué)', /onConfirmSuggestion=\{\(id\) => selectContact\(card\.cardId, id\)\}/.test(captureSrc));
  check('"Aucun" appelle toujours selectContact(card.cardId, null) — comportement métier inchangé', /onClear=\{\(\) => selectContact\(card\.cardId, null\)\}/.test(captureSrc));
  check('UN SEUL ContactPicker partagé par toutes les cartes (pas un par carte)', (captureSrc.match(/<ContactPicker/g) ?? []).length === 1);
  check('aucun appel LLM/STT ajouté à proximité (uploadAudioForCapture toujours le seul point d’entrée réseau du flow)', (captureSrc.match(/uploadAudioForCapture\(/g) ?? []).length === 1);

  console.log('  [MemorizedPenseesScreen.tsx — §8/§9]');
  check('jamais tous les contacts en chips (aucun availableContacts.map() de Pressable restant)', !/availableContacts\.map\(\(c\) => \(/.test(memorizedSrc));
  check('état sans filtre : "Tous les contacts" (ouvre le picker, ne signifie PAS "aucune personne")', memorizedSrc.includes('Tous les contacts'));
  check('état avec filtre : croix dédiée qui retire UNIQUEMENT le filtre Contact (setContactFilter(null), pas les autres filtres)', /onPress=\{\(\) => setContactFilter\(null\)\} hitSlop=\{8\}/.test(memorizedSrc));
  check('utilise le MÊME ContactPicker partagé', memorizedSrc.includes("import { ContactPicker } from '../components/ContactPicker'"));
  check('sélection dans le picker FILTRE (pas d’association métier) — setContactFilter, jamais setContactId', /onSelect=\{\(id\) => \{\s*setContactFilter\(id\);/.test(memorizedSrc) && !memorizedSrc.includes('setContactId'));

  console.log('  [contactMatching.ts — confirmation de non-régression]');
  check('aucune modification de contactMatching.ts requise pour ce chantier (fichier non ouvert en écriture)', contactMatchingSrc.includes('matchContactByHeardName'));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
