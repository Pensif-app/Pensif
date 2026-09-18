// CHANTIER "Capture — standardisation GPT-5-mini, validation finale" (2026-09-19), points 1-3.
// Benchmark recurrence DÉDIÉ — appelle le VRAI provider de production, aucun raccourci par fetch :
//
//   openaiLlmProvider.extract  (buildOpenaiRequestBody → attemptOpenaiExtraction → retry wrapper
//                                → parsing réel → objet retourné à validateLlmOutput)
//
// contrairement à scripts/benchmark-capture-recurrence.ts (fetch hand-roulé, jamais passé par le
// wrapper retry réel — limite déjà signalée dans un audit précédent).
//
// Cible EXPLICITE de la future config de prod : model="gpt-5-mini", reasoning_effort="low" — ne
// dépend JAMAIS de la valeur actuelle du secret LLM_MODEL (dont la valeur reste inconnue/non lisible
// depuis cet environnement), voir CHANTIER "point critique LLM_MODEL".
//
// Ne modifie ni ne déploie rien — lecture seule, écrit un rapport dans
// scripts/benchmark-capture-openai-mini-recurrence.report.md.
//
// PAS ENCORE EXÉCUTÉ — OPENAI_API_KEY absent de cet environnement local. Préparé pour validation :
//
//   OPENAI_API_KEY=sk-... OPENAI_REASONING_EFFORT=low deno run --allow-net --allow-env --allow-write \
//     scripts/benchmark-capture-openai-mini-recurrence.ts
//
// (OPENAI_REASONING_EFFORT=low est déjà le défaut de openai.ts — passé explicitement ici pour que le
// rapport documente sans ambiguïté la valeur réellement envoyée, indépendamment de tout défaut futur.)

import { openaiLlmProvider } from '../supabase/functions/capture/providers/llm/openai.ts';
import { validateLlmOutput, ValidationOutcome } from '../supabase/functions/capture/validate.ts';
import { TemporalContext, ExtractedPensee } from '../supabase/functions/_shared/captureContract.ts';

// Modèle CIBLE explicite — ne lit JAMAIS Deno.env.get('LLM_MODEL') (le secret de prod), justement
// pour ne dépendre d'aucune valeur secrète actuelle (consigne explicite, point critique LLM_MODEL).
const TARGET_MODEL = 'gpt-5-mini';

const FIXED_CONTEXT_MORNING: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-18T10:00:00', // vendredi — "demain" = 2026-09-19
  weekday: 'vendredi',
};
// Contexte de nuit (juste après minuit) — pour éviter de ne tester QUE la matinée, comme demandé
// explicitement (les deux cas obligatoires "Tester Pensif" utilisent ce contexte, voir plus bas).
const FIXED_CONTEXT_NIGHT: TemporalContext = {
  timezone: 'Europe/Paris',
  localDateTime: '2026-09-19T00:05:00', // samedi, quelques minutes après minuit
  weekday: 'samedi',
};

type Expectation = {
  label: string;
  transcript: string;
  context?: TemporalContext;
  check: (pensees: ExtractedPensee[]) => { ok: boolean; detail: string };
};

const CASES: Expectation[] = [
  // --- 2 CAS OBLIGATOIRES — phrases réelles du diagnostic iPhone, dont un passage de minuit -------
  {
    label: '0a. [OBLIGATOIRE — cas réel] 23h35, "pendant 3 jours" après l’action',
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
    label: '0b. [OBLIGATOIRE — passage de minuit] 00h10, "trois jours" en toutes lettres, contexte de nuit',
    transcript: 'Rappelle-moi tous les jours à 00h10 de tester Pensif pendant trois jours.',
    context: FIXED_CONTEXT_NIGHT,
    check: (p) => {
      const r = p[0]?.reminder;
      const rec = r?.recurrence;
      const ok =
        p.length === 1 &&
        p[0].texte === 'Tester Pensif' &&
        r?.hasReminder === true &&
        r.time === '00:10' &&
        rec?.detected === true &&
        rec.frequency === 'daily' &&
        rec.occurrenceCount === 3;
      return { ok, detail: `texte="${p[0]?.texte}", reminder=${JSON.stringify(r)}` };
    },
  },
  // --- 12 cas recurrence déjà validés (repris à l'identique de benchmark-capture-recurrence.ts) ---
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
        p[0].reminder.date === '2026-09-19' &&
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
      return { ok, detail: `recurrence=${JSON.stringify(r)} — doit être frequency="unclear", daysOfWeek=null` };
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
  {
    label: '12. "pendant N jours" APRÈS l’action (structure iPhone, contexte matin)',
    transcript: 'Rappelle-moi tous les jours à 20h39 de tester Pensif pendant 3 jours.',
    check: (p) => {
      const r = p[0]?.reminder.recurrence;
      const ok = p.length === 1 && r?.detected === true && r.frequency === 'daily' && r.occurrenceCount === 3 && p[0].reminder.time === '20:39';
      return { ok, detail: `reminder=${JSON.stringify(p[0]?.reminder)}` };
    },
  },
];

