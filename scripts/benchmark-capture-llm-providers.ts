// Benchmark Anthropic vs OpenAI pour l'extraction LLM de Capture Intelligente — CHANTIER
// "comparer GPT-5 nano (puis GPT-5 mini) à Claude avant de changer la production". Script Deno
// autonome : il réutilise le MÊME prompt (buildExtractionPrompt) et la MÊME validation
// (validateLlmOutput) que l'Edge Function réelle, mais appelle chaque fournisseur directement (pas
// via getLlmProvider) afin de capturer aussi latence + tokens + coût réel, que l'interface
// LlmProvider ne renvoie pas.
//
// Ne modifie ni ne remplace rien en production — lecture seule sur le pipeline réel, écrit
// uniquement un rapport dans scripts/benchmark-capture-llm-providers.report.md.
//
// Prérequis : ANTHROPIC_API_KEY et/ou OPENAI_API_KEY dans l'environnement (les fournisseurs sans
// clé sont sautés, pas une erreur fatale — le rapport le signale).
//
// Usage :
//   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-llm-providers.ts
//
// Modèles testés (ajustables par env) : ANTHROPIC_MODEL, OPENAI_NANO_MODEL, OPENAI_MINI_MODEL.
// Les deux entrées OpenAI passent par le MÊME adaptateur (buildOpenaiRequestBody, openai.ts) — seul
// le nom de modèle change ; le prompt GPT-5 nano V2 (figé) n'est donc pas touché par cet ajout.

import { buildExtractionPrompt } from '../supabase/functions/capture/providers/llm/prompt.ts';
import { buildOpenaiRequestBody } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext, ExtractedPensee } from '../supabase/functions/_shared/captureContract.ts';

const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5';
const OPENAI_NANO_MODEL = Deno.env.get('OPENAI_NANO_MODEL') ?? Deno.env.get('OPENAI_MODEL') ?? 'gpt-5-nano';
const OPENAI_MINI_MODEL = Deno.env.get('OPENAI_MINI_MODEL') ?? 'gpt-5-mini';
// Doit rester en phase avec le défaut réel appliqué par buildOpenaiRequestBody (openai.ts) — sinon
// le rapport affiche un effort différent de celui réellement envoyé à l'API. Partagé par nano et
// mini (même variable d'env) : on démarre mini avec le même "low" que nano, sauf si une future
// mesure montre une incompatibilité/besoin réel de différencier.
const OPENAI_REASONING_EFFORT = Deno.env.get('OPENAI_REASONING_EFFORT') ?? 'low';

// Résultats des runs de référence — chiffres MESURÉS lors de runs précédents, pas recalculés ici.
const BASELINE_NANO_V1 = { score: 3, totalCases: 10, latencyMs: 1536, costUsd: 0.000096 }; // sans renfort, reasoning_effort=minimal
const BASELINE_NANO_V2 = { score: 9, totalCases: 10, latencyMs: 4641, costUsd: 0.000404 }; // renfort prompt/schema + reasoning_effort=low — FIGÉ (référence courante)
const BASELINE_CLAUDE = { score: 9, totalCases: 10, latencyMs: 3213, costUsd: 0.008267 };

// Tarifs approximatifs (USD / 1M tokens) — À VÉRIFIER sur les pages tarifaires officielles avant de
// prendre une décision budgétaire : ce script ne fait qu'une estimation d'ordre de grandeur pour
// comparer les fournisseurs entre eux à partir des tokens RÉELLEMENT retournés par chaque API, pas
// un chiffrage contractuel.
const PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 3, output: 15 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5-mini': { input: 0.25, output: 2 },
};

const FIXED_CONTEXT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T10:00:00', // un vendredi fixe, pour que "demain"/"vendredi" soient reproductibles
  weekday: 'vendredi',
};

type Expectation = {
  label: string;
  transcript: string;
  check: (pensees: ExtractedPensee[]) => { ok: boolean; detail: string };
};

