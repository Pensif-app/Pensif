// Benchmark de NON-RÉGRESSION CIBLÉ — durcissement complice (2026-09-17). Cible TOUS les cas
// `tone === 'complice'` du corpus partagé (benchmark-suggest-message-corpus.ts), pas seulement les 2
// nouveaux cas réels (19, 20, voir ce fichier) — objectif : vérifier que COMPLICE_REINFORCEMENT
// (prompt.ts) corrige les défauts observés en conditions réelles SANS régresser les cas complice déjà
// validés au benchmark final (2, 5, 8, 10, 14, 17).
//
// Défauts réels ciblés (tests manuels iPhone) :
//   - cas 19 (birthday) : "café sans sucre" forcé hors sujet, "après la fête" (fête inventée).
//   - cas 20 (thinking_of_you) : "café sans sucre" forcé + transformé en habitude ("toujours fidèle
//     au poste"), "j'ai hâte de voir tes photos" (intention de l'expéditeur inventée), "ça promet"
//     (appréciation non fondée).
//
// GPT-5 mini uniquement, AUCUN override — mêmes valeurs de production que le benchmark final
// (reasoning_effort=low, max_completion_tokens=1200), prompt COMPLICE_REINFORCEMENT inclus (appliqué
// automatiquement par buildOpenaiRequestBody pour tone==='complice', voir openai.ts/prompt.ts).
//
// Ne modifie ni ne déploie rien. Ne touche à aucun fichier de Capture.
//
// PAS ENCORE EXÉCUTÉ — préparé pour validation avant tout redéploiement, sur accord explicite.
//
// Usage :
//   SUGGEST_MESSAGE_OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-suggest-message-complice-regression.ts

import { buildOpenaiRequestBody } from '../supabase/functions/suggest-message/providers/llm/openai.ts';
import { validateLlmOutput } from '../supabase/functions/suggest-message/validate.ts';
import { CASES } from './benchmark-suggest-message-corpus.ts';

const MINI_MODEL = Deno.env.get('SUGGEST_MESSAGE_MINI_MODEL') ?? 'gpt-5-mini';
const COMPLICE_CASES = CASES.filter((c) => c.tone === 'complice');

const PRICING_USD_PER_1M = { input: 0.25, output: 2 };

const FORBIDDEN_TERMS = ['pensif', 'quiz', 'pensée enregistrée', 'pensées enregistrées', 'contexte fourni', 'assistant'];

// Détection automatique, objective, des symptômes réels observés — en complément du jugement manuel
// (une détection négative ne prouve pas l'absence d'invention d'une AUTRE nature, mais une détection
// positive confirme sans ambiguïté une régression connue).
const HABIT_MARKERS = ['toujours', "comme d'habitude", 'comme toujours', 'fidèle au poste'];
const INVENTED_INTENT_MARKERS = ["j'ai hâte de", 'je suis impatient', "j'attends avec impatience"];
const INVENTED_EVENT_MARKERS = ['après la fête', 'pendant la fête', 'à la fête'];

function detectForbiddenMentions(message: string): string[] {
  const lower = message.toLowerCase();
  return FORBIDDEN_TERMS.filter((term) => lower.includes(term));
}

