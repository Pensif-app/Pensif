// Tests de non-régression — CHANTIER CAPTURE INTELLIGENTE : matching déterministe proche entendu →
// contact local (src/data/contactMatching.ts), V2 avec fallback fuzzy/phonétique FR. Le LLM ne
// choisit jamais un contactId — uniquement vérifié ici via des scénarios purs, sans dépendance
// réseau/IA. Lecture seule.
//
// Usage : npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-regression-contact-matching.ts

import { Contact } from '../src/data/types';
import { matchContactByHeardName } from '../src/data/contactMatching';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
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

console.log('\n[base] Aucun nom entendu → kind "none"');
{
  const result = matchContactByHeardName(null, [makeContact({ prenom: 'Micka' })]);
  check('kind = none', result.kind === 'none');
}

console.log('\n[base] Insensible à la casse et aux accents ("mickà" doit matcher "Micka")');
{
  const micka = makeContact({ id: 'micka-1', prenom: 'Micka' });
  const result = matchContactByHeardName('mickà', [micka]);
  check('kind = exact malgré casse/accent différents', result.kind === 'exact');
}

console.log('\n[base] Nom entendu ne correspondant à aucun proche, même approximativement → unmatched');
{
  const result = matchContactByHeardName('Quelquun', [makeContact({ prenom: 'Micka' })]);
  check('kind = unmatched', result.kind === 'unmatched');
}

console.log('\n[base] Seul le prénom est comparé (jamais nom de famille)');
{
  const contact = makeContact({ id: 'x', prenom: 'Marc', nom: 'Dupont' });
  const result = matchContactByHeardName('Marc', [contact]);
  check('matché sur le seul prénom', result.kind === 'exact' && result.contactId === 'x');
}

console.log("\n[A] Contacts: Micka | heard: Mika → fuzzy_high_confidence Micka");
{
  const micka = makeContact({ id: 'micka-1', prenom: 'Micka' });
  const result = matchContactByHeardName('Mika', [micka]);
  check('kind = fuzzy_high_confidence', result.kind === 'fuzzy_high_confidence', JSON.stringify(result));
  check('contactId = Micka', result.kind === 'fuzzy_high_confidence' && result.contactId === 'micka-1');
}

console.log("\n[B] Contacts: Micka, Mika | heard: Mika → exact Mika (le fuzzy ne doit JAMAIS remplacer un exact)");
{
  const micka = makeContact({ id: 'micka-1', prenom: 'Micka' });
  const mika = makeContact({ id: 'mika-1', prenom: 'Mika' });
  const result = matchContactByHeardName('Mika', [micka, mika]);
  check('kind = exact', result.kind === 'exact', JSON.stringify(result));
  check('contactId = Mika (jamais Micka)', result.kind === 'exact' && result.contactId === 'mika-1');
}

console.log('\n[C] Contacts: Micka | heard: Mickaël → unmatched (diminutif ≠ prénom complet, jamais fusionnés)');
{
  const micka = makeContact({ id: 'micka-1', prenom: 'Micka' });
  const result = matchContactByHeardName('Mickaël', [micka]);
  check('kind = unmatched', result.kind === 'unmatched', JSON.stringify(result));
}

console.log('\n[D] Contacts: Micka, Mickaël | heard: Mickaël → exact Mickaël');
{
  const micka = makeContact({ id: 'micka-1', prenom: 'Micka' });
  const mickael = makeContact({ id: 'mickael-1', prenom: 'Mickaël' });
  const result = matchContactByHeardName('Mickaël', [micka, mickael]);
  check('kind = exact', result.kind === 'exact');
  check('contactId = Mickaël', result.kind === 'exact' && result.contactId === 'mickael-1');
}

console.log('\n[E] Contacts: Sofia | heard: Sophia → fuzzy_high_confidence Sofia (règle "ph"→"f")');
{
  const sofia = makeContact({ id: 'sofia-1', prenom: 'Sofia' });
  const result = matchContactByHeardName('Sophia', [sofia]);
  check('kind = fuzzy_high_confidence', result.kind === 'fuzzy_high_confidence', JSON.stringify(result));
  check('contactId = Sofia', result.kind === 'fuzzy_high_confidence' && result.contactId === 'sofia-1');
}

console.log('\n[F] Contacts: Sofia, Sophia | heard: Sophia → exact Sophia');
{
  const sofia = makeContact({ id: 'sofia-1', prenom: 'Sofia' });
  const sophia = makeContact({ id: 'sophia-1', prenom: 'Sophia' });
  const result = matchContactByHeardName('Sophia', [sofia, sophia]);
  check('kind = exact', result.kind === 'exact');
  check('contactId = Sophia', result.kind === 'exact' && result.contactId === 'sophia-1');
}

console.log('\n[G] Contacts: Yohan | heard: Yoann → fuzzy_high_confidence (règle h muet + consonne doublée)');
{
  const yohan = makeContact({ id: 'yohan-1', prenom: 'Yohan' });
  const result = matchContactByHeardName('Yoann', [yohan]);
  check('kind = fuzzy_high_confidence', result.kind === 'fuzzy_high_confidence', JSON.stringify(result));
  check('contactId = Yohan', result.kind === 'fuzzy_high_confidence' && result.contactId === 'yohan-1');
}

console.log('\n[H] Contacts: Yohan | heard: Johan → fuzzy_high_confidence (règle alternance Jo-/Yo- en tête)');
{
  const yohan = makeContact({ id: 'yohan-1', prenom: 'Yohan' });
  const result = matchContactByHeardName('Johan', [yohan]);
  check('kind = fuzzy_high_confidence', result.kind === 'fuzzy_high_confidence', JSON.stringify(result));
  check('contactId = Yohan', result.kind === 'fuzzy_high_confidence' && result.contactId === 'yohan-1');
}

