// Benchmark OBSERVATIONNEL FORENSIQUE — origine exacte de l'heure "15:00" rapportée sur iPhone pour
// un rappel "la veille" d'un événement daté+heuré (2026-09-18). Réutilise EXACTEMENT
// buildOpenaiRequestBody/validateLlmOutput du Capture v14 déployé — même modèle, même
// reasoning_effort, même prompt, AUCUNE modification. Contrairement aux benchmarks précédents, ce
// script conserve et rapporte la sortie BRUTE du LLM (avant validateLlmOutput) EN PLUS de la sortie
// validée, pour pouvoir distinguer une valeur réellement renvoyée par le modèle d'une éventuelle
// transformation de validate.ts.
//
// Objectif : déterminer si une heure de rappel non prononcée est inventée par le LLM, et si oui, si
// elle correspond à l'heure du contexte temporel fourni (context.localDateTime, ici fixé à 15:00
// délibérément pour ce test) — hypothèse la plus probable d'après l'audit (aucun fallback client ne
// produit 15:00, voir CaptureScreen.tsx/reminderPickerSeed, défaut 9h00).
//
// Ne modifie ni ne déploie rien — écrit uniquement un rapport dans
// scripts/benchmark-capture-event-reminder-veille.report.md.
//
// Usage :
//   OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-event-reminder-veille.ts
//
// Modèle ajustable par env : OPENAI_MINI_MODEL (défaut gpt-5-mini).

import { buildOpenaiRequestBody } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext } from '../supabase/functions/_shared/captureContract.ts';

const MINI_MODEL = Deno.env.get('OPENAI_MINI_MODEL') ?? 'gpt-5-mini';
const PRICING_USD_PER_1M = { input: 0.25, output: 2 }; // gpt-5-mini — à vérifier sur la page tarifaire officielle avant toute décision budgétaire

// Contexte FIXÉ délibérément à 15h00 — reproduit l'heure rapportée sur iPhone pour tester l'hypothèse
// "le LLM recopie l'heure actuelle du contexte" (mode d'échec déjà documenté historiquement pour ce
// prompt, voir openai.ts, en-tête PASSE D'OPTIMISATION GPT-5 NANO).
const FIXED_CONTEXT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T15:00:00', // vendredi, 15h00 — cf. objectif 2 du benchmark
  weekday: 'vendredi',
};

