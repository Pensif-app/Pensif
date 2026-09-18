// Benchmark OBSERVATIONNEL — CHANTIER CAPTURE, EVENT TIME incrément 2 (2026-09-18) : extension de la
// règle TEXTE CONCIS aux événements (event.hasDate=true). Réutilise EXACTEMENT
// buildOpenaiRequestBody/validateLlmOutput — même modèle/reasoning_effort/pipeline que Capture (non
// déployé au moment de ce run). Rapporte la sortie complète (nombre de pensées, texte, event,
// reminder) et signale toute information temporelle disparue de "texte" sans être représentée
// structurellement dans AUCUNE pensée produite pour ce cas — la seule vraie perte à surveiller.
//
// Ne modifie ni ne déploie rien — écrit uniquement un rapport dans
// scripts/benchmark-capture-texte-concis-events.report.md.
//
// Usage :
//   OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-texte-concis-events.ts
//
// Modèle ajustable par env : OPENAI_MINI_MODEL (défaut gpt-5-mini).

import { buildOpenaiRequestBody } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext, ExtractedPensee } from '../supabase/functions/_shared/captureContract.ts';

const MINI_MODEL = Deno.env.get('OPENAI_MINI_MODEL') ?? 'gpt-5-mini';
const PRICING_USD_PER_1M = { input: 0.25, output: 2 }; // gpt-5-mini — à vérifier sur la page tarifaire officielle avant toute décision budgétaire

const FIXED_CONTEXT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T10:00:00', // vendredi
  weekday: 'vendredi',
};

// Cas 3, 4, 8 répétés 3x chacun (sollicitent les frontières event/reminder/ambiguïté).
const CASES: { label: string; transcript: string }[] = [
  { label: '1', transcript: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30.' },
  { label: '2', transcript: "J'ai un concert vendredi à 20h. Rappelle-moi la veille." },
  { label: '3a (run 1/3)', transcript: "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h." },
  { label: '3b (run 2/3)', transcript: "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h." },
  { label: '3c (run 3/3)', transcript: "J'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h." },
  { label: '4a (run 1/3)', transcript: 'Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi.' },
  { label: '4b (run 2/3)', transcript: 'Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi.' },
  { label: '4c (run 3/3)', transcript: 'Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi.' },
  { label: '5', transcript: 'Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi à 9h.' },
  { label: '6', transcript: 'Train samedi à 7h12, rappelle-moi vendredi à 20h de préparer ma valise.' },
  { label: '7', transcript: 'Sofia a un entretien vendredi.' },
  { label: '8a (run 1/3)', transcript: "Acheter un cadeau pour l'anniversaire de Léa samedi." },
  { label: '8b (run 2/3)', transcript: "Acheter un cadeau pour l'anniversaire de Léa samedi." },
  { label: '8c (run 3/3)', transcript: "Acheter un cadeau pour l'anniversaire de Léa samedi." },
  { label: '9', transcript: 'Micka aimerait un casque audio.' },
  { label: '10', transcript: "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi." },
];

type CallResult = { outcome: ValidationOutcome; latencyMs: number; inputTokens: number | null; outputTokens: number | null };

async function callMini(transcript: string): Promise<CallResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { outcome: { ok: false, parseError: 'OPENAI_API_KEY absent' }, latencyMs: 0, inputTokens: null, outputTokens: null };
  const start = performance.now();
  try {
    const body = buildOpenaiRequestBody(transcript, FIXED_CONTEXT, MINI_MODEL);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const latencyMs = performance.now() - start;
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return { outcome: { ok: false, parseError: `HTTP ${response.status}: ${errBody}` }, latencyMs, inputTokens: null, outputTokens: null };
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const content = data.choices?.[0]?.message?.content;
    let parsed: unknown = null;
    if (content) {
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = null;
      }
    }
    return { outcome: validateLlmOutput(parsed), latencyMs, inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null };
  } catch (e) {
    return { outcome: { ok: false, parseError: String(e) }, latencyMs: performance.now() - start, inputTokens: null, outputTokens: null };
  }
}

function estimateCostUsd(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  return (inputTokens / 1_000_000) * PRICING_USD_PER_1M.input + (outputTokens / 1_000_000) * PRICING_USD_PER_1M.output;
}

