// Benchmark OBSERVATIONNEL — isolation des deux angles morts suspectés dans le prompt Capture v13 :
// (a) l'ancrage lexical "tous les jours de la semaine" → frequency:"unclear" (un seul exemple
// travaillé dans le prompt, potentiellement sur-généralisé même quand une clause de désambiguïsation
// suit), et (b) "à partir de" appliqué à une HEURE plutôt qu'à une DATE (le prompt ne couvre "à
// partir de" que pour des dates — "à partir de demain"). Objectif : établir si la formulation réelle
// "cachets" (rapportée en échec iPhone) est due à l'un, l'autre, ou la combinaison des deux — sans
// modifier le prompt. Réutilise EXACTEMENT buildOpenaiRequestBody/validateLlmOutput du Capture v13
// déployé.
//
// Ne modifie ni ne déploie rien — écrit uniquement un rapport dans
// scripts/benchmark-capture-recurrence-ambiguity-isolation.report.md.
//
// Usage :
//   OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-recurrence-ambiguity-isolation.ts
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

// case4 répété 3x pour observer la stabilité — labels distincts pour le rapport.
const CASES: { label: string; transcript: string }[] = [
  { label: '1 — "du lundi au vendredi, à 8h" (retire "à partir de", garde l\'ancrage lexical)', transcript: 'Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à 8h.' },
  { label: '2 — "à partir de 8h" isolé (retire l\'ancrage lexical)', transcript: 'Rappelle-moi de prendre mes cachets du lundi au vendredi, à partir de 8h.' },
  { label: '3 — ancrage lexical SEUL, sans désambiguïsation (référence attendue: unclear)', transcript: 'Rappelle-moi de prendre mes cachets tous les jours de la semaine, à partir de 8h.' },
  { label: '4a — phrase complète originale (run 1/3)', transcript: 'Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h.' },
  { label: '4b — phrase complète originale (run 2/3)', transcript: 'Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h.' },
  { label: '4c — phrase complète originale (run 3/3)', transcript: 'Rappelle-moi de prendre mes cachets tous les jours de la semaine, du lundi au vendredi, à partir de 8h.' },
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
  lines.push('# Benchmark observationnel — isolation "tous les jours de la semaine" / "à partir de + heure" (Capture v13)\n');
  lines.push(`Modèle : \`${MINI_MODEL}\` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00.\n`);
  lines.push('Aucun prompt modifié. Rapport brut, pas de jugement PASS/FAIL.\n');

  let totalCost = 0;
  for (const c of CASES) {
    console.log(`\n=== Cas ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}"`);
    const r = await callMini(c.transcript);
    const pensees = r.outcome.ok ? r.outcome.pensees : [];
    const p0 = pensees[0];
    const cost = estimateCostUsd(r.inputTokens, r.outputTokens);
    if (cost !== null) totalCost += cost;

    if (!r.outcome.ok) {
      console.log(`  parseError = ${r.outcome.parseError}`);
    } else if (p0) {
      console.log(`  hasReminder = ${p0.reminder.hasReminder}`);
      console.log(`  date        = ${p0.reminder.date}`);
      console.log(`  time        = ${p0.reminder.time}`);
      console.log(`  recurrence  = ${JSON.stringify(p0.reminder.recurrence)}`);
      console.log(`  confidence  = ${p0.reminder.confidence}`);
      console.log(`  texte       = "${p0.texte}"`);
    }
    console.log(`  (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${cost?.toFixed(6) ?? 'n/a'})`);

    lines.push(`## Cas ${c.label}`);
    lines.push(`Transcript : "${c.transcript}"\n`);
    if (!r.outcome.ok) {
      lines.push(`- validateLlmOutput : ❌ ok=false — parseError: ${r.outcome.parseError}`);
    } else if (!p0) {
      lines.push('- Aucune pensée extraite (pensees.length === 0)');
    } else {
      lines.push(`- reminder.hasReminder : \`${p0.reminder.hasReminder}\``);
      lines.push(`- reminder.date : \`${p0.reminder.date}\``);
      lines.push(`- reminder.time : \`${p0.reminder.time}\``);
      lines.push(`- reminder.recurrence : \`${JSON.stringify(p0.reminder.recurrence)}\``);
      lines.push(`- reminder.recurrence.heardExpression : \`${p0.reminder.recurrence?.heardExpression ?? 'n/a'}\``);
      lines.push(`- reminder.confidence : \`${p0.reminder.confidence}\``);
      lines.push(`- texte : \`${p0.texte}\``);
      if (pensees.length > 1) lines.push(`- ⚠️ pensees.length = ${pensees.length} (plusieurs entrées retournées — vérifier un éventuel split inattendu)`);
    }
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${cost !== null ? `$${cost.toFixed(6)}` : 'n/a'}`);
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Coût total estimé : $${totalCost.toFixed(6)}`);
  lines.push('- Comparer cas 1 vs 3 pour juger si "du lundi au vendredi" désambiguïse "tous les jours de la semaine".');
  lines.push('- Comparer cas 1 vs 2 pour isoler l\'effet de "à partir de" sur l\'heure seule (recurrence identique attendue si l\'hypothèse ancrage-lexical est correcte, temps potentiellement différent).');
  lines.push('- Comparer 4a/4b/4c pour la stabilité du cas combiné réel.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-recurrence-ambiguity-isolation.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-capture-recurrence-ambiguity-isolation.report.md`);
  console.log(`Coût total estimé : $${totalCost.toFixed(6)}`);
}

await run();
