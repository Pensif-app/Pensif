// Tests purs (aucun réseau) — verrouille les règles durcies du prompt système suite aux benchmarks
// (2026-09-16) : sélection du contexte, interdiction d'inventer une action/un état non fourni, ton
// limité à la formulation (pas d'anecdote/habitude/blague inventée), et interdiction d'affirmer une
// émotion même déductible d'un événement fourni. Règles GÉNÉRALES — ces tests vérifient leur
// présence textuelle, jamais un cas particulier du corpus de benchmark.
//
// `buildSystemPrompt` prend désormais `tone` (2026-09-17, durcissement ciblé complice) — les tests de
// règles COMMUNES utilisent 'chaleureux' comme tonalité représentative (ces règles s'appliquent aux 3
// tons identiquement). Voir le bloc dédié en fin de fichier pour la réserve complice elle-même.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSystemPrompt } from './prompt.ts';

Deno.test('règle "sélection du contexte" — présence explicite, en cas de doute ignorer', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes('ne signifie PAS qu\'elle doit apparaître dans le message'));
  assert(prompt.includes('en cas de doute, ignore-la'));
});

Deno.test('règle "sélection du contexte" — exclusion explicite du purement administratif/logistique pour birthday/thinking_of_you', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.toLowerCase().includes('administrative'));
  assert(prompt.toLowerCase().includes('logistique'));
});

Deno.test('règle "interdiction d\'inventer" — présence explicite, exemples génériques (pas de cas du benchmark)', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes("N'invente JAMAIS une action, un événement futur ou un état"));
  assert(prompt.includes('rencontre à venir'));
  assert(prompt.includes('célébration prévue'));
  assert(prompt.includes('cadeau que l\'expéditeur va acheter ou offrir'));
  assert(prompt.includes('promesse d\'action'));
  assert(prompt.includes('état émotionnel du proche'));
  assert(prompt.includes('résultat d\'un événement futur'));
});

Deno.test('règle "interdiction d\'inventer" — formulations génériques non factuelles restent explicitement autorisées', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes('je pense à toi'));
  assert(prompt.includes('profite bien de ta journée'));
  assert(prompt.includes('donne-moi de tes nouvelles'));
});

Deno.test('règle "état émotionnel" — jamais affirmé même déductible d\'un événement fourni (ex. "tout s\'est bien passé" ne doit jamais devenir "quel soulagement")', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes("N'affirme JAMAIS un état émotionnel non fourni"));
  assert(prompt.includes('permettrait raisonnablement de le déduire'));
  assert(prompt.includes('tout s\'est bien passé'));
  assert(prompt.includes('quel soulagement'));
});

Deno.test('règle "ton" — limité à la formulation, jamais à l\'ajout d\'un fait/anecdote/habitude/blague', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes('Le ton modifie UNIQUEMENT la manière de formuler les informations disponibles'));
  assert(prompt.includes("il n'autorise JAMAIS l'ajout d'un fait, d'une anecdote, d'une habitude, d'une blague supposant un vécu commun"));
});

Deno.test('règle "ton" — contexte pauvre → message simple ; complicité par le style seul, jamais un souvenir inventé', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes('Si le contexte est pauvre, le message doit rester simple'));
  assert(prompt.includes('crée la complicité uniquement par le style et la formulation'));
  assert(prompt.includes('jamais en inventant un souvenir ou une habitude partagée'));
});

Deno.test('les 9 règles restent numérotées dans l’ordre (facts, sélection contexte, extrapolation, invention, naturel, ton, non-mention Pensif, interdiction tirets, JSON)', () => {
  const prompt = buildSystemPrompt('chaleureux');
  for (let i = 1; i <= 9; i++) {
    assert(new RegExp(`\\n${i}\\.`).test(prompt) || prompt.startsWith(`${i}.`), `règle ${i} manquante ou mal numérotée`);
  }
  assert(!prompt.includes('\n10.'), 'aucune 10e règle ne doit exister (pas de liste de cas particuliers)');
});

Deno.test('règle "interdiction des tirets" — présence explicite, tiret cadratin et demi-cadratin nommés', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes('tiret cadratin (—)'));
  assert(prompt.includes('demi-cadratin (–)'));
  assert(prompt.includes('ponctuation française naturelle'));
});

// --- Durcissement CIBLÉ complice (2026-09-17) — tests réels iPhone ----------------------------------
// Cas réels : accumulation forcée de détails ("café sans sucre" hors sujet), préférence transformée en
// habitude ("toujours fidèle au poste"), fête inventée ("après la fête"), intention de l'expéditeur
// inventée ("j'ai hâte de voir tes photos"). Les 9 règles communes ci-dessus restent identiques pour
// les 3 tons — seule la réserve complice change, et UNIQUEMENT pour ce ton.

