// Tests Deno — CHANTIER CAPTURE INTELLIGENTE : validation du contexte temporel + dérivation du
// jour de semaine côté serveur (le client n'envoie plus `weekday`, voir consigne du chantier).
// Usage : deno test supabase/functions/capture/context.test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildTemporalContext, InvalidContextError } from './context.ts';

Deno.test('dérive correctement le jour de semaine (lundi 14 septembre 2026)', () => {
  const ctx = buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: '2026-09-14T10:30:00' });
  assertEquals(ctx.weekday, 'lundi');
  assertEquals(ctx.timezone, 'Europe/Paris');
  assertEquals(ctx.localDateTime, '2026-09-14T10:30:00');
});

Deno.test('dérive correctement un dimanche (2026-09-13)', () => {
  const ctx = buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: '2026-09-13T08:00:00' });
  assertEquals(ctx.weekday, 'dimanche');
});

Deno.test('rejette un context absent', () => {
  assertThrows(() => buildTemporalContext(undefined), InvalidContextError);
  assertThrows(() => buildTemporalContext(null), InvalidContextError);
});

Deno.test('rejette une timezone invalide', () => {
  assertThrows(() => buildTemporalContext({ timezone: 'Pas/UneVraieTimezone', localDateTime: '2026-09-14T10:30:00' }), InvalidContextError);
});

Deno.test('rejette localDateTime avec un offset/Z (doit être naïf)', () => {
  assertThrows(() => buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: '2026-09-14T10:30:00Z' }), InvalidContextError);
  assertThrows(() => buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: '2026-09-14T10:30:00+02:00' }), InvalidContextError);
});

Deno.test('rejette une date calendaire inexistante (31 avril)', () => {
  assertThrows(() => buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: '2026-04-31T10:00:00' }), InvalidContextError);
});

Deno.test('rejette un format complètement différent', () => {
  assertThrows(() => buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: '14/09/2026 10:30' }), InvalidContextError);
});

Deno.test('rejette localDateTime non-string', () => {
  assertThrows(() => buildTemporalContext({ timezone: 'Europe/Paris', localDateTime: 12345 }), InvalidContextError);
});
