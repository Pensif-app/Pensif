// Tests purs (aucun réseau) — prompt.ts, prompt métier PARTAGÉ (Anthropic + base OpenAI). Créé pour
// le CHANTIER RAPPELS RÉCURRENTS, incrément 2 (2026-09-18) : verrouille la règle RÉCURRENCE et le
// bloc reminder.recurrence de JSON_SHAPE_DESCRIPTION. Renumérotation (2026-09-18, chantier "Capture —
// texte concis pour les rappels") : une nouvelle règle 2 (TEXTE CONCIS) a été insérée après la règle 1
// (SPLIT, corrigée contre la duplication par ambiguïté) — toutes les règles suivantes ont glissé d'un
// cran (l'ancienne règle 6 RÉCURRENCE devient 7, l'ancienne règle 7 JSON devient 8). Aucun texte de
// règle préexistante n'a été reformulé au-delà de ce décalage de numéro, sauf la règle 1 (SPLIT).
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildExtractionPrompt } from './prompt.ts';

const CONTEXT = { timezone: 'Europe/Paris', localDateTime: '2026-09-18T10:00:00', weekday: 'vendredi' };

Deno.test('règle 7 (RÉCURRENCE) présente — jamais déduite de deux jours/dates isolés', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('7. RÉCURRENCE'));
  assert(prompt.includes('SAUF si une répétition est EXPLICITEMENT exprimée'));
  assert(prompt.includes('Ne déduis JAMAIS une récurrence de la simple mention de deux jours/dates isolés'));
});

Deno.test('règle 7 — portée ambiguë ("unclear") jamais tranchée, exemple "tous les jours de la semaine"', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"frequency":"unclear"'));
  assert(prompt.includes('NE CHOISIS JAMAIS entre plusieurs interprétations possibles'));
  assert(prompt.includes('tous les jours de la semaine à 21h40'));
});

Deno.test('règle 7 — première occurrence et heure jamais inventée, même pour une récurrence', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('reminder.date" représente la date de la PREMIÈRE occurrence'));
  assert(prompt.includes('reminder.time" reste null si aucune heure n\'a été explicitement dite'));
  assert(prompt.includes('n\'invente jamais un nombre d\'occurrences ou une date de fin non dite'));
});

// --- CHANTIER RAPPELS RÉCURRENTS — incrément 2B (2026-09-18), date de première occurrence ---------

Deno.test('règle 7 — jamais "aujourd\'hui" choisi arbitrairement au seul motif qu\'une règle daily existe', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('JAMAIS "aujourd\'hui" choisi arbitrairement au seul motif qu\'une règle "daily" existe'));
});

Deno.test('règle 7 — les 5 exemples exacts de résolution de date sont présents', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"tous les jours à 21h40" (rien d\'autre) → "date":null'));
  assert(prompt.includes('"tous les jours pendant 5 jours à 21h40" (aucun point de départ dit, seulement une durée) → "date":null'));
  assert(prompt.includes('"tous les jours à partir de demain à 21h40" → "date" = demain'));
  assert(prompt.includes('"chaque lundi à 18h" → "date" = la prochaine occurrence de lundi'));
  assert(prompt.includes('"du lundi au vendredi à 8h" → "date" = la prochaine date appartenant explicitement au motif lundi-vendredi'));
});

Deno.test('JSON_SHAPE_DESCRIPTION — bloc reminder.recurrence présent avec les 6 champs attendus', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"recurrence": {'));
  assert(prompt.includes('"detected": boolean'));
  assert(prompt.includes('"frequency": "daily" | "weekly" | "unclear"'));
  assert(prompt.includes('"daysOfWeek": number[] | null'));
  assert(prompt.includes('"occurrenceCount": number | null'));
  assert(prompt.includes('"untilDate": string | null'));
  assert(prompt.includes('0=dimanche..6=samedi'));
});

Deno.test('règle 8 (réponse JSON stricte) toujours présente, renumérotée après l’insertion des règles 2 et 7', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('8. Réponds UNIQUEMENT avec un objet JSON valide'));
});

Deno.test('règles 3 à 6 préexistantes toujours présentes, texte inchangé au-delà du décalage de numéro (non-régression)', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('3. "event" (une date mentionnée à propos du contenu) et "reminder"'));
  assert(prompt.includes('4. Ne choisis JAMAIS d\'identifiant de contact'));
  assert(prompt.includes("5. N'invente JAMAIS une heure absente"));
  assert(prompt.includes('6. Ne construis JAMAIS de date/heure combinée'));
});

Deno.test('le transcript et le contexte temporel restent bien interpolés (non-régression structurelle)', () => {
  const prompt = buildExtractionPrompt('Rappelle-moi tous les jours à 21h40', CONTEXT);
  assert(prompt.includes('Rappelle-moi tous les jours à 21h40'));
  assert(prompt.includes(CONTEXT.localDateTime));
  assert(prompt.includes(CONTEXT.weekday));
  assert(prompt.includes(CONTEXT.timezone));
});

// --- CHANTIER "Capture — texte concis pour les rappels" (2026-09-18) ------------------------------
// Décision produit : ne rien changer sur "à partir de 8h"/recurrence/heure (benchmark v13 stable) —
// seules la règle 1 (SPLIT, anti-duplication par ambiguïté) et la nouvelle règle 2 (TEXTE CONCIS)
// changent. Contrat JSON/types/validate.ts/recurrence non touchés (aucun test de validate.ts requis).