const CASES: Expectation[] = [
  {
    label: '1. Simple mémo sans date',
    transcript: 'Micka aime le café',
    check: (p) => {
      const ok = p.length === 1 && !p[0].event.hasDate && !p[0].reminder.hasReminder && p[0].heardContactName === 'Micka';
      return { ok, detail: `pensées=${p.length}, event=${p[0]?.event.hasDate}, reminder=${p[0]?.reminder.hasReminder}, contact=${p[0]?.heardContactName}` };
    },
  },
  {
    label: '2. Rappel avec date+heure',
    transcript: 'Rappelle-moi demain à 18h d’appeler Micka',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === true && r.date === '2026-09-19' && r.time === '18:00';
      return { ok, detail: `reminder=${JSON.stringify(r)}` };
    },
  },
  {
    label: '3. Deux infos à splitter (goût + rappel)',
    transcript: 'Micka aime les LEGO et rappelle-moi vendredi à 19h de lui écrire',
    check: (p) => {
      const ok = p.length === 2 && p.some((x) => !x.reminder.hasReminder) && p.some((x) => x.reminder.hasReminder && x.reminder.time === '19:00');
      return { ok, detail: `pensées=${p.length}, reminders=${JSON.stringify(p.map((x) => x.reminder))}` };
    },
  },
  {
    label: '4. Event simple (entretien)',
    transcript: 'Sofia a un entretien vendredi',
    check: (p) => {
      const ok = p.length === 1 && p[0].event.hasDate && p[0].event.date === '2026-09-18' && !p[0].reminder.hasReminder;
      return { ok, detail: `event=${JSON.stringify(p[0]?.event)}` };
    },
  },
  {
    label: '5. Cadeau à faire (pas de date)',
    transcript: 'Pense à acheter un cadeau à Yohan',
    check: (p) => {
      const ok = p.length === 1 && p[0].heardContactName === 'Yohan' && !p[0].event.hasDate;
      return { ok, detail: `contact=${p[0]?.heardContactName}, event=${p[0]?.event.hasDate}` };
    },
  },
  {
    label: '6. Rappel SANS heure/date dite — ne jamais inventer 09:00',
    transcript: 'Rappelle-moi d’appeler Léa',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === true && r.time === null;
      return { ok, detail: `reminder=${JSON.stringify(r)} (time doit rester null, surtout PAS "09:00")` };
    },
  },
  {
    label: '7. Rappel avec date relative + heure ("demain")',
    transcript: 'Appeler Mickael à 8h demain',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === true && r.date === '2026-09-19' && r.time === '08:00';
      return { ok, detail: `reminder=${JSON.stringify(r)}` };
    },
  },
  {
    label: '8. Plusieurs infos distinctes à splitter',
    transcript: 'Micka aime le café, Sofia a un entretien vendredi, et rappelle-moi d’appeler Léa demain à 10h',
    check: (p) => {
      const ok = p.length >= 3;
      return { ok, detail: `pensées=${p.length} (attendu >= 3)` };
    },
  },
  {
    label: '9. Date sans reminder',
    transcript: 'Le mariage de Sofia est le 20 septembre',
    check: (p) => {
      const ok = p.length === 1 && p[0].event.hasDate && !p[0].reminder.hasReminder;
      return { ok, detail: `event=${JSON.stringify(p[0]?.event)}, reminder=${JSON.stringify(p[0]?.reminder)}` };
    },
  },
  {
    label: '10. Reminder + date + heure explicites',
    transcript: 'Rappelle-moi le 25 septembre à 14h30 d’envoyer le colis à Yohan',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === true && r.date === '2026-09-25' && r.time === '14:30' && p[0].heardContactName === 'Yohan';
      return { ok, detail: `reminder=${JSON.stringify(r)}, contact=${p[0]?.heardContactName}` };
    },
  },
];

