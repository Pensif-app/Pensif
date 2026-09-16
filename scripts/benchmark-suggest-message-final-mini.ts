// Benchmark FINAL — GPT-5 mini seul — CHANTIER RÉPONSES INTELLIGENTES (2026-09-16). Candidat retenu
// après le run diagnostic (voir scripts/benchmark-suggest-message-llm-models.ts) : GPT-5 mini,
// reasoning_effort=low, max_completion_tokens=1200 — ce sont maintenant les valeurs de PRODUCTION
// (providers/llm/openai.ts), donc ce script appelle `buildOpenaiRequestBody` SANS AUCUN override :
// c'est un test à l'identique de ce qui tournera réellement, avec le prompt durci (2 règles : sélection
// du contexte, interdiction d'inventer une action/un état).
//
// MÊMES 18 cas que le run diagnostic (import direct de benchmark-suggest-message-corpus.ts, pas une
// copie) — comparaison directe possible entre le benchmark A (400 tokens, ancien prompt) et ce run
// final (1200 tokens, prompt durci) sur les mêmes cas exacts.
//
// Ne modifie ni ne déploie rien — lecture seule sur le pipeline réel, écrit uniquement un rapport
// dans scripts/benchmark-suggest-message-final-mini.report.md. Ne touche à aucun fichier de Capture.
//
// PAS ENCORE EXÉCUTÉ — préparé pour validation avant tout déploiement, sur accord explicite.
//
// Usage :
//   SUGGEST_MESSAGE_OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-suggest-message-final-mini.ts
//
// Modèle ajustable par env (défaut gpt-5-mini, le candidat retenu) : SUGGEST_MESSAGE_MINI_MODEL.

import { buildOpenaiRequestBody } from '../supabase/functions/suggest-message/providers/llm/openai.ts';
import { validateLlmOutput } from '../supabase/functions/suggest-message/validate.ts';
import { CASES } from './benchmark-suggest-message-corpus.ts';

const MINI_MODEL = Deno.env.get('SUGGEST_MESSAGE_MINI_MODEL') ?? 'gpt-5-mini';

// Tarif approximatif (USD / 1M tokens) — À VÉRIFIER sur la page tarifaire officielle avant toute
// décision budgétaire, simple ordre de grandeur à partir des tokens réellement retournés.
const PRICING_USD_PER_1M = { input: 0.25, output: 2 };

const FORBIDDEN_TERMS = ['pensif', 'quiz', 'pensée enregistrée', 'pensées enregistrées', 'contexte fourni', 'assistant'];

function detectForbiddenMentions(message: string): string[] {
  const lower = message.toLowerCase();
  return FORBIDDEN_TERMS.filter((term) => lower.includes(term));
}

type CallResult = {
  message: string | null;
  jsonValid: boolean;
  parseError: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  forbiddenMentions: string[];
  httpError: string | null;
  finishReason: string | null;
  reasoningTokens: number | null;
  visibleOutputTokens: number | null;
  budgetExhausted: boolean;
};

function estimateCostUsd(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  return (inputTokens / 1_000_000) * PRICING_USD_PER_1M.input + (outputTokens / 1_000_000) * PRICING_USD_PER_1M.output;
}

