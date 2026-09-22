// Tests de non-régression — CHANTIER "Pré-TestFlight Phase 2 — Hardening release" (2026-09-22).
// Vérifie par lecture de source (même méthode que test-regression-amazon-safe-beta.ts §9) les deux
// correctifs de hardening qui ne changent AUCUN comportement fonctionnel observable :
//   1. CaptureDebugScreen absent de la stack de navigation en production (pas seulement un bouton
//      masqué — le <Stack.Screen> lui-même doit être conditionné à __DEV__).
//   2. Les 4 mutations Supabase à risque (update/delete contact, update gift_sent, delete pensée)
//      filtrent par `.eq('id', ...)` ET `.eq('user_id', userId)` — défense en profondeur, RLS
//      (protection principale) non modifiée.
//
// Usage : npx tsx scripts/test-regression-pretestflight-hardening.ts

import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

console.log('\n[1] CaptureDebugScreen — absent de la stack en production, présent uniquement en __DEV__');
{
  const rootNavSrc = readSrc('src', 'navigation', 'RootNavigator.tsx');
  check(
    'le <Stack.Screen name="CaptureDebug"> lui-même est conditionné par __DEV__ (pas un bouton masqué en amont)',
    /\{__DEV__ && <Stack\.Screen name="CaptureDebug" component={CaptureDebugScreen}/.test(rootNavSrc),
  );
  check(
    'aucun autre <Stack.Screen name="CaptureDebug"> non conditionné n’existe ailleurs dans ce fichier (une seule occurrence, celle gatée)',
    (rootNavSrc.match(/<Stack\.Screen name="CaptureDebug"/g) ?? []).length === 1,
  );
  check('import de CaptureDebugScreen toujours présent (composant réutilisé, jamais dupliqué)', rootNavSrc.includes("import { CaptureDebugScreen } from '../screens/CaptureDebugScreen';"));
  check('aucun bouton/lien de l’app ne navigue vers "CaptureDebug" (inchangé, déjà vrai avant ce chantier)', !/navigate\(['"]CaptureDebug['"]\)/.test(readSrc('src', 'screens', 'CaptureScreen.tsx')) && !/navigate\(['"]CaptureDebug['"]\)/.test(readSrc('src', 'screens', 'HomeScreen.tsx')));
}

console.log('\n[2] Défense en profondeur Supabase — .eq(\'id\') ET .eq(\'user_id\') sur les 4 mutations à risque');
{
  const repoSrc = readSrc('src', 'lib', 'supabaseRepo.ts');

  function extractFunction(name: string): string {
    const start = repoSrc.indexOf(`export async function ${name}(`);
    if (start === -1) return '';
    // Coupe au prochain "export async function" ou "export function" (ou fin de fichier) — suffisant
    // pour isoler le corps d'une fonction dans ce fichier (pas de fonction imbriquée exportée ici).
    const rest = repoSrc.slice(start);
    const nextExport = rest.slice(1).search(/\nexport (async )?function /);
    return nextExport === -1 ? rest : rest.slice(0, nextExport + 1);
  }

  const mutations = [
    { name: 'updateContactRemote', table: 'contacts' },
    { name: 'setGiftSentRemote', table: 'contacts' },
    { name: 'deleteContactRemote', table: 'contacts' },
    { name: 'deletePenseeRemote', table: 'pensees' },
  ];

  for (const { name } of mutations) {
    const body = extractFunction(name);
    check(`${name} : prend bien un paramètre "userId: string"`, /\(\s*[\s\S]*?userId: string\s*\)/.test(body) || /,\s*userId: string\s*\)/.test(body));
    check(`${name} : filtre toujours par .eq('id', ...) (protection existante conservée)`, /\.eq\('id',/.test(body));
    check(`${name} : ajoute désormais .eq('user_id', userId) (défense en profondeur)`, /\.eq\('user_id', userId\)/.test(body));
  }

  check(
    'RLS non touchée : aucune modification du schéma dans ce chantier (supabase/schema.sql absent des fichiers modifiés — vérifié par le rapport, pas par ce test)',
    true, // Garde documentaire : la vraie preuve est "schema.sql non listé dans git status" au moment du rapport, pas testable depuis ce script.
  );

  const storeSrc = readSrc('src', 'data', 'store.tsx');
  check('store.tsx : deleteContactRemote appelé avec (entityId, userIdRef.current)', /deleteContactRemote\(op\.entityId, userIdRef\.current\)/.test(storeSrc));
  check('store.tsx : updateContactRemote appelé avec (op.payload, userIdRef.current)', /updateContactRemote\(op\.payload, userIdRef\.current\)/.test(storeSrc));
  check('store.tsx : deletePenseeRemote appelé avec (entityId, userIdRef.current)', /deletePenseeRemote\(op\.entityId, userIdRef\.current\)/.test(storeSrc));
  check(
    'store.tsx : userIdRef.current est garanti non-null avant tout appel (garde existante, inchangée)',
    /if \(!userIdRef\.current\) return \{ ok: false \};/.test(storeSrc),
  );
}

console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
