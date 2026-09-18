import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeBrandMentions } from './textNormalization.ts';

Deno.test('normalizeBrandMentions — "Pansif" (erreur STT du nom de marque) → "Pensif"', () => {
  assertEquals(normalizeBrandMentions('tester Pansif'), 'tester Pensif');
});

Deno.test('normalizeBrandMentions — insensible à la casse (STT peut renvoyer n’importe quelle casse)', () => {
  assertEquals(normalizeBrandMentions('PANSIF'), 'Pensif');
  assertEquals(normalizeBrandMentions('pansif'), 'Pensif');
  assertEquals(normalizeBrandMentions('PanSif'), 'Pensif');
});

Deno.test('normalizeBrandMentions — plusieurs occurrences dans le même transcript, toutes corrigées', () => {
  assertEquals(normalizeBrandMentions('Pansif, dis à Pansif de me rappeler'), 'Pensif, dis à Pensif de me rappeler');
});

Deno.test('normalizeBrandMentions — l’adjectif français "pensif" (déjà correct) reste INCHANGÉ', () => {
  assertEquals(normalizeBrandMentions("il avait l'air pensif"), "il avait l'air pensif");
  assertEquals(normalizeBrandMentions('Elle semblait pensive après cette nouvelle.'), 'Elle semblait pensive après cette nouvelle.');
});

Deno.test('normalizeBrandMentions — jamais une substitution de sous-chaîne (mot différent avec "pansif" dedans)', () => {
  assertEquals(normalizeBrandMentions('pansifique'), 'pansifique'); // mot inventé, jamais rencontré en pratique — vérifie juste la limite de mot
});

Deno.test('normalizeBrandMentions — phrase iPhone réelle (transcript STT fautif)', () => {
  assertEquals(
    normalizeBrandMentions('Rappelle-moi tous les jours à 22h55 de tester Pansif pendant 3 jours.'),
    'Rappelle-moi tous les jours à 22h55 de tester Pensif pendant 3 jours.',
  );
});

Deno.test('normalizeBrandMentions — texte sans aucune occurrence reste identique', () => {
  const text = "J'ai un rendez-vous demain à 14h.";
  assertEquals(normalizeBrandMentions(text), text);
});
