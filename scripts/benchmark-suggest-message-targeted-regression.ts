// Benchmark de NON-RÉGRESSION CIBLÉ — CHANTIER RÉPONSES INTELLIGENTES (2026-09-16). PAS les 18 cas :
// uniquement les cas 4, 7, 8, 14 et 17 du corpus (benchmark-suggest-message-corpus.ts), avec
// EXACTEMENT leurs contextes existants (import direct, aucune donnée dupliquée/modifiée). Objectif :
// vérifier que le 2e durcissement du prompt (règle "ton" limitée à la formulation, règle "état
// émotionnel" jamais affirmé même déductible) corrige le cas 14 (hallucination "café trop fort" /
// "recette miracle" en ton complice sur contexte pauvre) SANS régresser les cas déjà validés au
// benchmark final : 4/17 (pensées pertinentes à exploiter normalement), 7/8 (event avec
// personnalisation légitime, dont 8 a un événement dont l'issue pourrait tenter une déduction
// d'émotion).
//
// GPT-5 mini uniquement, AUCUN override — mêmes valeurs de production que le benchmark final
// (reasoning_effort=low, max_completion_tokens=1200, prompt durci 2 fois inclus).
//
// Ne modifie ni ne déploie rien. Ne touche à aucun fichier de Capture.
//
// PAS ENCORE EXÉCUTÉ — préparé pour validation avant tout déploiement, sur accord explicite.
//
// Usage :
//   SUGGEST_MESSAGE_OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-suggest-message-targeted-regression.ts

import { buildOpenaiRequestBody } from '../supabase/functions/suggest-message/providers/llm/openai.ts';
import { validateLlmOutput } from '../supabase/functions/suggest-message/validate.ts';
import { CASES } from './benchmark-suggest-message-corpus.ts';

const MINI_MODEL = Deno.env.get('SUGGEST_MESSAGE_MINI_MODEL') ?? 'gpt-5-mini';
const TARGET_IDS = ['4', '7', '8', '14', '17'];
const TARGETED_CASES = CASES.filter((c) => TARGET_IDS.includes(c.id));

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
    // AUCUN override — mêmes valeurs que providers/llm/openai.ts en production.
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
  if (TARGETED_CASES.length !== TARGET_IDS.length) {
    throw new Error(`Cas manquants dans le corpus : attendu ${TARGET_IDS.join(',')}, trouvé ${TARGETED_CASES.map((c) => c.id).join(',')}`);
  }

  const lines: string[] = [];
  lines.push('# Benchmark de non-régression ciblé — cas 4, 7, 8, 14, 17 — GPT-5 mini\n');
  lines.push(
    `Modèle : \`${MINI_MODEL}\` (valeurs de production, sans override : reasoning_effort=low, max_completion_tokens=1200, prompt durci 2 fois — sélection du contexte + interdiction d'inventer, puis ton limité à la formulation + état émotionnel jamais affirmé). Objectif : vérifier que le cas 14 (hallucination "café trop fort"/"recette miracle" en ton complice sur contexte pauvre) est corrigé, sans régresser 4/7/8/17.\n`,
  );

  const results: CallResult[] = [];
  for (const c of TARGETED_CASES) {
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
    lines.push(
      c.id === '14'
        ? '**À vérifier en priorité : aucune anecdote/habitude/blague inventée (ex. plus de "café trop fort" ni "recette miracle") — complicité uniquement par le style.**'
        : '**À vérifier : toujours pas de régression (fidélité factuelle, aucune émotion affirmée non fournie, aucune invention d’action/état).**',
    );
    lines.push('- Jugement manuel : ');
    lines.push('');
  }

  const validCount = results.filter((r) => r.jsonValid).length;
  const exhaustedCount = results.filter((r) => r.budgetExhausted).length;
  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- JSON valides : ${validCount}/${TARGETED_CASES.length}`);
  lines.push(`- Cas ayant atteint la limite de 1200 : ${exhaustedCount}/${TARGETED_CASES.length}`);
  lines.push('- Jugement qualitatif (invention/émotion/ton) à faire sur les 5 blocs ci-dessus, en particulier le cas 14.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-suggest-message-targeted-regression.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-suggest-message-targeted-regression.report.md`);
}

await run();
