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
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts';
import { MessageSuggestionContext } from './contract.ts';

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

Deno.test('les 10 règles restent numérotées dans l’ordre (facts, sélection contexte, extrapolation, invention, naturel, ton, non-mention Pensif, interdiction tirets, JSON, relation)', () => {
  const prompt = buildSystemPrompt('chaleureux');
  for (let i = 1; i <= 10; i++) {
    assert(new RegExp(`\\n${i}\\.`).test(prompt) || prompt.startsWith(`${i}.`), `règle ${i} manquante ou mal numérotée`);
  }
  assert(!prompt.includes('\n11.'), 'aucune 11e règle ne doit exister (pas de liste de cas particuliers)');
});

// --- CHANTIER "Pré-TestFlight Phase 4C — Messages relation-aware" (2026-09-22) — règle 10, ajoutée
// pour verrouiller explicitement la relation elle-même (jusqu'ici seulement couverte implicitement
// par les règles générales d'invention/extrapolation) : le modèle ne doit jamais inventer/déduire la
// nature ou le degré de proximité d'une relation, uniquement utiliser ce qui est explicitement fourni.

Deno.test('règle 10 "relation" — présence explicite, ne jamais inventer la nature/le degré de la relation', () => {
  const prompt = buildSystemPrompt('chaleureux');
  assert(prompt.includes("N'invente jamais la nature ou le degré de la relation entre l'utilisateur et le proche"));
  assert(prompt.includes('Utilise uniquement la relation explicitement fournie dans le contexte'));
  assert(prompt.includes('Si elle est générique ou absente, reste générique'));
});

Deno.test('règle 10 "relation" — présente identiquement dans les 3 tons (règle commune, pas une réserve ciblée)', () => {
  const chaleureux = buildSystemPrompt('chaleureux');
  const complice = buildSystemPrompt('complice');
  const court = buildSystemPrompt('court');
  const rule10 = "10. N'invente jamais la nature ou le degré de la relation";
  assert(chaleureux.includes(rule10));
  assert(complice.includes(rule10));
  assert(court.includes(rule10));
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

// --- CHANTIER "Pré-TestFlight Phase 4C — Messages relation-aware" (2026-09-22) — familyDescriptor(),
// via buildUserPrompt() (fonction non exportée, testée par son seul effet observable : la ligne
// "Prénom du destinataire : ..."). Couvre les scénarios A-F de la consigne (G/H déjà couverts par
// test-regression-message-suggestion-context.ts, côté client, jamais réimplémentés ici).

function baseContext(contact: MessageSuggestionContext['contact']): MessageSuggestionContext {
  return {
    contact,
    occasion: { occasion: 'thinking_of_you' },
    quiz: null,
    pensees: { optional: true, items: [] },
  };
}

Deno.test('A — Couple + familyRole=Fiancée → "fiancée de l\'utilisateur"', () => {
  const context = baseContext({ prenom: 'Léa', genre: 'femme', relation: 'Couple', familyRole: 'Fiancée' });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Léa (fiancée de l\'utilisateur).'));
});

Deno.test('B — Couple + familyRole=Partenaire → "partenaire de l\'utilisateur"', () => {
  const context = baseContext({ prenom: 'Sam', genre: null, relation: 'Couple', familyRole: 'Partenaire' });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Sam (partenaire de l\'utilisateur).'));
});

Deno.test('C — Couple SANS familyRole (null) → repli neutre "partenaire de l\'utilisateur", jamais "couple de l\'utilisateur"', () => {
  const context = baseContext({ prenom: 'Alex', genre: null, relation: 'Couple', familyRole: null });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Alex (partenaire de l\'utilisateur).'));
  assert(!prompt.includes('couple de l\'utilisateur'));
});

Deno.test('D — relation absente (chaîne vide) → "proche de l\'utilisateur", jamais une relation inventée (ami/partenaire/frère/collègue)', () => {
  const context = baseContext({ prenom: 'Camille', genre: null, relation: '', familyRole: null });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Camille (proche de l’utilisateur).'));
  assert(!prompt.toLowerCase().includes('ami de l\'utilisateur'));
  assert(!prompt.toLowerCase().includes('partenaire de l\'utilisateur'));
  assert(!prompt.toLowerCase().includes('frère de l\'utilisateur'));
  assert(!prompt.toLowerCase().includes('collègue de l\'utilisateur'));
});

