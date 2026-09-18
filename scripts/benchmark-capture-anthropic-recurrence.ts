// Benchmark DÉDIÉ — extraction des récurrences par Capture (reminder.recurrence) via Anthropic —
// CHANTIER "Capture diagnostic — ROOT CAUSE Anthropic" (2026-09-18). Les logs iPhone réels ont
// prouvé que la production utilise `LLM_PROVIDER=anthropic`, jamais testé sur la fonctionnalité
// récurrence (benchmark-capture-recurrence.ts ne teste QUE GPT-5-mini/OpenAI, voir son commentaire
// d'en-tête).
//
// Contrairement à benchmark-capture-recurrence.ts (qui hand-roule son propre fetch, jamais
// validé contre le retry wrapper réel — problème déjà signalé pour OpenAI), ce script appelle
// `anthropicLlmProvider.extract` DIRECTEMENT — c'est le VRAI code de production (providers/llm/
// anthropic.ts), aucune divergence possible entre ce qui est mesuré ici et ce qui tourne en prod.
// Anthropic n'a de toute façon aucun wrapper retry (voir audit dédié) : appeler `extract` ou
// hand-rouler le fetch est donc équivalent pour LUI seul, mais reste la pratique la plus sûre.
//
// Ne modifie ni ne déploie rien — lecture seule, écrit uniquement un rapport dans
// scripts/benchmark-capture-anthropic-recurrence.report.md.
//
// PAS ENCORE EXÉCUTÉ — ANTHROPIC_API_KEY absent de cet environnement local. Préparé pour
// validation, à lancer explicitement avec la clé de production (ou une clé de test) :
//
//   ANTHROPIC_API_KEY=sk-ant-... deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-anthropic-recurrence.ts
//
// Modèle ajustable par env : ANTHROPIC_MODEL (défaut claude-sonnet-5 — DOIT être aligné sur la
// valeur réelle du secret LLM_MODEL en production si elle diffère ; cette valeur reste illisible
// depuis cet environnement, voir audit "LLM_MODEL secret", donc ce défaut est une meilleure
// estimation, pas une certitude).

import { anthropicLlmProvider } from '../supabase/functions/capture/providers/llm/anthropic.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext, ExtractedPensee } from '../supabase/functions/_shared/captureContract.ts';

const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5';

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

const CASES: Expectation[] = [
  // --- CAS OBLIGATOIRE — phrase EXACTE du diagnostic réel iPhone (23h35, deux essais consécutifs,
  // rejetée par isCaptureExploitable côté client alors que le transcript/STT étaient corrects) -----
  {
    label: '0. [OBLIGATOIRE — cas réel iPhone] "pendant 3 jours" après l’action, contexte réel 23h35',
    transcript: 'Rappelle-moi tous les jours à 23h35 de tester Pensif pendant 3 jours.',
    check: (p) => {
      const r = p[0]?.reminder;
      const rec = r?.recurrence;
      const ok =
        p.length === 1 &&
        p[0].texte === 'Tester Pensif' &&
        r?.hasReminder === true &&
        r.time === '23:35' &&
        rec?.detected === true &&
        rec.frequency === 'daily' &&
        rec.occurrenceCount === 3;
      return { ok, detail: `texte="${p[0]?.texte}", reminder=${JSON.stringify(r)}` };
    },
  },
  {
    label: '1. Tous les jours, sans borne',
    transcript: 'Rappelle-moi tous les jours à 21h40 de sortir la poubelle.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
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
    label: '6. "Tous les jours de la semaine" — AMBIGU, ne doit JAMAIS être tranché',
    transcript: 'Rappelle-moi tous les jours de la semaine à 21h40 de faire mes exercices.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok =
        p.length === 1 &&
        r?.detected === true &&
        r.frequency === 'unclear' &&
        r.daysOfWeek === null &&
        !!r.heardExpression;
      return { ok, detail: `recurrence=${JSON.stringify(r)} — doit être frequency="unclear", daysOfWeek=null` };
    },
  },
  {
    label: '7. Récurrence SANS heure — jamais d’heure inventée',
    transcript: 'Rappelle-moi tous les jours de faire une pause.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok = p.length === 1 && r?.detected === true && r.frequency === 'daily' && p[0].reminder.time === null;
      return { ok, detail: `recurrence=${JSON.stringify(r)}, time=${p[0]?.reminder.time} (doit rester null)` };
    },
  },
  {
    label: '8. Rappel PONCTUEL classique — non-régression',
    transcript: 'Rappelle-moi demain à 18h d’appeler Micka.',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === true && r.date === '2026-09-19' && r.time === '18:00' && r.recurrence === null;
      return { ok, detail: `reminder=${JSON.stringify(r)}` };
    },
  },
  {
    label: '9. Phrase SANS rappel — non-régression',
    transcript: 'Micka aime le café.',
    check: (p) => {
      const r = p[0]?.reminder;
      const ok = p.length === 1 && r?.hasReminder === false && r.recurrence === null && !p[0].event.hasDate;
      return { ok, detail: `reminder=${JSON.stringify(r)}, event=${JSON.stringify(p[0]?.event)}` };
    },
  },
];