// case1/case2 répétés 3x chacun pour mesurer la stabilité (demandé explicitement).
const CASES: { label: string; transcript: string }[] = [
  { label: '1a (run 1/3)', transcript: "J'ai un concert le 10 février 2027 à 20h30. Rappelle-moi la veille." },
  { label: '1b (run 2/3)', transcript: "J'ai un concert le 10 février 2027 à 20h30. Rappelle-moi la veille." },
  { label: '1c (run 3/3)', transcript: "J'ai un concert le 10 février 2027 à 20h30. Rappelle-moi la veille." },
  { label: '2a (run 1/3)', transcript: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Je veux un rappel la veille.' },
  { label: '2b (run 2/3)', transcript: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Je veux un rappel la veille.' },
  { label: '2c (run 3/3)', transcript: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Je veux un rappel la veille.' },
  { label: '3 (heure explicite 18h — contrôle)', transcript: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30. Rappelle-moi la veille à 18h.' },
  { label: '4 (sans rappel — contrôle)', transcript: 'Concert de Claire Obscure Expédition 33 à Clermont-Ferrand le 10 février 2027 à 20h30.' },
];

type RawCallResult = {
  rawContent: string | null;
  rawParsed: unknown;
  outcome: ValidationOutcome;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  httpError: string | null;
};

async function callMini(transcript: string): Promise<RawCallResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return { rawContent: null, rawParsed: null, outcome: { ok: false, parseError: 'OPENAI_API_KEY absent' }, latencyMs: 0, inputTokens: null, outputTokens: null, httpError: 'clé absente' };
  }
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
      return { rawContent: null, rawParsed: null, outcome: { ok: false, parseError: `HTTP ${response.status}: ${errBody}` }, latencyMs, inputTokens: null, outputTokens: null, httpError: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const content = data.choices?.[0]?.message?.content ?? null;
    let parsed: unknown = null;
    if (content) {
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = null;
      }
    }
    return {
      rawContent: content,
      rawParsed: parsed,
      outcome: validateLlmOutput(parsed),
      latencyMs,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      httpError: null,
    };
  } catch (e) {
    return { rawContent: null, rawParsed: null, outcome: { ok: false, parseError: String(e) }, latencyMs: performance.now() - start, inputTokens: null, outputTokens: null, httpError: e instanceof Error ? e.message : String(e) };
  }
}

function estimateCostUsd(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  return (inputTokens / 1_000_000) * PRICING_USD_PER_1M.input + (outputTokens / 1_000_000) * PRICING_USD_PER_1M.output;
}

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark forensique — origine de l\'heure de rappel "15:00" (événement + "la veille", Capture v14)\n');
  lines.push(`Modèle : \`${MINI_MODEL}\` (production actuelle de Capture, AUCUN prompt/contrat modifié). Contexte fixé : \`${FIXED_CONTEXT.localDateTime}\` (${FIXED_CONTEXT.weekday}, ${FIXED_CONTEXT.timezone}) — 15h00 choisi délibérément pour tester l'hypothèse "recopie de l'heure du contexte".\n`);
  lines.push('Aucune correction appliquée aux résultats. Rapport brut (LLM avant validation + après validateLlmOutput).\n');

  let totalCost = 0;
  for (const c of CASES) {
    console.log(`\n=== Cas ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}"`);
    const r = await callMini(c.transcript);
    const cost = estimateCostUsd(r.inputTokens, r.outputTokens);
    if (cost !== null) totalCost += cost;

    console.log(`  --- BRUT (avant validateLlmOutput) ---`);
    console.log(`  ${JSON.stringify(r.rawParsed)}`);
    console.log(`  --- APRÈS validateLlmOutput ---`);
    if (r.outcome.ok) {
      r.outcome.pensees.forEach((p, i) => {
        console.log(`  [${i}] texte      = "${p.texte}"`);
        console.log(`  [${i}] event      = ${JSON.stringify(p.event)}`);
        console.log(`  [${i}] reminder   = ${JSON.stringify(p.reminder)}`);
      });
    } else {
      console.log(`  parseError = ${r.outcome.parseError}`);
    }
    console.log(`  (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${cost?.toFixed(6) ?? 'n/a'})`);

    lines.push(`## Cas ${c.label}`);
    lines.push(`Transcript : "${c.transcript}"\n`);
    lines.push('**Sortie BRUTE (avant validateLlmOutput) :**');
    lines.push('```json');
    lines.push(JSON.stringify(r.rawParsed, null, 2) ?? 'null');
    lines.push('```');
    lines.push('');
    lines.push('**Sortie APRÈS validateLlmOutput :**');
    if (!r.outcome.ok) {
      lines.push(`- ❌ ok=false — parseError: ${r.outcome.parseError}`);
    } else {
      lines.push(`- ok=true, ${r.outcome.pensees.length} pensée(s)`);
      r.outcome.pensees.forEach((p, i) => {
        lines.push(`  - Pensée [${i}]`);
        lines.push(`    - texte : \`${p.texte}\``);
        lines.push(`    - event : \`${JSON.stringify(p.event)}\``);
        lines.push(`    - reminder : \`${JSON.stringify(p.reminder)}\``);
        lines.push(`    - reminder.date : \`${p.reminder.date}\` · reminder.time : \`${p.reminder.time}\` · reminder.heardExpression : \`${p.reminder.heardExpression}\` · reminder.confidence : \`${p.reminder.confidence}\``);
      });
    }
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${cost !== null ? `$${cost.toFixed(6)}` : 'n/a'}`);
    lines.push('');
  }

  lines.push('## Synthèse factuelle');
  lines.push('');
  lines.push(`- Coût total estimé : $${totalCost.toFixed(6)}`);
  lines.push('- Contexte utilisé pour TOUS les runs : `' + FIXED_CONTEXT.localDateTime + '`.');
  lines.push('- Comparer 1a/1b/1c et 2a/2b/2c pour la stabilité de reminder.date/time sur "la veille" sans heure explicite.');
  lines.push('- Si reminder.time == "15:00" sur les cas 1/2 → confirme la recopie du contexte (hypothèse de l\'audit). Si reminder.time == null → confirme l\'application correcte de la règle "jamais d\'heure par défaut", et l\'observation iPhone aurait une autre origine (à ré-auditer ailleurs).');
  lines.push('- Cas 3 : reminder.time attendu = "18:00" (heure explicitement dite) — vérifie que l\'heure dite n\'est jamais écrasée par le contexte.');
  lines.push('- Cas 4 : reminder.hasReminder attendu = false, event.hasDate=true, event.date="2027-02-10" — vérifie qu\'aucune heure de rappel n\'apparaît sans demande de rappel, et que "20h30" reste uniquement dans `texte`/`event.heardExpression` faute de `event.time` structuré (voir audit précédent).');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-event-reminder-veille.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-capture-event-reminder-veille.report.md`);
  console.log(`Coût total estimé : $${totalCost.toFixed(6)}`);
}

await run();
