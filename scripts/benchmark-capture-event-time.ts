// Benchmark OBSERVATIONNEL — CHANTIER CAPTURE, EVENT TIME incrément 1 (2026-09-18). Vérifie que
// event.time est extrait/validé de bout en bout (prompt + schéma OpenAI + validate.ts) sans jamais
// être copié depuis/vers reminder.time. Réutilise EXACTEMENT buildOpenaiRequestBody/validateLlmOutput
// — même modèle/reasoning_effort/pipeline que Capture (non déployé au moment de ce run).
//
// Ne modifie ni ne déploie rien — écrit uniquement un rapport dans
// scripts/benchmark-capture-event-time.report.md.
//
// Usage :
//   OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-event-time.ts
//
// Modèle ajustable par env : OPENAI_MINI_MODEL (défaut gpt-5-mini).

import { buildOpenaiRequestBody } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext } from '../supabase/functions/_shared/captureContract.ts';

const MINI_MODEL = Deno.env.get('OPENAI_MINI_MODEL') ?? 'gpt-5-mini';
const PRICING_USD_PER_1M = { input: 0.25, output: 2 }; // gpt-5-mini — à vérifier sur la page tarifaire officielle avant toute décision budgétaire

const FIXED_CONTEXT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T10:00:00', // vendredi
  weekday: 'vendredi',
};

const CASES: { label: string; transcript: string }[] = [
  { label: '1', transcript: 'Concert à Lyon le 7 mars 2027 à 20h.' },
  { label: '2', transcript: 'Sofia a un entretien vendredi.' },
  { label: '3', transcript: 'J\'ai un concert vendredi à 20h. Rappelle-moi la veille.' },
  { label: '4', transcript: 'J\'ai un concert vendredi à 20h. Rappelle-moi la veille à 18h.' },
  { label: '5', transcript: 'Rappelle-moi vendredi à 18h d\'appeler Yohan.' },
  { label: '6', transcript: 'Dîner avec Yohan vendredi à 19h pour parler de son entretien lundi.' },
  { label: '7 (cas critique — 2 heures distinctes)', transcript: 'Train samedi à 7h12, rappelle-moi vendredi à 20h de préparer ma valise.' },
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

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark — event.time bout en bout (CHANTIER CAPTURE EVENT TIME, incrément 1, non déployé)\n');
  lines.push(`Modèle : \`${MINI_MODEL}\`. Contexte fixe : vendredi 2026-09-18 10:00, "vendredi" = aujourd'hui, "samedi" = 2026-09-19.\n`);

  let totalCost = 0;
  for (const c of CASES) {
    console.log(`\n=== Cas ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}"`);
    const r = await callMini(c.transcript);
    const pensees = r.outcome.ok ? r.outcome.pensees : [];
    const cost = estimateCostUsd(r.inputTokens, r.outputTokens);
    if (cost !== null) totalCost += cost;

    console.log(`  pensees.length = ${pensees.length}`);
    pensees.forEach((p, i) => {
      console.log(`  [${i}] texte        = "${p.texte}"`);
      console.log(`  [${i}] event.date   = ${p.event.date}  event.time = ${p.event.time}`);
      console.log(`  [${i}] reminder.date= ${p.reminder.date}  reminder.time = ${p.reminder.time}`);
    });
    if (!r.outcome.ok) console.log(`  parseError = ${r.outcome.parseError}`);
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
    }
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${cost !== null ? `$${cost.toFixed(6)}` : 'n/a'}`);
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Coût total estimé : $${totalCost.toFixed(6)}`);
  lines.push('- Cas 7 particulièrement important : event.time attendu = "07:12" (train), reminder.time attendu = "20:00" (rappel) — deux heures distinctes dans la même dictée, jamais interverties ni confondues.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-event-time.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-capture-event-time.report.md`);
  console.log(`Coût total estimé : $${totalCost.toFixed(6)}`);
}

await run();
