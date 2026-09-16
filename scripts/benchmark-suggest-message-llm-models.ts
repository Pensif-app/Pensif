// Benchmark GPT-5 nano vs GPT-5 mini pour "Réponses intelligentes" (suggest-message) — CHANTIER
// RÉPONSES INTELLIGENTES, incrément 1bis (2026-09-16). Réutilise EXACTEMENT le prompt et le contrat
// de production (buildOpenaiRequestBody, prompt.ts, validate.ts de suggest-message/) — aucune
// divergence possible entre ce qui est mesuré ici et ce qui tournera réellement en production. Le
// prompt n'est JAMAIS modifié entre les deux modèles ni pendant le run (consigne explicite).
//
// Ne modifie ni ne déploie rien — lecture seule sur le pipeline réel, écrit uniquement un rapport
// dans scripts/benchmark-suggest-message-llm-models.report.md. Ne touche à aucun fichier de Capture.
//
// Usage :
//   SUGGEST_MESSAGE_OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-suggest-message-llm-models.ts
//
// Modèles ajustables par env : SUGGEST_MESSAGE_NANO_MODEL (défaut gpt-5-nano),
// SUGGEST_MESSAGE_MINI_MODEL (défaut gpt-5-mini). reasoning_effort via SUGGEST_MESSAGE_REASONING_EFFORT
// (défaut "low", même variable que la production, voir openai.ts).

import { buildOpenaiRequestBody } from '../supabase/functions/suggest-message/providers/llm/openai.ts';
import { validateLlmOutput } from '../supabase/functions/suggest-message/validate.ts';
import { MessageSuggestionContext, MessageTone } from '../supabase/functions/suggest-message/contract.ts';
import { CASES } from './benchmark-suggest-message-corpus.ts';

const NANO_MODEL = Deno.env.get('SUGGEST_MESSAGE_NANO_MODEL') ?? 'gpt-5-nano';
const MINI_MODEL = Deno.env.get('SUGGEST_MESSAGE_MINI_MODEL') ?? 'gpt-5-mini';
const REASONING_EFFORT = Deno.env.get('SUGGEST_MESSAGE_REASONING_EFFORT') ?? 'low';

// DIAGNOSTIC BUDGET DE SORTIE (2026-09-16) — le benchmark A (max_completion_tokens=400, valeur de
// production dans providers/llm/openai.ts) a montré des échecs systématiques à exactement 400
// tokens. Ce run diagnostic ne change RIEN côté production : `buildOpenaiRequestBody` est appelé À
// L'IDENTIQUE (même prompt, même corpus, même reasoning_effort, mêmes messages system/user), puis
// SEUL le champ `max_completion_tokens` du corps de requête déjà construit est réécrit ICI, dans ce
// script, juste avant l'appel réseau — providers/llm/openai.ts n'est ni modifié ni recompilé.
const DIAGNOSTIC_MAX_COMPLETION_TOKENS = Number(Deno.env.get('BENCHMARK_MAX_COMPLETION_TOKENS') ?? '1000');

// Tarifs approximatifs (USD / 1M tokens) — À VÉRIFIER sur les pages tarifaires officielles avant
// toute décision budgétaire, simple ordre de grandeur à partir des tokens réellement retournés.
const PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5-mini': { input: 0.25, output: 2 },
};

// Termes qui ne doivent JAMAIS apparaître dans un message généré (règle 6 du prompt) — détection
// automatique, objective, en complément du jugement humain sur les autres critères.
const FORBIDDEN_TERMS = ['pensif', 'quiz', 'pensée enregistrée', 'pensées enregistrées', 'contexte fourni', 'assistant'];

function detectForbiddenMentions(message: string): string[] {
  const lower = message.toLowerCase();
  return FORBIDDEN_TERMS.filter((term) => lower.includes(term));
}

// Corpus importé de benchmark-suggest-message-corpus.ts — voir ce fichier pour le détail des 18 cas.
// Extraction faite pour garantir "mêmes 18 cas" avec le benchmark final mini-only (identité de
// fichier, pas juste une ressemblance entre deux copies).