async function callMini(c: (typeof CASES)[number]): Promise<CallResult> {
  const apiKey = Deno.env.get('SUGGEST_MESSAGE_OPENAI_API_KEY');
  const empty: CallResult = {
    message: null,
    jsonValid: false,
    parseError: null,
    latencyMs: 0,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    forbiddenMentions: [],
    httpError: null,
    finishReason: null,
    reasoningTokens: null,
    visibleOutputTokens: null,
    budgetExhausted: false,
  };
  if (!apiKey) return { ...empty, httpError: 'SUGGEST_MESSAGE_OPENAI_API_KEY absent' };

  const start = performance.now();
  try {
    // AUCUN override — mêmes valeurs que providers/llm/openai.ts en production (reasoning_effort=low
    // par défaut, max_completion_tokens=1200), prompt durci inclus (buildSystemPrompt/buildUserPrompt).
    const body = buildOpenaiRequestBody(c.context, c.tone, MINI_MODEL);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const latencyMs = performance.now() - start;
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return { ...empty, latencyMs, httpError: `HTTP ${response.status}: ${errBody}` };
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: { prompt_tokens: number; completion_tokens: number; completion_tokens_details?: { reasoning_tokens?: number } };
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
    const outcome = validateLlmOutput(parsed);
    const inputTokens = data.usage?.prompt_tokens ?? null;
    const outputTokens = data.usage?.completion_tokens ?? null;
    const finishReason = data.choices?.[0]?.finish_reason ?? null;
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
    const visibleOutputTokens = outputTokens !== null && reasoningTokens !== null ? outputTokens - reasoningTokens : null;
    return {
      message: outcome.ok ? outcome.message : null,
      jsonValid: outcome.ok,
      parseError: outcome.ok ? null : outcome.parseError,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(inputTokens, outputTokens),
      forbiddenMentions: outcome.ok ? detectForbiddenMentions(outcome.message) : [],
      httpError: null,
      finishReason,
      reasoningTokens,
      visibleOutputTokens,
      budgetExhausted: finishReason === 'length',
    };
  } catch (e) {
    return { ...empty, latencyMs: performance.now() - start, httpError: e instanceof Error ? e.message : String(e) };
  }
}

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark FINAL — GPT-5 mini seul (candidat retenu) — Réponses intelligentes\n');
  lines.push(
    `Modèle : \`${MINI_MODEL}\`. Valeurs de PRODUCTION, sans override (reasoning_effort=low, max_completion_tokens=1200, prompt durci — 2 règles ajoutées : sélection du contexte / interdiction d'inventer). Mêmes 18 cas que le run diagnostic A/B, import direct du même corpus.\n`,
  );

  const results: CallResult[] = [];
  for (const c of CASES) {
    console.log(`\n=== Cas ${c.id} — ${c.label} (ton: ${c.tone}) ===`);
    const r = await callMini(c);
    results.push(r);
    console.log(
      `  MINI (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${r.costUsd?.toFixed(6) ?? 'n/a'}) : ${r.httpError ?? r.parseError ?? r.message}`,
    );
    console.log(`    diag: finish_reason=${r.finishReason ?? 'n/a'}, reasoning_tokens=${r.reasoningTokens ?? 'n/a'}, visible_tokens≈${r.visibleOutputTokens ?? 'n/a'}${r.budgetExhausted ? ' ⚠️ BUDGET ÉPUISÉ' : ''}`);
    if (r.forbiddenMentions.length) console.log(`    ⚠️ mentions interdites détectées : ${r.forbiddenMentions.join(', ')}`);

    lines.push(`## Cas ${c.id} — ${c.label}`);
    lines.push(`Ton demandé : **${c.tone}**`);
    lines.push('');
    lines.push(`- Message : ${r.httpError ? `❌ erreur réseau/API : ${r.httpError}` : r.parseError ? `❌ JSON invalide : ${r.parseError}` : `"${r.message}"`}`);
    lines.push(`- JSON valide : ${r.jsonValid ? '✅' : '❌'} · Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${r.costUsd !== null ? `$${r.costUsd.toFixed(6)}` : 'n/a'}`);
    lines.push(`- Diagnostic budget : finish_reason=\`${r.finishReason ?? 'n/a'}\`, reasoning_tokens=${r.reasoningTokens ?? 'n/a'}, tokens visibles restants≈${r.visibleOutputTokens ?? 'n/a'}${r.budgetExhausted ? ' — **⚠️ BUDGET ÉPUISÉ**' : ''}`);
    lines.push(`- Mentions interdites détectées : ${r.forbiddenMentions.length ? r.forbiddenMentions.join(', ') : 'aucune'}`);
    lines.push('');
    lines.push('**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile / aucune invention d’action ou d’état :**');
    lines.push('- Mini : ');
    lines.push('');
  }

  const avg = (field: 'latencyMs' | 'inputTokens' | 'outputTokens' | 'costUsd' | 'reasoningTokens' | 'visibleOutputTokens') => {
    const vals = results.map((r) => r[field]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const validCount = results.filter((r) => r.jsonValid).length;
  const exhaustedCount = results.filter((r) => r.budgetExhausted).length;
  const maxReasoning = (() => {
    const vals = results.map((r) => r.reasoningTokens).filter((v): v is number => v !== null);
    return vals.length ? Math.max(...vals) : null;
  })();

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- JSON valides : ${validCount}/${CASES.length}`);
  lines.push(`- Cas ayant atteint la limite de 1200 (finish_reason="length") : ${exhaustedCount}/${CASES.length}`);
  lines.push(`- reasoning_tokens moyen / max : ${avg('reasoningTokens')?.toFixed(0) ?? 'n/a'} / ${maxReasoning ?? 'n/a'}`);
  lines.push(`- tokens visibles moyens : ${avg('visibleOutputTokens')?.toFixed(0) ?? 'n/a'}`);
  lines.push(`- Latence moyenne : ${avg('latencyMs')?.toFixed(0) ?? 'n/a'}ms`);
  lines.push(`- Coût moyen/message : ${avg('costUsd') !== null ? `$${avg('costUsd')!.toFixed(6)}` : 'n/a'}`);
  lines.push(`- Projection 1000 messages : ${avg('costUsd') !== null ? `$${(avg('costUsd')! * 1000).toFixed(2)}` : 'n/a'}`);
  lines.push('');
  lines.push('Fidélité factuelle, naturel, respect du ton, pertinence, capacité à ignorer l’inutile et absence d’invention d’action/état restent à juger sur les 18 blocs ci-dessus.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-suggest-message-final-mini.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-suggest-message-final-mini.report.md`);
}

await run();
