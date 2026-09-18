// Benchmark DÉDIÉ — extraction des récurrences par Capture (reminder.recurrence) — CHANTIER RAPPELS
// RÉCURRENCES, incrément 2 (2026-09-18). Réutilise EXACTEMENT le prompt/schéma/validation réels
// (buildOpenaiRequestBody, validateLlmOutput) — aucune divergence possible entre ce qui est mesuré
// ici et ce qui tournerait en production. GPT-5 mini uniquement (modèle de production actuel de
// Capture, voir openai.ts) — pas une comparaison de fournisseurs (voir
// benchmark-capture-llm-providers.ts pour ça), juste une vérification ciblée de la nouvelle règle 6/7.
//
// Ne modifie ni ne déploie rien — lecture seule sur le pipeline réel, écrit uniquement un rapport
// dans scripts/benchmark-capture-recurrence.report.md. Ne touche à aucun fichier de suggest-message.
//
// PAS ENCORE EXÉCUTÉ — préparé pour validation avant tout déploiement, sur accord explicite (même
// méthode que tous les benchmarks précédents de ce projet).
//
// Usage :
//   OPENAI_API_KEY=sk-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-recurrence.ts
//
// Modèle ajustable par env : OPENAI_MINI_MODEL (défaut gpt-5-mini).

import { buildOpenaiRequestBody } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext, ExtractedPensee } from '../supabase/functions/_shared/captureContract.ts';

const MINI_MODEL = Deno.env.get('OPENAI_MINI_MODEL') ?? 'gpt-5-mini';
const PRICING_USD_PER_1M = { input: 0.25, output: 2 }; // gpt-5-mini — à vérifier sur la page tarifaire officielle avant toute décision budgétaire

const FIXED_CONTEXT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T10:00:00', // vendredi — "demain" = 2026-09-19
  weekday: 'vendredi',
};

type Expectation = {
  label: string;
  transcript: string;
  check: (pensees: ExtractedPensee[]) => { ok: boolean; detail: string };
};

