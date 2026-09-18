// Benchmark OBSERVATIONNEL — comportement ACTUEL de `texte` face aux formulations de rappel (audit
// "Capture — texte concis pour les rappels", 2026-09-18). Réutilise EXACTEMENT le prompt/schéma/
// validation réels du Capture v13 déployé (buildOpenaiRequestBody, validateLlmOutput) — aucun prompt
// n'est modifié par ce script. Contrairement aux benchmarks précédents, il ne juge PAS PASS/FAIL :
// il rapporte la sortie brute complète de chaque cas pour établir la baseline AVANT toute
// modification de règle. Voir le rapport pour l'analyse manuelle des patterns.
//
// Ne modifie ni ne déploie rien — lecture seule sur le pipeline réel, écrit uniquement un rapport
// dans scripts/benchmark-capture-texte-concision.report.md.
//
// Usage :
//   OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-texte-concision.ts
//
// Modèle ajustable par env : OPENAI_MINI_MODEL (défaut gpt-5-mini).

import { buildOpenaiRequestBody } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext } from '../supabase/functions/_shared/captureContract.ts';

const MINI_MODEL = Deno.env.get('OPENAI_MINI_MODEL') ?? 'gpt-5-mini';
const PRICING_USD_PER_1M = { input: 0.25, output: 2 }; // gpt-5-mini — à vérifier sur la page tarifaire officielle avant toute décision budgétaire

const FIXED_CONTEXT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T10:00:00', // vendredi — "demain" = 2026-09-19, "samedi" = 2026-09-19... voir note par cas
  weekday: 'vendredi',
};

const CASES: { label: string; transcript: string }[] = [
  { label: '1', transcript: 'Rappelle-moi tous les jours à 21h40 de faire mes combats sur mon jeu mobile Star Wars.' },
  { label: '2', transcript: 'Pense à appeler Yohan demain à 18h.' },
  { label: '3', transcript: "Rappelle-moi vendredi d'acheter du café." },
  { label: '4a (run 1/3 — ex-SPLIT observé sur v13)', transcript: "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi." },
  { label: '4b (run 2/3)', transcript: "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi." },
  { label: '4c (run 3/3)', transcript: "Rappelle-moi demain de demander à Yohan s'il est disponible vendredi." },
  { label: '5', transcript: 'Sofia a un entretien vendredi.' },
  { label: '6', transcript: 'Micka aimerait un casque audio.' },
  { label: '7', transcript: 'Yohan préfère son café sans sucre.' },
  { label: '8a (run 1/3 — ex-SPLIT observé sur v13, 2 hypothèses sur "samedi")', transcript: "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi." },
  { label: '8b (run 2/3)', transcript: "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi." },
  { label: '8c (run 3/3)', transcript: "Rappelle-moi d'acheter un cadeau pour l'anniversaire de Léa samedi." },
  { label: '9 (contrôle)', transcript: 'Rappelle-moi tous les jours pendant 5 jours à partir de demain à 21h40 de faire mes étirements.' },
  { label: '10 (contrôle)', transcript: "Rappelle-moi chaque lundi à 18h d'appeler Léa." },
  { label: '11 (nouveau — vrai multi-pensées à préserver)', transcript: "Micka aimerait un casque audio et rappelle-moi demain à 18h d'appeler Yohan." },
  { label: '12 (nouveau — 2 rappels indépendants)', transcript: "Rappelle-moi demain à 18h d'appeler Yohan et pense à acheter du café samedi à 10h." },
  { label: '13 (nouveau — événement historique, ne pas raccourcir)', transcript: 'Sofia a un entretien vendredi.' },
];

type CallResult = { outcome: ValidationOutcome; latencyMs: number; inputTokens: number | null; outputTokens: number | null; error: string | null };

async function callMini(transcript: string): Promise<CallResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { outcome: { ok: false, parseError: 'OPENAI_API_KEY absent' }, latencyMs: 0, inputTokens: null, outputTokens: null, error: 'clé absente' };
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
    return { outcome: validateLlmOutput(parsed), latencyMs, inputTokens: data.usage?.prompt_tokens ?? null, outputTokens: data.usage?.completion_tokens ?? null, error: null };
  } catch (e) {
    return { outcome: { ok: false, parseError: String(e) }, latencyMs: performance.now() - start, inputTokens: null, outputTokens: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function estimateCostUsd(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  return (inputTokens / 1_000_000) * PRICING_USD_PER_1M.input + (outputTokens / 1_000_000) * PRICING_USD_PER_1M.output;
}

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark observationnel — `texte` APRÈS l\'incrément prompt "texte concis + anti-SPLIT" (non déployé)\n');
  lines.push(`Modèle : \`${MINI_MODEL}\` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.\n`);
  lines.push('Ce rapport ne juge pas PASS/FAIL — il documente la sortie brute complète de chaque cas pour établir la baseline.\n');

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
      console.log(`  [${i}] texte      = "${p.texte}"`);
      console.log(`  [${i}] event      = ${JSON.stringify(p.event)}`);
      console.log(`  [${i}] reminder   = ${JSON.stringify({ ...p.reminder, recurrence: undefined })}`);
      console.log(`  [${i}] recurrence = ${JSON.stringify(p.reminder.recurrence)}`);
    });
    if (!r.outcome.ok) console.log(`  parseError = ${r.outcome.parseError}`);
    console.log(`  (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${cost?.toFixed(6) ?? 'n/a'})`);

    lines.push(`## Cas ${c.label}`);
    lines.push(`Transcript : "${c.transcript}"\n`);
    if (!r.outcome.ok) {
      lines.push(`- validateLlmOutput : ❌ ok=false — parseError: ${r.outcome.parseError}`);
    } else {
      lines.push(`- validateLlmOutput : ok=true, ${pensees.length} pensée(s)`);
      pensees.forEach((p, i) => {
        lines.push(`  - Pensée [${i}]`);
        lines.push(`    - texte : \`${p.texte}\``);
        lines.push(`    - event : \`${JSON.stringify(p.event)}\``);
        lines.push(`    - reminder (sans recurrence) : \`${JSON.stringify({ ...p.reminder, recurrence: undefined })}\``);
        lines.push(`    - reminder.recurrence : \`${JSON.stringify(p.reminder.recurrence)}\``);
      });
    }
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${cost !== null ? `$${cost.toFixed(6)}` : 'n/a'}`);
    lines.push('- Observation manuelle : ');
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Coût total estimé : $${totalCost.toFixed(6)}`);
  lines.push('- Rappel : ce benchmark mesure le comportement de `texte` APRÈS l\'incrément prompt "texte concis + anti-SPLIT" (règle 1 SPLIT corrigée + nouvelle règle 2 TEXTE CONCIS) — non déployé au moment de ce run. `texte` est donc attendu concis (sans la formulation de déclenchement du rappel ni sa date/heure/récurrence quand leur rattachement est certain) sur les cas de rappel ci-dessus, et inchangé sur les cas sans rappel.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-texte-concision.after-fix.report.md', report);
  console.log(`\nRapport écrit dans scripts/benchmark-capture-texte-concision.after-fix.report.md`);
  console.log(`Coût total estimé : $${totalCost.toFixed(6)}`);
}

await run();
