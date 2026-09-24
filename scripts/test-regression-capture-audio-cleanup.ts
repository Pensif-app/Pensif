// CHANTIER "Confidentialité V1 — nettoyage audio Capture" (2026-09-24). La logique pure
// (data/captureAudioCleanup.ts) est EXÉCUTÉE avec de faux fichiers ; le câblage CaptureScreen/captureAudio
// (react-native / expo-file-system) est vérifié par source-grep.
//
// Usage : npx tsx scripts/test-regression-capture-audio-cleanup.ts

import * as fs from 'fs';
import * as path from 'path';
import { DeletableFile, deleteAudioFile, runWithAudioCleanup } from '../src/data/captureAudioCleanup';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');

function fakeFile(exists: boolean, log: string[], throwOnDelete = false): DeletableFile {
  return {
    exists,
    delete: () => {
      log.push('delete');
      if (throwOnDelete) throw new Error('native failure');
    },
  };
}

(async () => {
  console.log('\n[deleteAudioFile] idempotent et jamais bloquant');
  {
    const log: string[] = [];
    deleteAudioFile('file:///cache/recording-1.m4a', () => fakeFile(true, log));
    check('fichier existant → delete appelé', log.join() === 'delete');

    const log2: string[] = [];
    deleteAudioFile('file:///cache/recording-2.m4a', () => fakeFile(false, log2));
    check('fichier absent → aucun delete, aucune erreur', log2.length === 0);

    let threw = false;
    try { deleteAudioFile('file:///x', () => fakeFile(true, [], true)); } catch { threw = true; }
    check('suppression qui throw → aucune erreur remontée', !threw);

    threw = false;
    try { deleteAudioFile('file:///x', () => { throw new Error('bad uri'); }); } catch { threw = true; }
    check('constructeur File qui throw (URI invalide) → aucune erreur remontée', !threw);

    const log3: string[] = [];
    deleteAudioFile(null, () => fakeFile(true, log3));
    deleteAudioFile(undefined, () => fakeFile(true, log3));
    deleteAudioFile('', () => fakeFile(true, log3));
    check('URI absente (null/undefined/vide) → no-op', log3.length === 0);

    const log4: string[] = [];
    deleteAudioFile('file:///cache/r.m4a', () => fakeFile(true, log4));
    deleteAudioFile('file:///cache/r.m4a', () => fakeFile(false, log4));
    check('idempotent : 2e appel (fichier déjà supprimé) → aucune erreur', log4.join() === 'delete');
  }

  console.log('\n[runWithAudioCleanup] cleanup APRÈS l’upload, succès ou erreur');
  {
    const events: string[] = [];
    const ok = await runWithAudioCleanup('file:///a.m4a', async () => { events.push('read+upload'); return 'transcript'; }, () => events.push('cleanup'));
    check('succès transcription → résultat propagé + cleanup appelé', ok === 'transcript' && events.includes('cleanup'));
    check('AUCUN cleanup avant la lecture/upload : ordre read+upload → cleanup', events.join() === 'read+upload,cleanup', events.join());

    const events2: string[] = [];
    let caught: unknown = null;
    try {
      await runWithAudioCleanup('file:///b.m4a', async () => { events2.push('upload'); throw new Error('stt_failed'); }, () => events2.push('cleanup'));
    } catch (e) { caught = e; }
    check('échec transcription / erreur réseau → erreur propagée telle quelle', caught instanceof Error && caught.message === 'stt_failed');
    check('échec transcription → cleanup appelé (après l’upload)', events2.join() === 'upload,cleanup', events2.join());

    const events3: string[] = [];
    let cleanupDuringWork = false;
    await runWithAudioCleanup('file:///c.m4a', async () => { cleanupDuringWork = events3.includes('cleanup'); events3.push('work'); }, () => events3.push('cleanup'));
    check('cleanup jamais déclenché pendant le travail', cleanupDuringWork === false);
  }

  console.log('\n[Câblage] CaptureScreen — tous les chemins où un fichier existe');
  {
    const screen = read('src', 'screens', 'CaptureScreen.tsx');
    const lib = read('src', 'lib', 'captureAudio.ts');
    check('helper deleteCaptureAudioFile utilise l’API MODERNE (File de expo-file-system), jamais legacy/deleteAsync', /import \{ File \} from 'expo-file-system';/.test(lib) && /new File\(u\)/.test(lib) && !/expo-file-system\/legacy|deleteAsync\(/.test(lib));
    check('API legacy absente de tout src', !/expo-file-system\/legacy|FileSystem\.deleteAsync/.test(screen + lib));
    check('tap trop court → deleteCaptureAudioFile(uri) avant le retour idle', /if \(isPressTooShort\(heldMs\)\) \{[\s\S]{0,400}deleteCaptureAudioFile\(uri\);\s*setPhase\('idle'\);\s*return;/.test(screen));
    check('silence → deleteCaptureAudioFile(uri) avant setPhase(\'silence\')', /if \(!voiceActivityRef\.current\.hasLikelySpeech\(\)\) \{\s*deleteCaptureAudioFile\(uri\);[^\n]*\n\s*setPhase\('silence'\);/.test(screen));
    check('upload : uploadAudioForCapture enveloppé par runWithAudioCleanup(uri, ..., deleteCaptureAudioFile)', /await runWithAudioCleanup\(uri, \(\) => uploadAudioForCapture\(\{ uri: uri!, filename, mimeType \}\), deleteCaptureAudioFile\)/.test(screen));
    check('uploadAudioForCapture n’est appelé qu’à cet endroit (jamais avant/ailleurs sans cleanup)', (screen.match(/uploadAudioForCapture\(/g) ?? []).length === 1);
    check('aucun cleanup avant la garde silence / avant l’upload sur le chemin nominal', screen.indexOf('runWithAudioCleanup(uri') > screen.indexOf('hasLikelySpeech()'));
    check('contenu audio jamais journalisé par le helper', !/console\./.test(lib + read('src', 'data', 'captureAudioCleanup.ts')));
  }

  console.log('\n[Limite documentée] unmount pendant un enregistrement actif');
  {
    const screen = read('src', 'screens', 'CaptureScreen.tsx');
    check('comportement sûr conservé : recorder.stop().catch(() => {}) au démontage, sans lecture de recorder.uri après libération', /if \(isRecordingRef\.current\) \{\s*recorder\.stop\(\)\.catch\(\(\) => \{\}\);\s*\}/.test(screen));
  }

  console.log('\n[Non-régression] STT / upload / backend / wording tutoriel');
  {
    const api = read('src', 'lib', 'captureApi.ts');
    check('captureApi.ts inchangé fonctionnellement (fetch(uri) → Blob → FormData audio)', /const audioResponse = await fetch\(input\.uri\);/.test(api) && /form\.append\('audio', audioBlob, input\.filename\);/.test(api));
    const tuto = read('src', 'data', 'tutorial.ts');
    // Tutoriel simplifié (2026-09-24) : les textes sont dans les images (assets/tutorial/tuto-capture.png, bulle
    // « Ta voix sert uniquement à transformer ta capture en pensée. », vérifiée visuellement) ; le code ne porte
    // plus aucune promesse de confidentialité.
    check('tutoriel : le code ne contient plus aucun texte de confidentialité (les textes vivent dans les images)', !/supprimé|stocké|sécurité|voix/i.test(tuto.replace(/^\s*\/\/.*$/gm, '')));
    check('tutoriel : aucune promesse "supprimé juste après / jamais stocké / reste en sécurité"', !/supprimé juste après|jamais stocké|reste en sécurité/i.test(tuto));
    const pkg = JSON.parse(read('package.json'));
    check('expo-file-system ajouté en dépendance directe (version choisie par expo install)', /^~57\./.test(pkg.dependencies['expo-file-system'] ?? ''), String(pkg.dependencies['expo-file-system']));
  }

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
})();