Deno.test('règle 1 (SPLIT) — corrigée : ambiguïté ≠ plusieurs pensées, comportement multi-intentions réel préservé', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('1. Si la dictée contient plusieurs informations SÉMANTIQUEMENT INDÉPENDANTES'));
  assert(
    prompt.includes(
      "Ne crée en revanche JAMAIS plusieurs entrées pour représenter plusieurs interprétations concurrentes d'une seule et même expression ambiguë",
    ),
  );
  assert(prompt.includes('une ambiguïté n\'est PAS un second contenu séparable'));
  assert(prompt.includes('une seule pensée, en conservant prudemment l\'expression ambiguë dans "texte"'));
});

Deno.test('règle 2 (TEXTE CONCIS) — présente avec ses garde-fous et ses exemples rappel', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('2. "texte" — CONTENU SÉMANTIQUE de la pensée, pas une commande adressée à Pensif'));
  assert(prompt.includes('"Rappelle-moi"'));
  assert(prompt.includes('"Pense à"'));
  assert(prompt.includes("N'oublie pas de"));
  assert(prompt.includes('NE LA RETIRE PAS'), 'le doute doit toujours faire pencher vers la conservation, jamais vers le retrait');
  assert(prompt.includes('la perte d\'une information est plus grave qu\'une redondance'));
  assert(
    prompt.includes('Quand ni "reminder.hasReminder" ni "event.hasDate" ne sont vrais, "texte" reste tel quel (comportement inchangé'),
    'aucune concision hors reminder/event — comportement historique préservé pour les pensées sans structure temporelle',
  );
  assert(prompt.includes('"Sortir le chien"'));
  assert(prompt.includes('"Demander à Nora si elle est libre samedi"'), 'exemple qui distingue date du rappel (retirée) vs. contenu (conservé)');
  assert(prompt.includes('"Marc a un rendez-vous jeudi" → "texte" inchangé'));
});

// --- CHANTIER CAPTURE — EVENT TIME, incrément 2 (2026-09-18) — extension TEXTE CONCIS aux événements

Deno.test('règle 2 — extension ÉVÉNEMENTS présente : date/heure retirées seulement si extraites avec certitude, jamais si sans destination structurée', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('ÉVÉNEMENTS — MÊME logique, appliquée à "event"'));
  assert(prompt.includes('quand "event.hasDate" est vrai'));
  assert(prompt.includes('UNIQUEMENT si son rattachement à CET événement est certain'));
  assert(prompt.includes('UNIQUEMENT si elle a été correctement extraite dans "event.time"'));
  assert(
    prompt.includes('une information temporelle sans destination structurée ne doit JAMAIS disparaître de "texte"'),
  );
});

Deno.test('règle 2 — propriété temporelle PAR PENSÉE quand la dictée est scindée (jamais retirée au nom d\'une autre pensée du lot)', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(
    prompt.includes(
      'une expression temporelle ne peut être retirée du "texte" d\'UNE pensée que si CETTE pensée porte elle-même la structure qui la représente',
    ),
  );
  assert(prompt.includes('jamais parce qu\'une AUTRE pensée du même lot la représente'));
});

Deno.test('règle 2 — exemples événement (date+heure retirées) et ambiguïté événement (samedi conservé) présents', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"texte":"Concert de Nova Ellipse à Rennes"'));
  assert(prompt.includes('"texte":"Spectacle"'));
  assert(
    prompt.includes(
      '"texte" INCHANGÉ si le rattachement de "samedi" (date de l\'anniversaire, ou simple échéance de l\'achat) reste ambigu',
    ),
  );
});

Deno.test('JSON_SHAPE_DESCRIPTION — commentaire de "texte" renvoie à la règle 2, contrat JSON inchangé (toujours string)', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"texte": string,'));
  assert(prompt.includes('voir règle 2 (concis quand reminder.hasReminder=true et/ou event.hasDate=true, inchangé sinon)'));
});

// --- CHANTIER CAPTURE — EVENT TIME, incrément 1 (2026-09-18) ---------------------------------------
// Ajoute event.time de bout en bout (contrat + prompt) — aucun changement de Pensee/Capture
// Review/notifications, aucune modification de TEXTE CONCIS (event.time coexiste avec l'heure encore
// présente dans "texte" pour cet incrément).

Deno.test('JSON_SHAPE_DESCRIPTION — event.time présent, même discipline documentée que reminder.time', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"time": string | null,             // "HH:mm" (24h) SEULEMENT si une heure appartient explicitement à CET événement'));
  assert(prompt.includes('jamais copiée depuis/vers reminder.time'));
});

Deno.test('règle 3 — event.time suit la même discipline que reminder.time (jamais inventée) et reste indépendante de reminder.time', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('"event.time" suit la MÊME discipline que "reminder.time" (règle 5)'));
  assert(prompt.includes('n\'invente jamais une heure d\'événement'));
  assert(prompt.includes('ne copie JAMAIS l\'heure de l\'un vers l\'autre, même si un seul horaire est prononcé dans toute la dictée'));
});

Deno.test('règle 3 — les 4 exemples event.time/reminder.time sont présents (dont le cas "deux heures distinctes")', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('event.date="2027-03-07", event.time="20:00", reminder.hasReminder=false, reminder.time=null'));
  assert(prompt.includes('event.time="20:00" (heure du concert) ET reminder.time="18:00" (heure du rappel, dite séparément)'));
  assert(prompt.includes('event.time="20:00", reminder.time=null — ne recopie JAMAIS 20h dans reminder.time'));
  assert(prompt.includes('event.time="07:12" (heure du train), reminder.time="20:00" (heure du rappel)'));
});

Deno.test('règle 3 historique (EVENT ≠ REMINDER, indépendance date) toujours présente, texte inchangé au-delà de l\'ajout event.time', () => {
  const prompt = buildExtractionPrompt('x', CONTEXT);
  assert(prompt.includes('3. "event" (une date mentionnée à propos du contenu) et "reminder" (une notification explicitement demandée) sont deux notions INDÉPENDANTES'));
});