type CallResult = { outcome: ValidationOutcome; latencyMs: number; error: string | null };

async function callMini(transcript: string, context: TemporalContext): Promise<CallResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { outcome: { ok: false, parseError: 'OPENAI_API_KEY absent', category: 'unknown' }, latencyMs: 0, error: 'clé absente' };
  const start = performance.now();
  try {
    // Appel DIRECT du provider de production réel — buildOpenaiRequestBody → attemptOpenaiExtraction
    // → retry wrapper → parsing réel, aucun fetch hand-roulé (voir en-tête).
    const raw = await openaiLlmProvider.extract(transcript, context, { model: TARGET_MODEL });
    return { outcome: validateLlmOutput(raw), latencyMs: performance.now() - start, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { outcome: { ok: false, parseError: message, category: 'unknown' }, latencyMs: performance.now() - start, error: message };
  }
}

async function run() {
  const lines: string[] = [];
  lines.push('# Benchmark dédié — GPT-5-mini via openaiLlmProvider.extract RÉEL (cible standardisation)\n');
  lines.push(
    `Modèle CIBLE explicite : \`${TARGET_MODEL}\` (ne dépend d'aucun secret \`LLM_MODEL\` actuel). reasoning_effort = \`${
      Deno.env.get('OPENAI_REASONING_EFFORT') ?? 'low (défaut openai.ts)'
    }\`. Appel direct du provider de production réel (retry wrapper inclus).\n`,
  );

  let passCount = 0;
  for (const c of CASES) {
    const context = c.context ?? FIXED_CONTEXT_MORNING;
    console.log(`\n=== ${c.label} ===`);
    console.log(`  Transcript : "${c.transcript}" (contexte : ${context.localDateTime}, ${context.weekday})`);
    const r = await callMini(c.transcript, context);
    const pensees = r.outcome.ok ? r.outcome.pensees : [];
    const check = r.outcome.ok ? c.check(pensees) : { ok: false, detail: r.outcome.parseError };
    if (check.ok) passCount += 1;
    console.log(`  ${check.ok ? 'OK' : 'FAIL'} — ${check.detail}`);
    console.log(`  (${r.latencyMs.toFixed(0)}ms)${r.error ? ` erreur=${r.error}` : ''}`);

    lines.push(`## ${c.label}`);
    lines.push(`Transcript : "${c.transcript}" — contexte : ${context.localDateTime} (${context.weekday})\n`);
    lines.push(`- Résultat : ${check.ok ? '✅' : '❌'} — ${check.detail}`);
    lines.push(`- Pensées extraites (brut) : \`${JSON.stringify(pensees)}\``);
    lines.push(`- Latence : ${r.latencyMs.toFixed(0)}ms${r.error ? ` · erreur=${r.error}` : ''}`);
    lines.push('');
  }

  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Score : ${passCount}/${CASES.length}`);
  lines.push('- Cas 0a/0b sont les cas RÉELS du diagnostic iPhone (23h35 et 00h10, passage de minuit inclus).');

  const report = lines.join('\n');
  await Deno.writeTextFile('scripts/benchmark-capture-openai-mini-recurrence.report.md', report);
  console.log(`\nScore final : ${passCount}/${CASES.length}`);
  console.log('Rapport écrit dans scripts/benchmark-capture-openai-mini-recurrence.report.md');
}

await run();