type CallResult = {
  message: string | null;
  jsonValid: boolean;
  parseError: string | null;
  latencyMs: number;
  inputTokens: number | null;
  /** usage.completion_tokens BRUT — pour un modèle "reasoning" (gpt-5*), c'est le TOTAL reasoning +
   *  visible combinés, pas seulement le texte final (voir reasoningTokens/visibleOutputTokens). */
  outputTokens: number | null;
  costUsd: number | null;
  forbiddenMentions: string[];
  httpError: string | null;
  // --- Diagnostic budget de sortie (2026-09-16) — demandé explicitement avant toute décision
  // Nano/Mini ou modification de prompt. N'affecte QUE ce script, jamais openai.ts de production.
  /** Raison d'arrêt renvoyée par l'API — 'length' = coupé par max_completion_tokens AVANT la fin
   *  naturelle de la réponse (le plus probable coupable des échecs à exactement 400 tokens). */
  finishReason: string | null;
  /** usage.completion_tokens_details.reasoning_tokens — tokens de raisonnement INTERNE, non visibles
   *  dans le contenu retourné, mais qui comptent DANS max_completion_tokens pour les modèles gpt-5*
   *  (confirmé par l'API OpenAI : max_completion_tokens borne reasoning + visible ensemble). `null`
   *  si l'API ne renvoie pas ce détail (modèle non-reasoning, ou champ absent). */
  reasoningTokens: number | null;
  /** outputTokens - reasoningTokens (si les deux connus) — tokens RÉELLEMENT disponibles pour le
   *  texte JSON final. Une valeur très faible ou négative confirme "plus assez de budget pour écrire
   *  la réponse" plutôt qu'un JSON malformé pour une autre raison. */
  visibleOutputTokens: number | null;
  /** true si finish_reason === 'length' — l'appel a été tronqué par la limite, pas par un choix du
   *  modèle de s'arrêter naturellement. */
  budgetExhausted: boolean;
};

function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const pricing = PRICING_USD_PER_1M[model];
  if (!pricing || inputTokens === null || outputTokens === null) return null;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

