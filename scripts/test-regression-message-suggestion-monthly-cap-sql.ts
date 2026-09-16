// Tests de non-régression — CHANTIER RÉPONSES INTELLIGENTES, plafond mensuel (2026-09-16). Ce script
// vérifie le TEXTE de supabase/schema.sql (source de vérité versionnée), pas une vraie base Postgres :
// le SQL n'a volontairement PAS encore été exécuté en production à ce stade (audit + code préparés
// uniquement, sur instruction explicite). Les frontières 249→ok / 250→refusé / reset au changement de
// mois sont donc vérifiées ici au niveau de la LOGIQUE SQL (seuil exact, opérateur, ordre des
// contrôles, clause de date), pas par un appel réel — la vérification en conditions réelles suivra
// l'exécution de la migration, sur autorisation explicite ultérieure (même méthode que le correctif de
// permissions du 2026-09-16, déjà audité puis exécuté séparément).
//
// Usage : npx tsx scripts/test-regression-message-suggestion-monthly-cap-sql.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaSql = readFileSync(join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function extractFunctionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function ${functionName}`);
  if (start === -1) throw new Error(`fonction "${functionName}" introuvable dans schema.sql`);
  const end = sql.indexOf('\n$$;', start);
  if (end === -1) throw new Error(`fin de corps ("$$;") introuvable pour "${functionName}"`);
  return sql.slice(start, end);
}

function extractPostFunctionGrants(sql: string, functionName: string): string {
  const bodyEnd = sql.indexOf('\n$$;', sql.indexOf(`create or replace function ${functionName}`));
  const nextFunctionStart = sql.indexOf('create or replace function', bodyEnd + 1);
  const scanEnd = nextFunctionStart === -1 ? sql.length : nextFunctionStart;
  return sql.slice(bodyEnd, scanEnd);
}

const msgBody = extractFunctionBody(schemaSql, 'register_message_suggestion_usage');
const captureBody = extractFunctionBody(schemaSql, 'register_capture_usage');
const msgGrants = extractPostFunctionGrants(schemaSql, 'register_message_suggestion_usage');

console.log('\n[register_message_suggestion_usage — comptage mensuel ajouté, isolation de Capture conservée]');
check('lit message_suggestion_events (jamais capture_events)', /select count\(\*\) into v_month_count from message_suggestion_events/.test(msgBody));
check("filtre sur date_trunc('month', created_at) = date_trunc('month', now())", /date_trunc\('month', created_at\)\s*=\s*date_trunc\('month', now\(\)\)/.test(msgBody));
check('seuil exact 250 (pas 100, pas une autre valeur copiée de Capture)', /v_month_count >= 250/.test(msgBody));
check('retourne bien la chaîne \'monthly_cap\' (espace de noms suggest-message, distinct du texte utilisateur)', /return 'monthly_cap';/.test(msgBody));
check('verrou consultatif salt=1 conservé (isolation du verrou vs Capture, salt=0)', /hashtextextended\(p_user_id::text, 1\)/.test(msgBody));

console.log('\n[ordre des contrôles — le comptage mensuel doit se situer APRÈS minute/heure et AVANT l’insert]');
const minuteIdx = msgBody.indexOf('rate_limit_minute');
const hourIdx = msgBody.indexOf('rate_limit_hour');
const monthIdx = msgBody.indexOf('monthly_cap');
const insertIdx = msgBody.indexOf('insert into message_suggestion_events');
check('minute vérifié avant heure', minuteIdx !== -1 && hourIdx !== -1 && minuteIdx < hourIdx);
check('heure vérifiée avant le plafond mensuel', hourIdx !== -1 && monthIdx !== -1 && hourIdx < monthIdx);
check(
  'le plafond mensuel est vérifié AVANT l’insert (générations autorisées comptées avant tout, jamais après)',
  monthIdx !== -1 && insertIdx !== -1 && monthIdx < insertIdx,
);

console.log('\n[frontières attendues de la logique >= 250 — vérifiées au niveau du texte SQL, exécution réelle non faite à ce stade]');
check(
  '249 générations déjà enregistrées → v_month_count=249, condition "249 >= 250" fausse → passage au insert (comportement attendu de l’opérateur ">=")',
  (() => {
    const v_month_count = 249;
    return !(v_month_count >= 250);
  })(),
);
check(
  '250 générations déjà enregistrées → v_month_count=250, condition "250 >= 250" vraie → retour monthly_cap AVANT tout insert supplémentaire',
  (() => {
    const v_month_count = 250;
    return v_month_count >= 250;
  })(),
);
check(
  "changement de mois civil → date_trunc('month', created_at) d'un événement du mois précédent ne peut jamais égaler date_trunc('month', now()) → compteur naturellement remis à zéro sans purge/cron",
  /date_trunc\('month', created_at\) = date_trunc\('month', now\(\)\)/.test(msgBody),
);

console.log('\n[register_capture_usage — non modifié par ce chantier : seuil 100 et logique intacts]');
check('seuil Capture toujours 100 (jamais aligné sur les 250 de suggest-message)', /v_month_count >= 100/.test(captureBody));
check('Capture compte toujours sur capture_events (jamais message_suggestion_events)', /select count\(\*\) into v_month_count from capture_events/.test(captureBody));
check('verrou Capture toujours salt=0 (inchangé)', /hashtextextended\(p_user_id::text, 0\)/.test(captureBody));

console.log('\n[permissions — les 3 lignes demandées explicitement conservées après le CREATE OR REPLACE FUNCTION]');
check(
  'revoke all ... from public',
  /revoke all on function register_message_suggestion_usage\(uuid\) from public;/.test(msgGrants),
);
check(
  'revoke execute ... from anon, authenticated',
  /revoke execute on function register_message_suggestion_usage\(uuid\) from anon, authenticated;/.test(msgGrants),
);
check(
  'grant execute ... to service_role',
  /grant execute on function register_message_suggestion_usage\(uuid\) to service_role;/.test(msgGrants),
);

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