Deno.test('chaleureux et court restent BYTE POUR BYTE identiques à avant — aucun durcissement global', () => {
  const chaleureux = buildSystemPrompt('chaleureux');
  const court = buildSystemPrompt('court');
  assert(!chaleureux.includes('Réserve supplémentaire pour le ton "complice"'));
  assert(!court.includes('Réserve supplémentaire pour le ton "complice"'));
  // Les deux tons non-complice partagent exactement le même texte de base (rien qui dépende du ton
  // n'existe dans buildSystemPrompt — TONE_DESCRIPTIONS n'intervient que côté buildUserPrompt).
  assertEquals(chaleureux, court);
});

Deno.test('complice contient la réserve supplémentaire, en plus des 9 règles communes (jamais à la place)', () => {
  const complice = buildSystemPrompt('complice');
  const chaleureux = buildSystemPrompt('chaleureux');
  assert(complice.startsWith(chaleureux), 'le prompt complice doit contenir EXACTEMENT le même texte de base, puis un ajout — jamais une réécriture');
  assert(complice.includes('Réserve supplémentaire pour le ton "complice"'));
  assert(complice.length > chaleureux.length);
});

Deno.test('complice — style ne change jamais la quantité de contexte utilisée ni la liberté factuelle', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('change UNIQUEMENT le style'));
  assert(complice.includes('JAMAIS la quantité de contexte utilisée ni la liberté factuelle'));
});

Deno.test('complice — détail non pertinent ignoré, jamais combiné/forcé pour paraître plus complice', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes("N'utilise une information personnelle QUE si elle améliore naturellement le message"));
  assert(complice.includes('private joke'));
  assert(complice.includes('ni combinée à d\'autres détails uniquement pour paraître plus complice'));
});

Deno.test('complice — préférence ≠ habitude/gimmick, sauf récurrence explicitement fournie', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('Ne transforme JAMAIS une préférence ponctuelle en habitude récurrente'));
  assert(complice.includes('"toujours"'));
  assert(complice.includes('"comme d\'habitude"'));
  assert(complice.includes('"fidèle au poste"'));
  assert(complice.includes('sauf si cette récurrence est explicitement écrite dans le contexte fourni'));
});

Deno.test('complice — aucune expérience/intention/fête/présence future inventée', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes("N'invente JAMAIS une expérience partagée, une intention ou une attente de l'expéditeur"));
  assert(complice.includes('j\'ai hâte de'));
  assert(complice.includes('une fête, une rencontre ou une présence future non mentionnée'));
});

Deno.test('complice — contexte pauvre → message complice SIMPLE, jamais inventer de la matière', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('produis un message complice SIMPLE'));
});

// --- Durcissement CIBLÉ complice, 2e passe (2026-09-17) — cas réels 19/20 toujours en échec malgré la
// 1re passe : le café (hors sujet) était encore mentionné, avec inversion de sens ("sans sucre" →
// "n'oublie pas le sucre") et une recherche active d'appareil photo supposée à partir d'un simple wish.

Deno.test('complice — pertinence avant personnalisation : vrai + disponible ne suffit jamais à justifier l’usage', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('Pertinence avant personnalisation'));
  assert(complice.includes('ne constitue JAMAIS à elle seule une raison suffisante de l\'utiliser'));
});

Deno.test('complice — détail sans lien naturel avec l’occasion/le sujet doit être ignoré, même exact', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('doit être ignoré s\'il n\'a pas de lien naturel avec l\'occasion ou le sujet principal du message'));
});

Deno.test('complice — ne jamais "caser" une préférence triviale pour donner une impression de proximité', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('Ne cherche JAMAIS à "caser" une préférence triviale'));
  assert(complice.includes('boisson, nourriture, couleur, habitude de consommation'));
});

Deno.test('complice — rester centré sur le sujet naturellement pertinent plutôt que d’ajouter un détail secondaire', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('reste centré sur ce sujet plutôt que d\'ajouter un détail personnel secondaire sans rapport avec lui'));
});

Deno.test('complice — sémantique exacte : aucune inversion/complétion/transformation d’une préférence (cas réels 19/20)', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('Respecte EXACTEMENT la sémantique d\'une information personnelle'));
  assert(complice.includes('"café sans sucre" ne devient jamais "n\'oublie pas le sucre"'));
  assert(complice.includes('"souhaite un appareil photo" ne signifie pas "cherche actuellement un appareil photo"'));
  assert(complice.includes('une envie exprimée ne devient jamais une action en cours ou une recherche active'));
});

Deno.test('complice — aucune pensée/donnée quiz utilisée reste un succès, jamais un échec à combler', () => {
  const complice = buildSystemPrompt('complice');
  assert(complice.includes('un message complice sans aucun détail personnel reste un succès, jamais un échec à combler'));
});