function detectComplianceMarkers(message: string): { habit: string[]; invented: string[] } {
  const lower = message.toLowerCase();
  return {
    habit: HABIT_MARKERS.filter((m) => lower.includes(m)),
    invented: [...INVENTED_INTENT_MARKERS, ...INVENTED_EVENT_MARKERS].filter((m) => lower.includes(m)),
  };
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
  habitMarkers: string[];
  inventedMarkers: string[];
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
    habitMarkers: [],
    inventedMarkers: [],
    httpError: null,
    finishReason: null,
    reasoningTokens: null,
    visibleOutputTokens: null,
    budgetExhausted: false,
  };
  if (!apiKey) return { ...empty, httpError: 'SUGGEST_MESSAGE_OPENAI_API_KEY absent' };

  const start = performance.now();
  try {
    // AUCUN override — mêmes valeurs que providers/llm/openai.ts en production, COMPLICE_REINFORCEMENT
    // appliqué automatiquement (buildOpenaiRequestBody → buildSystemPrompt(tone)).
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
    const markers = outcome.ok ? detectComplianceMarkers(outcome.message) : { habit: [], invented: [] };
    return {
      message: outcome.ok ? outcome.message : null,
      jsonValid: outcome.ok,
      parseError: outcome.ok ? null : outcome.parseError,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(inputTokens, outputTokens),
      forbiddenMentions: outcome.ok ? detectForbiddenMentions(outcome.message) : [],
      habitMarkers: markers.habit,
      inventedMarkers: markers.invented,
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
  if (COMPLICE_CASES.length === 0) throw new Error('Aucun cas complice trouvé dans le corpus — corpus modifié ?');

  const lines: string[] = [];
  lines.push('# Benchmark de non-régression ciblé — durcissement complice (2026-09-17)\n');
  lines.push(
    `Modèle : \`${MINI_MODEL}\` (valeurs de production, sans override). Tous les cas \`tone === 'complice'\` du corpus (${COMPLICE_CASES.map((c) => c.id).join(', ')}) — inclut les 2 cas réels 19/20 reproduisant les défauts observés sur iPhone, et tous les cas complice déjà validés précédemment (non-régression). Détection automatique de marqueurs connus (habitude inventée, intention/fête inventée) en complément du jugement manuel — une absence de marqueur ne prouve pas l'absence de toute invention, mais une présence confirme sans ambiguïté une régression connue.\n`,
  );

  const results: CallResult[] = [];
  for (const c of COMPLICE_CASES) {
    console.log(`\n=== Cas ${c.id} — ${c.label} (ton: ${c.tone}) ===`);
    const r = await callMini(c);
    results.push(r);
    console.log(
      `  MINI (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${r.costUsd?.toFixed(6) ?? 'n/a'}) : ${r.httpError ?? r.parseError ?? r.message}`,
    );
    console.log(`    diag: finish_reason=${r.finishReason ?? 'n/a'}, reasoning_tokens=${r.reasoningTokens ?? 'n/a'}, visible_tokens≈${r.visibleOutputTokens ?? 'n/a'}${r.budgetExhausted ? ' ⚠️ BUDGET ÉPUISÉ' : ''}`);
    if (r.habitMarkers.length) console.log(`    ⚠️ marqueur d'habitude inventée détecté : ${r.habitMarkers.join(', ')}`);
    if (r.inventedMarkers.length) console.log(`    ⚠️ marqueur d'intention/fête inventée détecté : ${r.inventedMarkers.join(', ')}`);
    if (r.forbiddenMentions.length) console.log(`    ⚠️ mentions interdites détectées : ${r.forbiddenMentions.join(', ')}`);

    lines.push(`## Cas ${c.id} — ${c.label}`);
    lines.push('');
    lines.push(`- Message : ${r.httpError ? `❌ erreur réseau/API : ${r.httpError}` : r.parseError ? `❌ JSON invalide : ${r.parseError}` : `"${r.message}"`}`);
    lines.push(`- JSON valide : ${r.jsonValid ? '✅' : '❌'} · Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${r.costUsd !== null ? `$${r.costUsd.toFixed(6)}` : 'n/a'}`);
    lines.push(`- Diagnostic budget : finish_reason=\`${r.finishReason ?? 'n/a'}\`, reasoning_tokens=${r.reasoningTokens ?? 'n/a'}, tokens visibles≈${r.visibleOutputTokens ?? 'n/a'}${r.budgetExhausted ? ' — **⚠️ BUDGET ÉPUISÉ**' : ''}`);
    lines.push(`- Marqueur habitude inventée ("toujours"/"comme d'habitude"/"fidèle au poste") : ${r.habitMarkers.length ? `⚠️ ${r.habitMarkers.join(', ')}` : 'aucun'}`);
    lines.push(`- Marqueur intention/fête inventée ("j'ai hâte de..."/"après la fête"...) : ${r.inventedMarkers.length ? `⚠️ ${r.inventedMarkers.join(', ')}` : 'aucun'}`);
    lines.push(`- Mentions interdites détectées : ${r.forbiddenMentions.length ? r.forbiddenMentions.join(', ') : 'aucune'}`);
    lines.push('');
    lines.push(
      c.id === '19' || c.id === '20'
        ? "**À vérifier en priorité (cas réel) : \"café sans sucre\" peut être totalement ignoré, aucune fête/intention inventée, naturel et réellement complice.**"
        : '**À vérifier : pas de nouvelle régression introduite par COMPLICE_REINFORCEMENT sur un cas déjà validé.**',
    );
    lines.push('- Jugement manuel : ');
    lines.push('');
  }

  const validCount = results.filter((r) => r.jsonValid).length;
  const exhaustedCount = results.filter((r) => r.budgetExhausted).length;
  const habitCount = results.filter((r) => r.habitMarkers.length > 0).length;
  const inventedCount = results.filter((r) => r.inventedMarkers.length > 0).length;
  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- JSON valides : ${validCount}/${COMPLICE_CASES.length}`);
  lines.push(`- Cas ayant atteint la limite de 1200 : ${exhaustedCount}/${COMPLICE_CASES.length}`);
  lines.push(`- Cas avec marqueur d'habitude inventée détecté automatiquement : ${habitCount}/${COMPLICE_CASES.length}`);
  lines.push(`- Cas avec marqueur d'intention/fête inventée détecté automatiquement : ${inventedCount}/${COMPLICE_CASES.length}`);
  lines.push('- Jugement qualitatif complet (naturel, complicité réelle par le style) à faire sur les blocs ci-dessus, en particulier 19 et 20.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-suggest-message-complice-regression.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-suggest-message-complice-regression.report.md`);
}

await run();
