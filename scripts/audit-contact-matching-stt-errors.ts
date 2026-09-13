// AUDIT LECTURE SEULE — comportement ACTUEL de matchContactByHeardName (contactMatching.ts) face
// aux erreurs STT réellement observées lors des benchmarks OpenAI/Groq (2026-09-14). Ne modifie
// rien — script temporaire d'audit, pas un test de régression permanent.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/audit-contact-matching-stt-errors.ts
import { matchContactByHeardName } from '../src/data/contactMatching';
import { Contact } from '../src/data/types';

function makeContact(id: string, prenom: string): Contact {
  return {
    id,
    prenom,
    nom: '',
    tel: '',
    date: '1990-01-01',
    relation: 'Ami',
    familyRole: null,
    genre: null,
    initials: prenom[0],
    color: 'sage',
    quiz: null,
    giftPreparedYear: null,
    favorite: false,
    birthdayReminderDays: null,
  };
}

const contacts = [
  makeContact('c-micka', 'Micka'),
  makeContact('c-sofia', 'Sofia'),
  makeContact('c-yohan', 'Yohan'),
  makeContact('c-lea', 'Léa'),
];

const cases: { registered: string; heard: string }[] = [
  { registered: 'Micka', heard: 'Mika' },
  { registered: 'Micka', heard: 'Mickaël' },
  { registered: 'Sofia', heard: 'Sophia' },
  { registered: 'Yohan', heard: 'Yoann' },
  { registered: 'Yohan', heard: 'Johan' },
  { registered: 'Léa', heard: 'Léa' },
];

for (const c of cases) {
  const result = matchContactByHeardName(c.heard, contacts);
  console.log(`${c.registered} → entendu "${c.heard}" → ${JSON.stringify(result)}`);
}