type CallResult = {
  outcome: ValidationOutcome;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

const MISSING_KEY: (message: string) => CallResult = (message) => ({
  outcome: { ok: false, parseError: message },
  latencyMs: 0,
  inputTokens: null,
  outputTokens: null,
  error: 'clé absente',
});

async function callAnthropic(transcript: string): Promise<CallResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return MISSING_KEY('ANTHROPIC_API_KEY absent');
  const start = performance.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: buildExtractionPrompt(transcript, FIXED_CONTEXT) }],
      }),
    });
    const latencyMs = performance.now() - start;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { outcome: { ok: false, parseError: `HTTP ${response.status}: ${body}` }, latencyMs, inputTokens: null, outputTokens: null, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number } };
    const textBlock = data.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
    let parsed: unknown = null;
    if (textBlock?.text) {
      const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = null;
      }
    }
    return {
      outcome: validateLlmOutput(parsed),
      latencyMs,
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null,
      error: null,
    };
  } catch (e) {
    return { outcome: { ok: false, parseError: String(e) }, latencyMs: performance.now() - start, inputTokens: null, outputTokens: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Générique pour TOUT modèle OpenAI compatible Structured Outputs (gpt-5-nano, gpt-5-mini, ...) —
 *  UN SEUL point d'appel, réutilisé pour nano et mini, via le MÊME buildOpenaiRequestBody que le
 *  vrai provider (openai.ts). Aucune divergence possible entre ce qui est mesuré ici et ce qui
 *  tourne en production ; le prompt/renfort GPT-5 nano V2 (figé) n'est donc jamais dupliqué. */
async function callOpenaiModel(transcript: string, model: string): Promise<CallResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return MISSING_KEY('OPENAI_API_KEY absent');
  const start = performance.now();
  try {
    const body = buildOpenaiRequestBody(transcript, FIXED_CONTEXT, model);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const latencyMs = performance.now() - start;
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return { outcome: { ok: false, parseError: `HTTP ${response.status}: ${errBody}` }, latencyMs, inputTokens: null, outputTokens: null, error: `HTTP ${response.status}` };
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
    return {
      outcome: validateLlmOutput(parsed),
      latencyMs,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      error: null,
    };
  } catch (e) {
    return { outcome: { ok: false, parseError: String(e) }, latencyMs: performance.now() - start, inputTokens: null, outputTokens: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const pricing = PRICING_USD_PER_1M[model];
  if (!pricing || inputTokens === null || outputTokens === null) return null;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// Trois fournisseurs comparés, chacun avec son libellé d'affichage, son modèle (pour le coût) et sa
// fonction d'appel — ajouter un 4e fournisseur au benchmark n'exige que d'ajouter une entrée ici.
type ProviderKey = 'claude' | 'nano' | 'mini';
const PROVIDERS: { key: ProviderKey; label: string; model: string; call: (transcript: string) => Promise<CallResult> }[] = [
  { key: 'claude', label: 'Claude', model: ANTHROPIC_MODEL, call: callAnthropic },
  { key: 'nano', label: 'GPT-5 nano', model: OPENAI_NANO_MODEL, call: (t) => callOpenaiModel(t, OPENAI_NANO_MODEL) },
  { key: 'mini', label: 'GPT-5 mini', model: OPENAI_MINI_MODEL, call: (t) => callOpenaiModel(t, OPENAI_MINI_MODEL) },
];

type Row = { label: string; results: Record<ProviderKey, CallResult & { passed: boolean; detail: string }> };

async function run() {
  const rows: Row[] = [];
  for (const testCase of CASES) {
    console.log(`\n--- ${testCase.label} ---`);
    const outcomes = await Promise.all(PROVIDERS.map((p) => p.call(testCase.transcript)));

    const results = {} as Row['results'];
    PROVIDERS.forEach((p, i) => {
      const result = outcomes[i];
      const pensees = result.outcome.ok ? result.outcome.pensees : [];
      const check = result.outcome.ok ? testCase.check(pensees) : { ok: false, detail: result.outcome.parseError };
      results[p.key] = { ...result, passed: check.ok, detail: check.detail };
      console.log(
        `  ${p.label} (${p.model}): ${check.ok ? 'OK' : 'FAIL'} — ${check.detail} (${result.latencyMs.toFixed(0)}ms, in=${result.inputTokens}, out=${result.outputTokens})`,
      );
    });

    rows.push({ label: testCase.label, results });
  }

  const scoreOf = (key: ProviderKey) => rows.filter((r) => r.results[key].passed).length;
  const criticalErrorsOf = (key: ProviderKey) =>
    rows.filter((r) => !r.results[key].passed && r.results[key].error !== null).map((r) => `${r.label} → ${r.results[key].error}`);
  const avgLatency = (key: ProviderKey) => rows.reduce((s, r) => s + r.results[key].latencyMs, 0) / rows.length;
  const avgTokens = (key: ProviderKey, field: 'inputTokens' | 'outputTokens') => {
    const vals = rows.map((r) => r.results[key][field]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const avgCost = (key: ProviderKey, model: string) => {
    const costs = rows.map((r) => estimateCostUsd(model, r.results[key].inputTokens, r.results[key].outputTokens)).filter((v): v is number => v !== null);
    return costs.length ? costs.reduce((s, v) => s + v, 0) / costs.length : null;
  };

  const stats = Object.fromEntries(
    PROVIDERS.map((p) => [
      p.key,
      {
        score: scoreOf(p.key),
        latency: avgLatency(p.key),
        inputTokens: avgTokens(p.key, 'inputTokens'),
        outputTokens: avgTokens(p.key, 'outputTokens'),
        cost: avgCost(p.key, p.model),
        criticalErrors: criticalErrorsOf(p.key),
      },
    ]),
  ) as Record<ProviderKey, { score: number; latency: number; inputTokens: number | null; outputTokens: number | null; cost: number | null; criticalErrors: string[] }>;

  const fmtCost = (v: number | null) => (v !== null ? `$${v.toFixed(6)}` : 'n/a');
  const fmtRatio = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? `${(a / b).toFixed(2)}x` : 'n/a');

  const lines: string[] = [];
  lines.push('# Benchmark Capture — Claude vs GPT-5 nano vs GPT-5 mini\n');
  lines.push(
    `Modèles : Anthropic=\`${ANTHROPIC_MODEL}\`, GPT-5 nano=\`${OPENAI_NANO_MODEL}\`, GPT-5 mini=\`${OPENAI_MINI_MODEL}\` (reasoning_effort=\`${OPENAI_REASONING_EFFORT}\` pour les deux). Contexte temporel fixe : ${FIXED_CONTEXT.localDateTime} (${FIXED_CONTEXT.weekday}, ${FIXED_CONTEXT.timezone}).\n`,
  );

  lines.push('| Cas | Claude OK ? | GPT-5 nano OK ? | GPT-5 mini OK ? | Différence |');
  lines.push('|---|---|---|---|---|');
  for (const r of rows) {
    const { claude, nano, mini } = r.results;
    const allSame = claude.passed === nano.passed && nano.passed === mini.passed;
    const diff = allSame ? '—' : `Claude: ${claude.detail} / Nano: ${nano.detail} / Mini: ${mini.detail}`;
    lines.push(`| ${r.label} | ${claude.passed ? '✅' : '❌'} | ${nano.passed ? '✅' : '❌'} | ${mini.passed ? '✅' : '❌'} | ${diff} |`);
  }

  lines.push('');
  lines.push('## Scores');
  lines.push('');
  lines.push(`- Score Claude : ${stats.claude.score}/${rows.length}`);
  lines.push(`- Score GPT-5 nano : ${stats.nano.score}/${rows.length}`);
  lines.push(`- Score GPT-5 mini : ${stats.mini.score}/${rows.length}`);

  lines.push('');
  lines.push('## Erreurs critiques (échec réseau/API, pas juste une extraction incorrecte)');
  lines.push('');
  for (const p of PROVIDERS) {
    const errs = stats[p.key].criticalErrors;
    lines.push(`- ${p.label} : ${errs.length ? errs.join(' ; ') : 'aucune'}`);
  }

  lines.push('');
  lines.push('## Latence, tokens, coût');
  lines.push('');
  lines.push('| | Latence moy. | Tokens in moy. | Tokens out moy. | Coût moy./capture |');
  lines.push('|---|---|---|---|---|');
  for (const p of PROVIDERS) {
    const s = stats[p.key];
    lines.push(`| ${p.label} | ${s.latency.toFixed(0)}ms | ${s.inputTokens?.toFixed(0) ?? 'n/a'} | ${s.outputTokens?.toFixed(0) ?? 'n/a'} | ${fmtCost(s.cost)} (tarifs approximatifs, à vérifier) |`);
  }

  lines.push('');
  lines.push('## Projection 1 000 captures (coût réel mesuré × 1000)');
  lines.push('');
  for (const p of PROVIDERS) {
    const s = stats[p.key];
    lines.push(`- ${p.label} : ${s.cost !== null ? `$${(s.cost * 1000).toFixed(2)}` : 'n/a'}`);
  }

  lines.push('');
  lines.push('## Ratios de coût');
  lines.push('');
  lines.push(`- Mini / Nano : ${fmtRatio(stats.mini.cost, stats.nano.cost)}`);
  lines.push(`- Mini / Claude : ${fmtRatio(stats.mini.cost, stats.claude.cost)}`);

  lines.push('');
  lines.push('## Comparaison avec les runs de référence');
  lines.push('');
  lines.push('| | Score | Latence moy. | Coût moy./capture |');
  lines.push('|---|---|---|---|');
  lines.push(`| GPT-5 nano — 1er passage (sans renfort, \`minimal\`) | ${BASELINE_NANO_V1.score}/${BASELINE_NANO_V1.totalCases} | ${BASELINE_NANO_V1.latencyMs}ms | $${BASELINE_NANO_V1.costUsd} |`);
  lines.push(`| GPT-5 nano — référence figée (\`low\`) | ${BASELINE_NANO_V2.score}/${BASELINE_NANO_V2.totalCases} | ${BASELINE_NANO_V2.latencyMs}ms | $${BASELINE_NANO_V2.costUsd} |`);
  lines.push(`| GPT-5 nano — ce run (\`${OPENAI_REASONING_EFFORT}\`) | ${stats.nano.score}/${rows.length} | ${stats.nano.latency.toFixed(0)}ms | ${fmtCost(stats.nano.cost)} |`);
  lines.push(`| GPT-5 mini — ce run (\`${OPENAI_REASONING_EFFORT}\`) | ${stats.mini.score}/${rows.length} | ${stats.mini.latency.toFixed(0)}ms | ${fmtCost(stats.mini.cost)} |`);
  lines.push(`| Claude (référence) | ${BASELINE_CLAUDE.score}/${BASELINE_CLAUDE.totalCases} | ${BASELINE_CLAUDE.latencyMs}ms | $${BASELINE_CLAUDE.costUsd} |`);

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-llm-providers.report.md', report);
  console.log(`\n${report}`);
  console.log('\nRapport écrit dans scripts/benchmark-capture-llm-providers.report.md');
}

await run();