/** Heuristique de vérification manuelle-assistée (pas une décision automatique) : cherche des
 *  nombres/jours de semaine FR dans le transcript qui ne réapparaissent NULLE PART — ni dans un
 *  texte, ni dans un event/reminder date/time d'AUCUNE des pensées produites — pour ce cas. Sert
 *  uniquement à attirer l'œil dans le rapport, le jugement final reste manuel (voir consigne).
 */
const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
function flagPotentialLoss(transcript: string, pensees: ExtractedPensee[]): string[] {
  const flags: string[] = [];
  const lower = transcript.toLowerCase();
  for (const day of WEEKDAYS_FR) {
    if (!lower.includes(day)) continue;
    const inAnyTexte = pensees.some((p) => p.texte.toLowerCase().includes(day));
    const inAnyStructure = pensees.some(
      (p) => (p.event.heardExpression ?? '').toLowerCase().includes(day) || (p.reminder.heardExpression ?? '').toLowerCase().includes(day) || p.event.hasDate || p.reminder.date,
    );
    if (!inAnyTexte && !inAnyStructure) flags.push(`"${day}" absent de tout texte ET d'aucune structure (event/reminder) — perte potentielle`);
  }
  return flags;
}

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark — TEXTE CONCIS étendu aux événements (CHANTIER CAPTURE EVENT TIME, incrément 2, non déployé)\n');
  lines.push(`Modèle : \`${MINI_MODEL}\`. Contexte fixe : vendredi 2026-09-18 10:00, "vendredi" = aujourd'hui, "samedi" = 2026-09-19, "lundi" = 2026-09-21.\n`);

  let totalCost = 0;
  for (const c of CASES) {
    console.log(`\n=== Cas ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}"`);
    const r = await callMini(c.transcript);
    const pensees = r.outcome.ok ? r.outcome.pensees : [];
    const cost = estimateCostUsd(r.inputTokens, r.outputTokens);
    if (cost !== null) totalCost += cost;
    const flags = r.outcome.ok ? flagPotentialLoss(c.transcript, pensees) : [];

    console.log(`  pensees.length = ${pensees.length}`);
    pensees.forEach((p, i) => {
      console.log(`  [${i}] texte    = "${p.texte}"`);
      console.log(`  [${i}] event    = ${JSON.stringify(p.event)}`);
      console.log(`  [${i}] reminder = ${JSON.stringify({ ...p.reminder, recurrence: undefined })}`);
    });
    if (!r.outcome.ok) console.log(`  parseError = ${r.outcome.parseError}`);
    if (flags.length) console.log(`  ⚠️ PERTE POTENTIELLE : ${flags.join(' | ')}`);
    console.log(`  (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${cost?.toFixed(6) ?? 'n/a'})`);

    lines.push(`## Cas ${c.label}`);
    lines.push(`Transcript : "${c.transcript}"\n`);
    if (!r.outcome.ok) {
      lines.push(`- ❌ ok=false — parseError: ${r.outcome.parseError}`);
    } else {
      lines.push(`- ${pensees.length} pensée(s)`);
      pensees.forEach((p, i) => {
        lines.push(`  - Pensée [${i}]`);
        lines.push(`    - texte : \`${p.texte}\``);
        lines.push(`    - event : \`${JSON.stringify(p.event)}\``);
        lines.push(`    - reminder (sans recurrence) : \`${JSON.stringify({ ...p.reminder, recurrence: undefined })}\``);
      });
      lines.push(`- Vérification perte d'information : ${flags.length ? `⚠️ ${flags.join(' ; ')}` : '✅ aucune perte détectée par l\'heuristique (à confirmer manuellement ci-dessous)'}`);
    }
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${cost !== null ? `$${cost.toFixed(6)}` : 'n/a'}`);
    lines.push('- Jugement manuel : ');
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Coût total estimé : $${totalCost.toFixed(6)}`);
  lines.push('- Cas 4/5 particulièrement importants : vérifier que "lundi" (entretien de Yohan) reste représenté (soit dans une 2e pensée avec son propre event.date, soit conservé dans le texte de la même pensée si non extrait séparément) — jamais silencieusement perdu.');
  lines.push('- Cas 8 (x3) : vérifier la stabilité de la conservation de "samedi" dans texte face à l\'ambiguïté rappel/événement.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-texte-concis-events.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-capture-texte-concis-events.report.md`);
  console.log(`Coût total estimé : $${totalCost.toFixed(6)}`);
}

await run();
