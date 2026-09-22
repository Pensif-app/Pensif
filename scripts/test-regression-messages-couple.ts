// Tests de non-régression — CHANTIER "Pré-TestFlight Phase 4C — Messages relation-aware" (2026-09-22).
// Couvre le côté CLIENT : templates statiques (messages.ts, aucun changement de comportement pour
// Couple — vérifié ici) + non-divergence du contrat suggest-message dupliqué entre
// src/data/messageSuggestion.ts (client) et supabase/functions/suggest-message/contract.ts (Edge
// Function, Deno). Le prompt lui-même (Edge Function, familyDescriptor/règle 10) est testé côté
// Deno dans supabase/functions/suggest-message/prompt.test.ts — pas réimplémenté ici.
//
// Usage : npx tsx scripts/test-regression-messages-couple.ts

import * as fs from 'fs';
import * as path from 'path';
import { Contact } from '../src/data/types';
import { messageTemplates } from '../src/data/messages';

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

function makeContact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c-1',
    prenom: 'Léa',
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Couple',
    familyRole: null,
    genre: 'femme',
    initials: 'L',
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
    ...overrides,
  };
}

const FORBIDDEN_NICKNAMES = ['mon amour', 'chéri', 'chérie', 'bébé', 'cœur'];

console.log('\n[1] Templates statiques — relation=Couple n’injecte AUCUN surnom affectif inventé, quel que soit le familyRole');
{
  const roles: (string | null)[] = [null, 'Partenaire', 'Petit ami', 'Petite amie', 'Fiancé', 'Fiancée', 'Mari', 'Épouse'];
  for (const role of roles) {
    const contact = makeContact({ familyRole: role, prenom: 'Léa' });
    for (const tone of ['chaleureux', 'complice', 'court'] as const) {
      const message = messageTemplates[tone](contact);
      check(
        `${tone} + Couple/${role ?? '(aucun)'} : le prénom "Léa" apparaît (repli existant, comportement Ami/Autres inchangé)`,
        message.includes('Léa'),
        message,
      );
      for (const forbidden of FORBIDDEN_NICKNAMES) {
        check(`${tone} + Couple/${role ?? '(aucun)'} : "${forbidden}" absent`, !message.toLowerCase().includes(forbidden), message);
      }
    }
  }
}

console.log('\n[2] Non-régression — Famille (Frère/Mère) toujours son terme dédié, comportement historique inchangé');
{
  const frere = makeContact({ relation: 'Famille', familyRole: 'Frère', prenom: 'Tom', genre: 'homme' });
  check('chaleureux + Frère : "mon frère" présent (terme dédié inchangé)', messageTemplates.chaleureux(frere).includes('mon frère'));
  check('complice + Frère : "frérot" présent (terme dédié inchangé)', messageTemplates.complice(frere).includes('frérot'));

  const mere = makeContact({ relation: 'Famille', familyRole: 'Mère', prenom: 'Anne', genre: 'femme' });
  check('chaleureux + Mère : "maman" présent (terme dédié inchangé)', messageTemplates.chaleureux(mere).includes('maman'));
}

console.log('\n[3] Non-régression — Ami/Autres : comportement générique déjà existant, non affecté par l’ajout de Couple');
{
  const ami = makeContact({ relation: 'Ami', familyRole: 'Meilleur', prenom: 'Zoé', genre: null });
  const message = messageTemplates.chaleureux(ami);
  check('Ami : aucun terme dédié (familyTerm reste scopé à Famille uniquement), repli sur le prénom', message.includes('Zoé') && !message.includes('meilleur'));
}

console.log('\n[4] Contrat suggest-message — non-divergence entre client (messageSuggestion.ts) et Edge Function (contract.ts)');
{
  const clientSrc = readSrc('src', 'data', 'messageSuggestion.ts');
  const contractSrc = readSrc('supabase', 'functions', 'suggest-message', 'contract.ts');
  // Les deux copies du type `contact` (voir contract.ts, commentaire de tête : "types autonomes,
  // volontairement DUPLIQUÉS") doivent rester synchronisées manuellement — ce test échoue si l'une
  // évolue sans l'autre pour le champ contact (relation/familyRole), le seul touché par cette phase.
  const clientContactType = /contact: \{ prenom: string; genre: Genre \| null; relation: string; familyRole: string \| null \}/.test(clientSrc);
  const edgeContactType = /contact: \{ prenom: string; genre: 'homme' \| 'femme' \| null; relation: string; familyRole: string \| null \}/.test(contractSrc);
  check('client (messageSuggestion.ts) : forme du champ contact inchangée (prenom/genre/relation/familyRole)', clientContactType);
  check('Edge Function (contract.ts) : forme du champ contact inchangée (prenom/genre/relation/familyRole)', edgeContactType);
  check(
    'aucune divergence introduite par cette phase : ni le client ni l’Edge Function n’ont ajouté de nouveau champ pour Couple (relation/familyRole suffisent, déjà génériques)',
    !clientSrc.includes('coupleRole') && !contractSrc.includes('coupleRole'),
  );
}

console.log('\n[5] Aucune modification du contrat n’était nécessaire — confirmé : relation/familyRole restent de simples string (aucun enum ajouté côté contrat)');
{
  const contractSrc = readSrc('supabase', 'functions', 'suggest-message', 'contract.ts');
  check('relation: string (pas un union type "Famille" | "Couple" | ... — jamais un enum ici)', /relation: string/.test(contractSrc));
  check('familyRole: string | null (inchangé)', /familyRole: string \| null/.test(contractSrc));
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
