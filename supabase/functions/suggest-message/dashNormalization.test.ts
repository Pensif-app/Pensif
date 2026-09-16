// Tests purs (aucun réseau) — dashNormalization.ts. CHANTIER RÉPONSES INTELLIGENTES (2026-09-16).
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeDashPunctuation } from './dashNormalization.ts';

Deno.test('texte sans tiret → inchangé', () => {
  assertEquals(
    normalizeDashPunctuation('Joyeux anniversaire Yohan, je pense à toi.'),
    'Joyeux anniversaire Yohan, je pense à toi.',
  );
});

Deno.test('tiret cadratin espacé (incise) → virgule', () => {
  assertEquals(
    normalizeDashPunctuation('Profite bien — et donne-moi de tes nouvelles.'),
    'Profite bien, et donne-moi de tes nouvelles.',
  );
});

Deno.test('demi-cadratin espacé (incise) → virgule', () => {
  assertEquals(
    normalizeDashPunctuation('Je t’embrasse fort – prends soin de toi.'),
    'Je t’embrasse fort, prends soin de toi.',
  );
});

Deno.test('tiret cadratin collé sans espaces → virgule, pas de mots fusionnés', () => {
  assertEquals(normalizeDashPunctuation('à bientôt—prends soin de toi'), 'à bientôt, prends soin de toi');
});

Deno.test('plage numérique avec demi-cadratin → réécrite avec "à", jamais une virgule', () => {
  assertEquals(normalizeDashPunctuation('On se dit ça dans 10–15 jours.'), 'On se dit ça dans 10 à 15 jours.');
});

Deno.test('plage numérique espacée → réécrite avec "à"', () => {
  assertEquals(normalizeDashPunctuation('Entre 20 – 25 ans.'), 'Entre 20 à 25 ans.');
});

Deno.test('tiret en tout début de message → supprimé, pas de virgule orpheline en tête', () => {
  assertEquals(normalizeDashPunctuation('— Joyeux anniversaire !'), 'Joyeux anniversaire !');
});

Deno.test('tiret juste avant un point final → supprimé, pas de virgule avant le point', () => {
  assertEquals(normalizeDashPunctuation('Profite bien de ta journée —.'), 'Profite bien de ta journée.');
});

Deno.test('deux tirets dans le même message → les deux normalisés', () => {
  assertEquals(
    normalizeDashPunctuation('Joyeux anniversaire — vraiment — profite bien.'),
    'Joyeux anniversaire, vraiment, profite bien.',
  );
});

Deno.test('aucun tiret cadratin ni demi-cadratin ne subsiste jamais dans la sortie', () => {
  const inputs = [
    'Bon anniversaire — profite bien !',
    'à bientôt–j’espère',
    '10–15 ans',
    '— test',
    'test —',
    'plusieurs — tirets — dans — une phrase',
  ];
  for (const input of inputs) {
    const result = normalizeDashPunctuation(input);
    assert(!result.includes('—'), `tiret cadratin résiduel pour l'entrée: "${input}" → "${result}"`);
    assert(!result.includes('–'), `demi-cadratin résiduel pour l'entrée: "${input}" → "${result}"`);
  }
});

Deno.test('idempotent — appliquer deux fois donne le même résultat', () => {
  const input = 'Bon anniversaire — profite bien, vraiment — sincèrement.';
  const once = normalizeDashPunctuation(input);
  const twice = normalizeDashPunctuation(once);
  assertEquals(once, twice);
});