console.log('\n[I] Contacts: Yohan, Johan | heard: Johan → exact Johan');
{
  const yohan = makeContact({ id: 'yohan-1', prenom: 'Yohan' });
  const johan = makeContact({ id: 'johan-1', prenom: 'Johan' });
  const result = matchContactByHeardName('Johan', [yohan, johan]);
  check('kind = exact', result.kind === 'exact');
  check('contactId = Johan', result.kind === 'exact' && result.contactId === 'johan-1');
}

console.log('\n[J] Contacts: Léa | heard: Léa → exact Léa');
{
  const lea = makeContact({ id: 'lea-1', prenom: 'Léa' });
  const result = matchContactByHeardName('Léa', [lea]);
  check('kind = exact', result.kind === 'exact');
  check('contactId = Léa', result.kind === 'exact' && result.contactId === 'lea-1');
}

console.log('\n[ambiguïté fuzzy] Deux proches deviennent tous deux plausibles → ambiguous, jamais un choix silencieux');
{
  // "Léo" est à distance fuzzy plausible à la fois de "Léa" et... on construit un cas synthétique
  // sûr : deux contacts dont le nom entendu est fuzzy-proche des deux (mais exact d'aucun).
  const a = makeContact({ id: 'a', prenom: 'Yohan' });
  const b = makeContact({ id: 'b', prenom: 'Yoham' }); // variante fictive, fuzzy-proche de "Yohan" aussi
  const result = matchContactByHeardName('Yohan ', [a, b]); // espace parasite pour éviter un exact direct sur 'a'
  // NB : selon la normalisation, "Yohan " normalisé = "yohan" = exact sur 'a' → on vérifie plutôt
  // le vrai scénario d'ambiguïté fuzzy ci-dessous avec un nom qui n'est EXACT d'aucun des deux.
  void result;
  const heardNoExactMatch = 'Yohane'; // proche fuzzy des deux, exact d'aucun
  const result2 = matchContactByHeardName(heardNoExactMatch, [a, b]);
  check(
    'kind = ambiguous (jamais un choix arbitraire entre 2 candidats fuzzy plausibles)',
    result2.kind === 'ambiguous' || result2.kind === 'unmatched',
    `résultat obtenu (l’un des deux comportements sûrs est acceptable, jamais un contactId choisi arbitrairement) : ${JSON.stringify(result2)}`,
  );
  check('jamais fuzzy_high_confidence quand 2 candidats sont plausibles', result2.kind !== 'fuzzy_high_confidence');
}

console.log('\n[négatif] Prénoms français distincts proches orthographiquement → jamais auto-associés');
{
  const julien = makeContact({ id: 'julien-1', prenom: 'Julien' });
  const r1 = matchContactByHeardName('Julie', [julien]);
  check('Julie ↛ Julien (jamais fusionnés)', r1.kind === 'unmatched', JSON.stringify(r1));

  const simon = makeContact({ id: 'simon-1', prenom: 'Simon' });
  const r2 = matchContactByHeardName('Simone', [simon]);
  check('Simone ↛ Simon (variante féminine, jamais fusionnés)', r2.kind === 'unmatched', JSON.stringify(r2));

  const paul = makeContact({ id: 'paul-1', prenom: 'Paul' });
  const r3 = matchContactByHeardName('Paule', [paul]);
  check('Paule ↛ Paul (variante féminine, jamais fusionnés)', r3.kind === 'unmatched', JSON.stringify(r3));

  const martin = makeContact({ id: 'martin-1', prenom: 'Martin' });
  const r4 = matchContactByHeardName('Martine', [martin]);
  check('Martine ↛ Martin (variante féminine, jamais fusionnés)', r4.kind === 'unmatched', JSON.stringify(r4));

  const michel = makeContact({ id: 'michel-1', prenom: 'Michel' });
  const r5 = matchContactByHeardName('Michèle', [michel]);
  check('Michèle ↛ Michel (variante féminine, jamais fusionnés)', r5.kind === 'unmatched', JSON.stringify(r5));

  const sonia = makeContact({ id: 'sonia-1', prenom: 'Sonia' });
  const r6 = matchContactByHeardName('Sophia', [sonia]);
  check('Sophia ↛ Sonia (prénoms distincts, pas de collision phonétique accidentelle)', r6.kind === 'unmatched', JSON.stringify(r6));
}

console.log('\n[négatif] Noms très courts jamais candidats au fuzzy (évite les faux positifs sur peu de lettres)');
{
  const lea = makeContact({ id: 'lea-1', prenom: 'Léa' });
  const result = matchContactByHeardName('Mia', [lea]);
  check('"Mia" ↛ "Léa" malgré la brièveté', result.kind === 'unmatched', JSON.stringify(result));
}

console.log('\n[5 erreurs STT réelles du benchmark — résumé]');
{
  const contacts = [makeContact({ id: 'micka', prenom: 'Micka' }), makeContact({ id: 'sofia', prenom: 'Sofia' }), makeContact({ id: 'yohan', prenom: 'Yohan' })];
  const scenarios: { registered: string; heard: string }[] = [
    { registered: 'Micka', heard: 'Mika' },
    { registered: 'Micka', heard: 'Mickaël' },
    { registered: 'Sofia', heard: 'Sophia' },
    { registered: 'Yohan', heard: 'Yoann' },
    { registered: 'Yohan', heard: 'Johan' },
  ];
  for (const s of scenarios) {
    const result = matchContactByHeardName(s.heard, contacts);
    console.log(`  ${s.registered} enregistré, "${s.heard}" entendu → ${JSON.stringify(result)}`);
  }
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
