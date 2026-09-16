// Tests purs (aucun réseau) — validate.ts. CHANTIER RÉPONSES INTELLIGENTES, incrément 1.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateLlmOutput, validateRequestContext } from './validate.ts';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    tone: 'chaleureux',
    context: {
      contact: { prenom: 'Yohan', genre: 'homme', relation: 'Famille', familyRole: 'Frère' },
      occasion: { occasion: 'birthday', daysUntil: 3 },
      quiz: null,
      pensees: { optional: true, items: [] },
      ...((overrides.context as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

Deno.test('requête valide (birthday, sans quiz, sans pensées) → ok', () => {
  const result = validateRequestContext(validBody());
  assert(result.ok);
});

Deno.test('tone inconnu → rejeté', () => {
  const result = validateRequestContext(validBody({ tone: 'agressif' }));
  assert(!result.ok);
});

Deno.test('contact.prenom manquant → rejeté', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).contact = { ...(body.context as any).contact, prenom: '' };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('occasion inconnue → rejetée', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).occasion = { occasion: 'noel' };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('occasion birthday sans daysUntil numérique → rejetée', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).occasion = { occasion: 'birthday' };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('occasion thinking_of_you sans champ supplémentaire → ok', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).occasion = { occasion: 'thinking_of_you' };
  const result = validateRequestContext(body);
  assert(result.ok);
});

Deno.test('occasion event SANS texte/date → rejetée (jamais d’occasion inventée côté serveur non plus)', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).occasion = { occasion: 'event' };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('occasion event avec texte mais date mal formée → rejetée', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).occasion = { occasion: 'event', texte: 'Entretien important', date: '20-09-2026' };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('occasion event valide (texte + date YYYY-MM-DD) → ok, valeurs fidèles', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).occasion = { occasion: 'event', texte: 'Décroche son nouveau poste', date: '2026-09-20' };
  const result = validateRequestContext(body);
  assert(result.ok);
  if (result.ok && result.context.occasion.occasion === 'event') {
    assertEquals(result.context.occasion.texte, 'Décroche son nouveau poste');
    assertEquals(result.context.occasion.date, '2026-09-20');
  }
});

Deno.test('quiz présent avec interests/wish valides → ok', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).quiz = { interests: ['musique', 'gaming'], wish: 'Un casque audio' };
  const result = validateRequestContext(body);
  assert(result.ok);
});

Deno.test('quiz avec interests non-tableau de chaînes → rejeté', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).quiz = { interests: [1, 2], wish: 'x' };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('pensees.optional doit être exactement true — false rejeté', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).pensees = { optional: false, items: [] };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('pensees.items au-delà de 5 éléments → rejeté', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).pensees = { optional: true, items: ['a', 'b', 'c', 'd', 'e', 'f'] };
  const result = validateRequestContext(body);
  assert(!result.ok);
});

Deno.test('pensees.items avec exactement 5 éléments → ok', () => {
  const body = validBody();
  (body.context as Record<string, unknown>).pensees = { optional: true, items: ['a', 'b', 'c', 'd', 'e'] };
  const result = validateRequestContext(body);
  assert(result.ok);
});

Deno.test('corps de requête non-objet → rejeté sans exception', () => {
  const result = validateRequestContext('pas un objet');
  assert(!result.ok);
});

// --- Sortie LLM ------------------------------------------------------------------------------

Deno.test('validateLlmOutput — { message: string } valide → ok', () => {
  const result = validateLlmOutput({ message: 'Joyeux anniversaire Yohan !' });
  assert(result.ok);
  if (result.ok) assertEquals(result.message, 'Joyeux anniversaire Yohan !');
});

Deno.test('validateLlmOutput — message vide → rejeté', () => {
  const result = validateLlmOutput({ message: '   ' });
  assert(!result.ok);
});

Deno.test('validateLlmOutput — champ message absent → rejeté', () => {
  const result = validateLlmOutput({ texte: 'Joyeux anniversaire' });
  assert(!result.ok);
});

Deno.test('validateLlmOutput — pas un objet → rejeté sans exception', () => {
  const result = validateLlmOutput('juste une chaîne');
  assert(!result.ok);
});

Deno.test('validateLlmOutput — message anormalement long → rejeté', () => {
  const result = validateLlmOutput({ message: 'x'.repeat(3000) });
  assert(!result.ok);
});

Deno.test('validateLlmOutput — trim appliqué au message final', () => {
  const result = validateLlmOutput({ message: '  Bon anniversaire !  ' });
  assert(result.ok);
  if (result.ok) assertEquals(result.message, 'Bon anniversaire !');
});

// --- Garantie déterministe anti-tirets (2026-09-16) — voir dashNormalization.ts pour la stratégie --

Deno.test('validateLlmOutput — tiret cadratin résiduel du modèle → normalisé, jamais renvoyé tel quel', () => {
  const result = validateLlmOutput({ message: 'Joyeux anniversaire Yohan — profite bien de ta journée.' });
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.message, 'Joyeux anniversaire Yohan, profite bien de ta journée.');
    assert(!result.message.includes('—'));
  }
});

Deno.test('validateLlmOutput — demi-cadratin résiduel du modèle → normalisé', () => {
  const result = validateLlmOutput({ message: 'Je pense à toi – prends soin de toi.' });
  assert(result.ok);
  if (result.ok) assert(!result.message.includes('–'));
});

Deno.test('validateLlmOutput — aucun succès {message} ne contient jamais — ni – même si le modèle en produit plusieurs', () => {
  const outputs = [
    'Bon anniversaire — vraiment — profite bien !',
    'à bientôt–j’espère',
    'On se dit ça dans 10–15 jours.',
    '— Joyeux anniversaire, profite bien !',
  ];
  for (const message of outputs) {
    const result = validateLlmOutput({ message });
    assert(result.ok, `devrait rester valide pour: "${message}"`);
    if (result.ok) {
      assert(!result.message.includes('—'), `tiret cadratin résiduel pour: "${message}" → "${result.message}"`);
      assert(!result.message.includes('–'), `demi-cadratin résiduel pour: "${message}" → "${result.message}"`);
    }
  }
});