type CallResult = { outcome: ValidationOutcome; latencyMs: number; error: string | null };

async function callClaude(transcript: string): Promise<CallResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return { outcome: { ok: false, parseError: 'ANTHROPIC_API_KEY absent', category: 'unknown' }, latencyMs: 0, error: 'clé absente' };
  const start = performance.now();
  try {
    // Appel DIRECT du provider de production réel (pas un fetch hand-roulé) — voir en-tête.
    const raw = await anthropicLlmProvider.extract(transcript, FIXED_CONTEXT, { model: ANTHROPIC_MODEL });
    return { outcome: validateLlmOutput(raw), latencyMs: performance.now() - start, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { outcome: { ok: false, parseError: message, category: 'unknown' }, latencyMs: performance.now() - start, error: message };
  }
}

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark dédié — Anthropic (production réelle) — récurrence + cas diagnostic 23h35\n');
  lines.push(`Modèle : \`${ANTHROPIC_MODEL}\` (appel direct \`anthropicLlmProvider.extract\`, code de production réel). Contexte fixe : vendredi 2026-09-18 10:00, "demain" = 2026-09-19.\n`);

  let passCount = 0;
  for (const c of CASES) {
    console.log(`\n=== ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}"`);
    const r = await callClaude(c.transcript);
    const pensees = r.outcome.ok ? r.outcome.pensees : [];
    const check = r.outcome.ok ? c.check(pensees) : { ok: false, detail: r.outcome.parseError };
    if (check.ok) passCount += 1;
    console.log(`  ${check.ok ? 'OK' : 'FAIL'} — ${check.detail}`);
    console.log(`  (${r.latencyMs.toFixed(0)}ms)${r.error ? ` erreur=${r.error}` : ''}`);

    lines.push(`## ${c.label}`);
    lines.push(`Transcript : "${c.transcript}"\n`);
    lines.push(`- Résultat : ${check.ok ? '✅' : '❌'} — ${check.detail}`);
    lines.push(`- Pensées extraites (brut) : \`${JSON.stringify(pensees)}\``);
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms${r.error ? ` · erreur=${r.error}` : ''}`);
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Score : ${passCount}/${CASES.length}`);
  lines.push('- Cas 0 est le cas RÉEL du diagnostic iPhone du 2026-09-18 ~23h35 — vérifie en particulier `texte="Tester Pensif"` (2 mots, aucun accent/mot-outil FR), la cause suspectée du rejet côté `isCaptureExploitable`.');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-anthropic-recurrence.report.md', report);
  console.log(`\nScore final : ${passCount}/${CASES.length}`);
  console.log('Rapport écrit dans scripts/benchmark-capture-anthropic-recurrence.report.md');
}

await run();