// Les 11 cas minimum demandés — un par ligne de la consigne, dans le même ordre.
const CASES: Expectation[] = [
  {
    label: '1. Tous les jours, sans borne',
    transcript: 'Rappelle-moi tous les jours à 21h40 de sortir la poubelle.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      // Aucun ancrage explicite ("à partir de...") : la 1re occurrence peut raisonnablement être
      // aujourd'hui (21h40 n'est pas encore passé à 10h00) OU demain — volontairement pas tranché ici,
      // voir le jugement manuel. Le comportement RECURRENCE lui-même est en revanche vérifié strictement.
      const ok =
        p.length === 1 &&
        r?.detected === true &&
        r.frequency === 'daily' &&
        Array.isArray(r.daysOfWeek) && r.daysOfWeek.length === 0 &&
        r.occurrenceCount === null &&
        r.untilDate === null &&
        !!r.heardExpression &&
        p[0].reminder.time === '21:40';
      return { ok, detail: `recurrence=${JSON.stringify(r)}, reminder.date=${p[0]?.reminder.date} (jugement manuel sur la date)` };
    },
  },
  {
    label: '2. Tous les jours pendant 5 jours',
    transcript: 'Rappelle-moi tous les jours à 21h40 pendant 5 jours de faire mes étirements.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok = p.length === 1 && r?.detected === true && r.frequency === 'daily' && r.occurrenceCount === 5 && r.untilDate === null;
      return { ok, detail: `recurrence=${JSON.stringify(r)}` };
    },
  },
  {
    label: '3. Tous les jours jusqu’au 25 septembre',
    transcript: 'Rappelle-moi tous les jours à 21h40 jusqu’au 25 septembre de prendre mon médicament.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok = p.length === 1 && r?.detected === true && r.frequency === 'daily' && r.untilDate === '2026-09-25' && r.occurrenceCount === null;
      return { ok, detail: `recurrence=${JSON.stringify(r)}` };
    },
  },
  {
    label: '4. Du lundi au vendredi',
    transcript: 'Rappelle-moi du lundi au vendredi à 8h de préparer le café.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok =
        p.length === 1 &&
        r?.detected === true &&
        r.frequency === 'weekly' &&
        JSON.stringify([...(r.daysOfWeek ?? [])].sort()) === JSON.stringify([1, 2, 3, 4, 5]) &&
        p[0].reminder.time === '08:00';
      return { ok, detail: `recurrence=${JSON.stringify(r)}, time=${p[0]?.reminder.time}` };
    },
  },
  {
    label: '5. Chaque lundi',
    transcript: 'Rappelle-moi chaque lundi à 18h d’appeler Léa.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok = p.length === 1 && r?.detected === true && r.frequency === 'weekly' && JSON.stringify(r.daysOfWeek) === JSON.stringify([1]);
      return { ok, detail: `recurrence=${JSON.stringify(r)}` };
    },
  },
  {
    label: '6. Week-end récurrent EXPLICITE',
    transcript: 'Rappelle-moi tous les samedis et dimanches à 10h de faire du sport.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok =
        p.length === 1 &&
        r?.detected === true &&
        r.frequency === 'weekly' &&
        JSON.stringify([...(r.daysOfWeek ?? [])].sort()) === JSON.stringify([0, 6]);
      return { ok, detail: `recurrence=${JSON.stringify(r)}` };
    },
  },
  {
    label: '7. Pendant 5 jours à partir de demain',
    transcript: 'Rappelle-moi tous les jours pendant 5 jours à partir de demain à 9h de prendre mes vitamines.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok =
        p.length === 1 &&
        r?.detected === true &&
        r.frequency === 'daily' &&
        r.occurrenceCount === 5 &&
        p[0].reminder.date === '2026-09-19' && // demain — première occurrence, ancrage explicite
        p[0].reminder.time === '09:00';
      return { ok, detail: `recurrence=${JSON.stringify(r)}, reminder.date=${p[0]?.reminder.date}, time=${p[0]?.reminder.time}` };
    },
  },
  {
    label: '8. "Tous les jours de la semaine" — AMBIGU, ne doit JAMAIS être tranché',
    transcript: 'Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok =
        p.length === 1 &&
        r?.detected === true &&
        r.frequency === 'unclear' &&
        r.daysOfWeek === null &&
        r.occurrenceCount === null &&
        r.untilDate === null &&
        !!r.heardExpression;
      return { ok, detail: `recurrence=${JSON.stringify(r)} — doit être frequency="unclear", daysOfWeek=null (jamais 7j/7 ni lundi-vendredi choisi)` };
    },
  },
  {
    label: '9. Récurrence SANS heure — jamais d’heure inventée',
    transcript: 'Rappelle-moi tous les jours de faire une pause.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok = p.length === 1 && r?.detected === true && r.frequency === 'daily' && p[0].reminder.time === null;
      return { ok, detail: `recurrence=${JSON.stringify(r)}, time=${p[0]?.reminder.time} (doit rester null, jamais "09:00")` };
    },
  },
  {
    label: '10. Rappel PONCTUEL classique — non-régression',
    transcript: 'Rappelle-moi demain à 18h d’appeler Micka.',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === true && r.date === '2026-09-19' && r.time === '18:00' && r.recurrence === null;
      return { ok, detail: `reminder=${JSON.stringify(r)}` };
    },
  },
  {
    label: '11. Phrase SANS rappel — non-régression',
    transcript: 'Micka aime le café.',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === false && r.recurrence === null && !p[0].event.hasDate;
      return { ok, detail: `reminder=${JSON.stringify(r)}, event=${JSON.stringify(p[0]?.event)}` };
    },
  },
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
  lines.push('# Benchmark dédié — extraction des récurrences (Capture, reminder.recurrence)\n');
  lines.push(`Modèle : \`${MINI_MODEL}\` (production actuelle de Capture). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.\n`);

  let passCount = 0;
  for (const c of CASES) {
    console.log(`\n=== ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}"`);
    const r = await callMini(c.transcript);
    const pensees = r.outcome.ok ? r.outcome.pensees : [];
    const check = r.outcome.ok ? c.check(pensees) : { ok: false, detail: r.outcome.parseError };
    if (check.ok) passCount += 1;
    console.log(`  ${check.ok ? 'OK' : 'FAIL'} — ${check.detail}`);
    console.log(`  (${r.latencyMs.toFixed(0)}ms, in=${r.inputTokens}, out=${r.outputTokens}, coût≈${estimateCostUsd(r.inputTokens, r.outputTokens)?.toFixed(6) ?? 'n/a'})`);

    lines.push(`## ${c.label}`);
    lines.push(`Transcript : "${c.transcript}"\n`);
    lines.push(`- Résultat : ${check.ok ? '✅' : '❌'} — ${check.detail}`);
    lines.push(`- Pensées extraites (brut) : \`${JSON.stringify(pensees)}\``);
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms · Tokens in/out : ${r.inputTokens ?? 'n/a'}/${r.outputTokens ?? 'n/a'} · Coût estimé : ${estimateCostUsd(r.inputTokens, r.outputTokens) !== null ? `$${estimateCostUsd(r.inputTokens, r.outputTokens)!.toFixed(6)}` : 'n/a'}`);
    lines.push('- Jugement manuel : ');
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Score : ${passCount}/${CASES.length}`);
  lines.push('- Attention particulière : cas 8 (ambiguïté "tous les jours de la semaine" jamais tranchée) et cas 9 (aucune heure inventée pour une récurrence).');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-recurrence.report.md', report);
  console.log(`\nScore final : ${passCount}/${CASES.length}`);
  console.log('Rapport écrit dans scripts/benchmark-capture-recurrence.report.md');
}

await run();