async function callModel(context: MessageSuggestionContext, tone: MessageTone, model: string): Promise<CallResult> {
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
    // MÊME fonction que la production (providers/llm/openai.ts) — aucune divergence de prompt/contrat.
    const body = buildOpenaiRequestBody(context, tone, model);
    // SEUL écart volontaire de ce run diagnostic vs la production : la limite de tokens de sortie
    // (voir DIAGNOSTIC_MAX_COMPLETION_TOKENS ci-dessus). Le prompt/schéma/messages construits par
    // buildOpenaiRequestBody restent strictement ceux de production, inchangés.
    body.max_completion_tokens = DIAGNOSTIC_MAX_COMPLETION_TOKENS;
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
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        // Présent uniquement pour les modèles "reasoning" (gpt-5*) — voir diagnostic demandé :
        // reasoning_tokens compte DANS completion_tokens, donc DANS max_completion_tokens.
        completion_tokens_details?: { reasoning_tokens?: number };
      };
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
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
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
  lines.push('# Benchmark "Réponses intelligentes" — GPT-5 nano vs GPT-5 mini — run DIAGNOSTIC budget de sortie\n');
  lines.push(
    `Modèles : nano=\`${NANO_MODEL}\`, mini=\`${MINI_MODEL}\` (reasoning_effort=\`${REASONING_EFFORT}\` pour les deux, prompt/contrat IDENTIQUES et INCHANGÉS par rapport au benchmark A et entre les deux modèles — mêmes \`buildSystemPrompt\`/\`buildUserPrompt\`/\`buildOpenaiRequestBody\` que la production, mêmes 18 cas). **Seul écart volontaire vs le benchmark A et vs la production : \`max_completion_tokens\` = ${DIAGNOSTIC_MAX_COMPLETION_TOKENS} pour ce run (au lieu de 400 en production) — appliqué UNIQUEMENT dans ce script diagnostic, providers/llm/openai.ts n'est pas modifié.** Prompt non modifié même si certaines réponses inventent des éléments ou utilisent des pensées hors sujet — ce run isole uniquement le problème de budget. 18 paires nano/mini ci-dessous pour jugement manuel — voir aussi la console pour le même contenu.\n`,
  );

  const nanoResults: CallResult[] = [];
  const miniResults: CallResult[] = [];

  for (const c of CASES) {
    console.log(`\n=== Cas ${c.id} — ${c.label} (ton: ${c.tone}) ===`);
    const [nano, mini] = await Promise.all([
      callModel(c.context, c.tone, NANO_MODEL),
      callModel(c.context, c.tone, MINI_MODEL),
    ]);
    nanoResults.push(nano);
    miniResults.push(mini);

    const diag = (r: CallResult) =>
      `finish_reason=${r.finishReason ?? 'n/a'}, reasoning_tokens=${r.reasoningTokens ?? 'n/a'}, visible_tokens≈${r.visibleOutputTokens ?? 'n/a'}${r.budgetExhausted ? ' ⚠️ BUDGET ÉPUISÉ (length)' : ''}`;

    console.log(`  NANO (${(nano.latencyMs).toFixed(0)}ms, in=${nano.inputTokens}, out=${nano.outputTokens}, coût≈${nano.costUsd?.toFixed(6) ?? 'n/a'}) : ${nano.httpError ?? nano.parseError ?? nano.message}`);
    console.log(`    diag: ${diag(nano)}`);
    if (nano.forbiddenMentions.length) console.log(`    ⚠️ mentions interdites détectées : ${nano.forbiddenMentions.join(', ')}`);
    console.log(`  MINI (${(mini.latencyMs).toFixed(0)}ms, in=${mini.inputTokens}, out=${mini.outputTokens}, coût≈${mini.costUsd?.toFixed(6) ?? 'n/a'}) : ${mini.httpError ?? mini.parseError ?? mini.message}`);
    console.log(`    diag: ${diag(mini)}`);
    if (mini.forbiddenMentions.length) console.log(`    ⚠️ mentions interdites détectées : ${mini.forbiddenMentions.join(', ')}`);

    lines.push(`## Cas ${c.id} — ${c.label}`);
    lines.push(`Ton demandé : **${c.tone}**`);
    lines.push('');
    lines.push('**GPT-5 nano**');
    lines.push(`- Message : ${nano.httpError ? `❌ erreur réseau/API : ${nano.httpError}` : nano.parseError ? `❌ JSON invalide : ${nano.parseError}` : `"${nano.message}"`}`);
    lines.push(`- JSON valide : ${nano.jsonValid ? '✅' : '❌'} · Latence : ${nano.latencyMs.toFixed(0)}ms · Tokens in/out : ${nano.inputTokens ?? 'n/a'}/${nano.outputTokens ?? 'n/a'} · Coût estimé : ${nano.costUsd !== null ? `$${nano.costUsd.toFixed(6)}` : 'n/a'}`);
    lines.push(`- Diagnostic budget : finish_reason=\`${nano.finishReason ?? 'n/a'}\`, reasoning_tokens=${nano.reasoningTokens ?? 'n/a'}, tokens visibles restants≈${nano.visibleOutputTokens ?? 'n/a'}${nano.budgetExhausted ? ' — **⚠️ BUDGET ÉPUISÉ (length)**' : ''}`);
    lines.push(`- Mentions interdites détectées : ${nano.forbiddenMentions.length ? nano.forbiddenMentions.join(', ') : 'aucune'}`);
    lines.push('');
    lines.push('**GPT-5 mini**');
    lines.push(`- Message : ${mini.httpError ? `❌ erreur réseau/API : ${mini.httpError}` : mini.parseError ? `❌ JSON invalide : ${mini.parseError}` : `"${mini.message}"`}`);
    lines.push(`- JSON valide : ${mini.jsonValid ? '✅' : '❌'} · Latence : ${mini.latencyMs.toFixed(0)}ms · Tokens in/out : ${mini.inputTokens ?? 'n/a'}/${mini.outputTokens ?? 'n/a'} · Coût estimé : ${mini.costUsd !== null ? `$${mini.costUsd.toFixed(6)}` : 'n/a'}`);
    lines.push(`- Diagnostic budget : finish_reason=\`${mini.finishReason ?? 'n/a'}\`, reasoning_tokens=${mini.reasoningTokens ?? 'n/a'}, tokens visibles restants≈${mini.visibleOutputTokens ?? 'n/a'}${mini.budgetExhausted ? ' — **⚠️ BUDGET ÉPUISÉ (length)**' : ''}`);
    lines.push(`- Mentions interdites détectées : ${mini.forbiddenMentions.length ? mini.forbiddenMentions.join(', ') : 'aucune'}`);
    lines.push('');
    lines.push('**Jugement manuel (à compléter) — fidélité factuelle / naturel / respect du ton / pertinence de la personnalisation / capacité à ignorer l’inutile :**');
    lines.push('- Nano : ');
    lines.push('- Mini : ');
    lines.push('');
  }

  const avg = (results: CallResult[], field: 'latencyMs' | 'inputTokens' | 'outputTokens' | 'costUsd') => {
    const vals = results.map((r) => r[field]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const validCount = (results: CallResult[]) => results.filter((r) => r.jsonValid).length;
  const forbiddenCount = (results: CallResult[]) => results.filter((r) => r.forbiddenMentions.length > 0).length;

  lines.push('## Synthèse objective (JSON valide + mentions interdites uniquement — le reste est à juger manuellement ci-dessus)');
  lines.push('');
  lines.push('| | JSON valide | Mentions interdites détectées | Latence moy. | Tokens in/out moy. | Coût moy./message |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(
    `| GPT-5 nano | ${validCount(nanoResults)}/${CASES.length} | ${forbiddenCount(nanoResults)}/${CASES.length} | ${avg(nanoResults, 'latencyMs')?.toFixed(0) ?? 'n/a'}ms | ${avg(nanoResults, 'inputTokens')?.toFixed(0) ?? 'n/a'}/${avg(nanoResults, 'outputTokens')?.toFixed(0) ?? 'n/a'} | ${avg(nanoResults, 'costUsd') !== null ? `$${avg(nanoResults, 'costUsd')!.toFixed(6)}` : 'n/a'} |`,
  );
  lines.push(
    `| GPT-5 mini | ${validCount(miniResults)}/${CASES.length} | ${forbiddenCount(miniResults)}/${CASES.length} | ${avg(miniResults, 'latencyMs')?.toFixed(0) ?? 'n/a'}ms | ${avg(miniResults, 'inputTokens')?.toFixed(0) ?? 'n/a'}/${avg(miniResults, 'outputTokens')?.toFixed(0) ?? 'n/a'} | ${avg(miniResults, 'costUsd') !== null ? `$${avg(miniResults, 'costUsd')!.toFixed(6)}` : 'n/a'} |`,
  );
  lines.push('');
  lines.push('Ce tableau ne couvre que ce qui est objectivement vérifiable (format JSON, mots interdits). Fidélité factuelle, naturel, respect du ton, pertinence de la personnalisation et capacité à ignorer l’inutile restent à juger sur les 18 paires ci-dessus.');

  // --- Diagnostic budget de sortie (max_completion_tokens=400, providers/llm/openai.ts) -----------
  // Demandé explicitement avant toute décision Nano/Mini ou modification de prompt.
  const exhaustedCount = (results: CallResult[]) => results.filter((r) => r.budgetExhausted).length;
  const avgReasoning = (results: CallResult[]) => {
    const vals = results.map((r) => r.reasoningTokens).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const maxReasoning = (results: CallResult[]) => {
    const vals = results.map((r) => r.reasoningTokens).filter((v): v is number => v !== null);
    return vals.length ? Math.max(...vals) : null;
  };
  const avgVisible = (results: CallResult[]) => {
    const vals = results.map((r) => r.visibleOutputTokens).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  lines.push('');
  lines.push('## Diagnostic budget de sortie (max_completion_tokens=400, providers/llm/openai.ts)');
  lines.push('');
  lines.push('| | Cas avec finish_reason="length" | reasoning_tokens moy. | reasoning_tokens max | tokens visibles moy. |');
  lines.push('|---|---|---|---|---|');
  lines.push(
    `| GPT-5 nano | ${exhaustedCount(nanoResults)}/${CASES.length} | ${avgReasoning(nanoResults)?.toFixed(0) ?? 'n/a'} | ${maxReasoning(nanoResults) ?? 'n/a'} | ${avgVisible(nanoResults)?.toFixed(0) ?? 'n/a'} |`,
  );
  lines.push(
    `| GPT-5 mini | ${exhaustedCount(miniResults)}/${CASES.length} | ${avgReasoning(miniResults)?.toFixed(0) ?? 'n/a'} | ${maxReasoning(miniResults) ?? 'n/a'} | ${avgVisible(miniResults)?.toFixed(0) ?? 'n/a'} |`,
  );
  lines.push('');
  lines.push(
    'Détail cas par cas des échecs `finish_reason="length"` :',
  );
  for (const [key, label, results] of [
    ['nano', 'GPT-5 nano', nanoResults],
    ['mini', 'GPT-5 mini', miniResults],
  ] as const) {
    void key;
    const failing = CASES.filter((_, i) => results[i].budgetExhausted);
    if (failing.length === 0) {
      lines.push(`- ${label} : aucun cas en \`length\`.`);
      continue;
    }
    for (const c of failing) {
      const r = results[CASES.indexOf(c)];
      lines.push(`- ${label}, cas ${c.id} : reasoning_tokens=${r.reasoningTokens ?? 'n/a'}, tokens visibles restants≈${r.visibleOutputTokens ?? 'n/a'} (${r.visibleOutputTokens !== null && r.visibleOutputTokens <= 0 ? 'budget de raisonnement seul a consommé toute la limite, 0 token restait pour écrire le JSON' : 'JSON probablement tronqué en cours d’écriture'}).`);
    }
  }

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-suggest-message-llm-models.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-suggest-message-llm-models.report.md`);
}

await run();