// --- CHANTIER "Phase 4C.1 — Hardening descriptor relation" (2026-09-22) — CORRECTIF : une `relation`
// non vide mais hors des 4 catégories whitelistées (Famille/Couple/Ami/Autres) était auparavant
// relayée brute au modèle (`contact.relation.toLowerCase()`) — désormais elle retombe sur le même
// générique que l'absence de relation. Les tests D bis/F ci-dessous remplacent leur version Phase 4C
// (qui vérifiait l'ANCIEN comportement, devenu incorrect) — voir aussi les tests §3 dédiés plus bas.

Deno.test('D bis — relation="Voisin" (hors whitelist, non vide) → "proche de l\'utilisateur", JAMAIS relayée brute', () => {
  const context = baseContext({ prenom: 'Dominique', genre: null, relation: 'Voisin', familyRole: null });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Dominique (proche de l’utilisateur).'));
  assert(!prompt.toLowerCase().includes('voisin'), 'la valeur brute "Voisin" ne doit plus jamais apparaître dans le prompt envoyé au modèle');
});

Deno.test('E — non-régression Famille : Frère/Mère inchangés (comportement historique préservé, non whitelisté)', () => {
  const frere = buildUserPrompt(baseContext({ prenom: 'Tom', genre: 'homme', relation: 'Famille', familyRole: 'Frère' }), 'chaleureux');
  assert(frere.includes('Prénom du destinataire : Tom (frère de l\'utilisateur).'));
  const mere = buildUserPrompt(baseContext({ prenom: 'Anne', genre: 'femme', relation: 'Famille', familyRole: 'Mère' }), 'chaleureux');
  assert(mere.includes('Prénom du destinataire : Anne (mère de l\'utilisateur).'));
});

Deno.test('F — Ami : "ami de l\'utilisateur" (inchangé Phase 4C.1/4C.2)', () => {
  const ami = buildUserPrompt(baseContext({ prenom: 'Zoé', genre: null, relation: 'Ami', familyRole: null }), 'chaleureux');
  assert(ami.includes('Prénom du destinataire : Zoé (ami de l\'utilisateur).'));
});

// --- CHANTIER "Phase 4C.2 — Descriptor Autres" (2026-09-22) — CORRECTIF : "autres" seul (Phase 4C.1)
// n'apportait aucune information utile au modèle — remplacé par le lien précis (Collègue/
// Connaissance) quand il est réellement informatif, sinon repli générique "proche de l'utilisateur".
// "autres" ne doit plus JAMAIS apparaître comme descriptor.

Deno.test('§1 — Autres + Collègue → "collègue de l\'utilisateur"', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'Kim', genre: null, relation: 'Autres', familyRole: 'Collègue' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Kim (collègue de l\'utilisateur).'));
});

Deno.test('§1 — Autres + Connaissance → "connaissance de l\'utilisateur"', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'Kim', genre: null, relation: 'Autres', familyRole: 'Connaissance' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Kim (connaissance de l\'utilisateur).'));
});

Deno.test('§1 — Autres + familyRole="Autres" → "proche de l\'utilisateur", jamais "autres" seul', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'Kim', genre: null, relation: 'Autres', familyRole: 'Autres' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Kim (proche de l’utilisateur).'));
  assert(!prompt.toLowerCase().includes('(autres'));
});

Deno.test('§1 — Autres sans familyRole (null) → "proche de l\'utilisateur"', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'Kim', genre: null, relation: 'Autres', familyRole: null }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Kim (proche de l’utilisateur).'));
  assert(!prompt.toLowerCase().includes('(autres'));
});

Deno.test('§1 — Autres + familyRole inconnu (ex. "Voisin") → "proche de l\'utilisateur", jamais relayé brut', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'Kim', genre: null, relation: 'Autres', familyRole: 'Voisin' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Kim (proche de l’utilisateur).'));
  assert(!prompt.toLowerCase().includes('voisin'));
});

Deno.test('"autres" seul n’apparaît plus jamais comme descriptor, quel que soit le cas', () => {
  const cases: (string | null)[] = [null, 'Autres', 'Collègue', 'Connaissance', 'Voisin'];
  for (const role of cases) {
    const prompt = buildUserPrompt(baseContext({ prenom: 'Z', genre: null, relation: 'Autres', familyRole: role }), 'chaleureux');
    assert(!/\(autres\)/i.test(prompt), `descriptor "autres" seul trouvé pour familyRole=${role}`);
  }
});

// --- Consigne §2/§3 (Phase 4C.1) — familyRole Couple invalide, et récapitulatif des cas demandés ---

