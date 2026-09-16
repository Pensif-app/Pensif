// Tests purs (aucun réseau) — verrouille les règles durcies du prompt système suite aux benchmarks
// (2026-09-16) : sélection du contexte, interdiction d'inventer une action/un état non fourni, ton
// limité à la formulation (pas d'anecdote/habitude/blague inventée), et interdiction d'affirmer une
// émotion même déductible d'un événement fourni. Règles GÉNÉRALES — ces tests vérifient leur
// présence textuelle, jamais un cas particulier du corpus de benchmark.
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSystemPrompt } from './prompt.ts';

Deno.test('règle "sélection du contexte" — présence explicite, en cas de doute ignorer', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes('ne signifie PAS qu\'elle doit apparaître dans le message'));
  assert(prompt.includes('en cas de doute, ignore-la'));
});

Deno.test('règle "sélection du contexte" — exclusion explicite du purement administratif/logistique pour birthday/thinking_of_you', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.toLowerCase().includes('administrative'));
  assert(prompt.toLowerCase().includes('logistique'));
});

Deno.test('règle "interdiction d\'inventer" — présence explicite, exemples génériques (pas de cas du benchmark)', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes("N'invente JAMAIS une action, un événement futur ou un état"));
  assert(prompt.includes('rencontre à venir'));
  assert(prompt.includes('célébration prévue'));
  assert(prompt.includes('cadeau que l\'expéditeur va acheter ou offrir'));
  assert(prompt.includes('promesse d\'action'));
  assert(prompt.includes('état émotionnel du proche'));
  assert(prompt.includes('résultat d\'un événement futur'));
});

Deno.test('règle "interdiction d\'inventer" — formulations génériques non factuelles restent explicitement autorisées', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes('je pense à toi'));
  assert(prompt.includes('profite bien de ta journée'));
  assert(prompt.includes('donne-moi de tes nouvelles'));
});

Deno.test('règle "état émotionnel" — jamais affirmé même déductible d\'un événement fourni (ex. "tout s\'est bien passé" ne doit jamais devenir "quel soulagement")', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes("N'affirme JAMAIS un état émotionnel non fourni"));
  assert(prompt.includes('permettrait raisonnablement de le déduire'));
  assert(prompt.includes('tout s\'est bien passé'));
  assert(prompt.includes('quel soulagement'));
});

Deno.test('règle "ton" — limité à la formulation, jamais à l\'ajout d\'un fait/anecdote/habitude/blague', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes('Le ton modifie UNIQUEMENT la manière de formuler les informations disponibles'));
  assert(prompt.includes("il n'autorise JAMAIS l'ajout d'un fait, d'une anecdote, d'une habitude, d'une blague supposant un vécu commun"));
});

Deno.test('règle "ton" — contexte pauvre → message simple ; complicité par le style seul, jamais un souvenir inventé', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes('Si le contexte est pauvre, le message doit rester simple'));
  assert(prompt.includes('crée la complicité uniquement par le style et la formulation'));
  assert(prompt.includes('jamais en inventant un souvenir ou une habitude partagée'));
});

Deno.test('les 9 règles restent numérotées dans l’ordre (facts, sélection contexte, extrapolation, invention, naturel, ton, non-mention Pensif, interdiction tirets, JSON)', () => {
  const prompt = buildSystemPrompt();
  for (let i = 1; i <= 9; i++) {
    assert(new RegExp(`\\n${i}\\.`).test(prompt) || prompt.startsWith(`${i}.`), `règle ${i} manquante ou mal numérotée`);
  }
  assert(!prompt.includes('\n10.'), 'aucune 10e règle ne doit exister (pas de liste de cas particuliers)');
});

Deno.test('règle "interdiction des tirets" — présence explicite, tiret cadratin et demi-cadratin nommés', () => {
  const prompt = buildSystemPrompt();
  assert(prompt.includes('tiret cadratin (—)'));
  assert(prompt.includes('demi-cadratin (–)'));
  assert(prompt.includes('ponctuation française naturelle'));
});