Deno.test('§2 — Couple + familyRole="Voisin" (hors des 7 liens Couple whitelistés) → repli "partenaire de l\'utilisateur", jamais relayé brut', () => {
  const context = baseContext({ prenom: 'Charlie', genre: null, relation: 'Couple', familyRole: 'Voisin' });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : Charlie (partenaire de l\'utilisateur).'));
  assert(!prompt.toLowerCase().includes('voisin'));
});

Deno.test('§3 — relation="" → "proche de l\'utilisateur"', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'A', genre: null, relation: '', familyRole: null }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : A (proche de l’utilisateur).'));
});

Deno.test('§3 — relation="Voisin" → "proche de l\'utilisateur" (doublon volontaire du cas D bis, nommage explicite demandé par la consigne)', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'B', genre: null, relation: 'Voisin', familyRole: null }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : B (proche de l’utilisateur).'));
});

Deno.test('§3 — Couple + familyRole="Voisin" → "partenaire de l\'utilisateur" (doublon volontaire de §2, nommage explicite demandé par la consigne)', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'C', genre: null, relation: 'Couple', familyRole: 'Voisin' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : C (partenaire de l\'utilisateur).'));
});

Deno.test('§3 — Couple + Fiancée → "fiancée de l\'utilisateur" (doublon volontaire du cas A, nommage explicite demandé par la consigne)', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'D', genre: 'femme', relation: 'Couple', familyRole: 'Fiancée' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : D (fiancée de l\'utilisateur).'));
});

Deno.test('§3 — Ami → comportement attendu ("ami de l\'utilisateur", doublon volontaire du cas F, nommage explicite demandé par la consigne)', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'E', genre: null, relation: 'Ami', familyRole: null }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : E (ami de l\'utilisateur).'));
});

Deno.test('§3 — Famille + Frère → comportement historique inchangé (doublon volontaire du cas E, nommage explicite demandé par la consigne)', () => {
  const prompt = buildUserPrompt(baseContext({ prenom: 'F', genre: 'homme', relation: 'Famille', familyRole: 'Frère' }), 'chaleureux');
  assert(prompt.includes('Prénom du destinataire : F (frère de l\'utilisateur).'));
});

// Whitelist complète — les 7 liens Couple valides restent tous acceptés tels quels (non-régression
// de la Phase 4C elle-même, avant durcissement).
Deno.test('whitelist Couple — les 7 liens valides (Partenaire/Petit ami/Petite amie/Fiancé/Fiancée/Mari/Épouse) sont tous acceptés', () => {
  for (const role of ['Partenaire', 'Petit ami', 'Petite amie', 'Fiancé', 'Fiancée', 'Mari', 'Épouse']) {
    const prompt = buildUserPrompt(baseContext({ prenom: 'X', genre: null, relation: 'Couple', familyRole: role }), 'chaleureux');
    assert(prompt.includes(`Prénom du destinataire : X (${role.toLowerCase()} de l'utilisateur).`), `échec pour le rôle "${role}"`);
  }
});

Deno.test('G — pensée réelle fournie reste exploitable dans buildUserPrompt (aucun changement de mécanisme de sélection dans cette phase)', () => {
  const context: MessageSuggestionContext = {
    contact: { prenom: 'Léa', genre: 'femme', relation: 'Couple', familyRole: 'Fiancée' },
    occasion: { occasion: 'thinking_of_you' },
    quiz: null,
    pensees: { optional: true, items: ['Elle passe un entretien lundi'] },
  };
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(prompt.includes('Notes personnelles récentes'));
  assert(prompt.includes('"Elle passe un entretien lundi"'));
});

Deno.test('H — aucun fait connu → aucune instruction n’invite à en inventer un (contrôle négatif sur le texte assemblé)', () => {
  const context = baseContext({ prenom: 'Léa', genre: 'femme', relation: 'Couple', familyRole: 'Fiancée' });
  const prompt = buildUserPrompt(context, 'chaleureux');
  assert(!prompt.includes('Notes personnelles récentes'), 'aucune section de notes ne doit apparaître quand pensees.items est vide');
  // Contrôle négatif direct sur les tournures interdites explicitement par la consigne §5.
  assert(!prompt.toLowerCase().includes('tout ce que vous avez traversé ensemble'));
  assert(!prompt.toLowerCase().includes('notre vie ensemble'));
  assert(!prompt.toLowerCase().includes('notre futur mariage'));
});
