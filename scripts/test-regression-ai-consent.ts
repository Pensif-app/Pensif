/// <reference types="node" />
// Tests de non-régression — CHANTIER "App Review 5.1.1(i)/5.1.2(i)" (2026-10-14) : consentement explicite avant tout
// partage de données avec une IA tierce (Groq/OpenAI). Logique pure EXÉCUTÉE (aiConsent.ts, aiConsentGate.ts) + câblage
// vérifié par lecture du source (écrans, store, couche réseau) — mêmes conventions que test-regression-auth-gate.ts.
//
// Usage : npx tsx scripts/test-regression-ai-consent.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  AI_CONSENT_COPY,
  AI_CONSENT_VERSION,
  aiConsentRevocationKey,
  aiConsentStorageKey,
  hasValidConsent,
  parseConsentRecord,
  parseRevocationRecord,
  withConsentGranted,
  withConsentRevoked,
  AiConsentRecord,
} from '../src/data/aiConsent';
import { createAiConsentController, ConsentStorage } from '../src/data/aiConsentController';
import { selectKeysToPurge } from '../src/data/accountDeletion';
import { AiConsentRequiredError, assertAiConsent, isAiConsentGranted, setAiConsentSnapshot } from '../src/lib/aiConsentGate';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
function throwsConsent(scope: 'voiceCapture' | 'smartReplies'): boolean {
  try {
    assertAiConsent(scope);
    return false;
  } catch (e) {
    return e instanceof AiConsentRequiredError;
  }
}
const NOW = new Date('2026-10-14T10:00:00Z');

console.log('0. Échec fermé par défaut');
setAiConsentSnapshot(null, {});
check('aucun snapshot : capture vocale bloquée', throwsConsent('voiceCapture'));
check('aucun snapshot : réponses intelligentes bloquées', throwsConsent('smartReplies'));
check('même un enregistrement valide est ignoré sans compte (userId null)', (setAiConsentSnapshot(null, withConsentGranted({}, 'voiceCapture', NOW)), throwsConsent('voiceCapture')));

console.log('1-2. Première capture vocale + refus');
{
  const record: AiConsentRecord = {};
  setAiConsentSnapshot('user-A', record);
  check('1. première capture : consentement absent → demande requise (envoi bloqué)', !hasValidConsent(record, 'voiceCapture') && throwsConsent('voiceCapture'));
  // Refus = aucune écriture du record (le store n'appelle grant que sur "Autoriser").
  check('2. refus : le record reste vide, aucun transfert possible', Object.keys(record).length === 0 && throwsConsent('voiceCapture'));
}

console.log('3-4. Acceptation puis nouvelle capture');
{
  const granted = withConsentGranted({}, 'voiceCapture', NOW);
  setAiConsentSnapshot('user-A', granted);
  check('3. acceptation : envoi autorisé', hasValidConsent(granted, 'voiceCapture') && !throwsConsent('voiceCapture'));
  check('3. acceptation capture n\'ouvre PAS le périmètre réponses intelligentes', throwsConsent('smartReplies'));
  const reloaded = parseConsentRecord(JSON.stringify(granted));
  setAiConsentSnapshot('user-A', reloaded);
  check('4. nouvelle capture (redémarrage, record relu) : pas de nouvelle demande, envoi autorisé', hasValidConsent(reloaded, 'voiceCapture') && !throwsConsent('voiceCapture'));
}

console.log('6-8. Réponses intelligentes (demande distincte, refus, acceptation)');
{
  const onlyVoice = withConsentGranted({}, 'voiceCapture', NOW);
  setAiConsentSnapshot('user-A', onlyVoice);
  check('6. première utilisation : demande spécifique (capture vocale accordée ≠ réponses intelligentes)', !hasValidConsent(onlyVoice, 'smartReplies') && throwsConsent('smartReplies'));
  check('7. refus : aucune transmission', throwsConsent('smartReplies'));
  const both = withConsentGranted(onlyVoice, 'smartReplies', NOW);
  setAiConsentSnapshot('user-A', both);
  check('8. acceptation : génération autorisée', !throwsConsent('smartReplies') && !throwsConsent('voiceCapture'));
  check('copies distinctes : titres et destinataires différents', AI_CONSENT_COPY.voiceCapture.title !== AI_CONSENT_COPY.smartReplies.title);
}

console.log('9. Révocation');
{
  const both = withConsentGranted(withConsentGranted({}, 'voiceCapture', NOW), 'smartReplies', NOW);
  const afterRevoke = withConsentRevoked(both, 'voiceCapture');
  setAiConsentSnapshot('user-A', afterRevoke);
  check('capture vocale révoquée : nouveaux envois bloqués', throwsConsent('voiceCapture'));
  check('réponses intelligentes non affectées par la révocation de la capture', !throwsConsent('smartReplies'));
  check('révoquer ne mute pas le record d\'origine', hasValidConsent(both, 'voiceCapture'));
  const afterBoth = withConsentRevoked(afterRevoke, 'smartReplies');
  setAiConsentSnapshot('user-A', afterBoth);
  check('tout révoqué : tout bloqué', throwsConsent('voiceCapture') && throwsConsent('smartReplies') && Object.keys(afterBoth).length === 0);
}

console.log('10. Changement de compte');
{
  check('clé de stockage propre à chaque compte', aiConsentStorageKey('user-A') !== aiConsentStorageKey('user-B'));
  check('clé préfixée `pensif.` (purgée avec la suppression de compte, selectKeysToPurge)', aiConsentStorageKey('user-A').startsWith('pensif.'));
  const recordA = withConsentGranted({}, 'voiceCapture', NOW);
  setAiConsentSnapshot('user-A', recordA);
  check('compte A : autorisé', isAiConsentGranted('voiceCapture'));
  // Le store remet le snapshot à {} dès que userId change, avant de lire le record du nouveau compte (échec fermé).
  setAiConsentSnapshot('user-B', {});
  check('compte B (record pas encore lu / absent) : bloqué, le consentement de A n\'est pas réutilisé', throwsConsent('voiceCapture'));
  setAiConsentSnapshot(null, {});
  check('déconnexion (userId null) : bloqué', throwsConsent('voiceCapture'));
  const store = read('src', 'data', 'store.tsx');
  const sites = Array.from(store.matchAll(/userIdRef\.current = (null|session\.userId);\n(\s*)(bindAiConsentOwner\((null|session\.userId)\);)?/g));
  check('store : CHAQUE changement de userIdRef est suivi synchroniquement de bindAiConsentOwner (' + sites.length + ' sites)', sites.length >= 5 && sites.every((m) => Boolean(m[3])), JSON.stringify(sites.map((m) => [m[1], Boolean(m[3])])));
  check('store : aucune lecture asynchrone directe du consentement hors contrôleur', !/AsyncStorage\.getItem\(aiConsentStorageKey/.test(store));
  check('store : contrôleur pur utilisé', /createAiConsentController\(/.test(store));
}

console.log('Versionnage + lecture défensive');
{
  const old: AiConsentRecord = { voiceCapture: { version: AI_CONSENT_VERSION.voiceCapture - 1, grantedAt: NOW.toISOString() } };
  check('périmètre modifié (version plus ancienne) → consentement invalide, redemandé', !hasValidConsent(old, 'voiceCapture'));
  check('JSON corrompu → aucun consentement', Object.keys(parseConsentRecord('{pas du json')).length === 0);
  check('valeur null → aucun consentement', Object.keys(parseConsentRecord(null)).length === 0);
  check('structure inattendue (version non numérique) → ignorée', !hasValidConsent(parseConsentRecord('{"voiceCapture":{"version":"1","grantedAt":"x"}}'), 'voiceCapture'));
  check('clés inconnues ignorées', Object.keys(parseConsentRecord('{"autre":{"version":1,"grantedAt":"x"}}')).length === 0);
}

console.log('Dialogue Réponses intelligentes — contenu exact, version, redemande');
{
  const copy = AI_CONSENT_COPY.smartReplies;
  const required: [string, RegExp][] = [
    ['prénom du proche', /prénom du proche/],
    ['genre', /son genre/],
    ['relation avec l’utilisateur', /sa relation avec vous/],
    ['rôle familial', /rôle familial/],
    ['occasion concernée', /l’occasion concernée/],
    ['centres d’intérêt', /centres d’intérêt/],
    ['souhait issu du quiz', /son souhait, issus du quiz/],
    ['jusqu’à cinq pensées récentes concernant ce proche', /jusqu’à cinq pensées récentes concernant ce proche/],
    ['destinataire OpenAI', /transmettre à OpenAI/],
    ['informations personnelles sur d’autres personnes', /informations personnelles sur d’autres personnes/],
  ];
  for (const [label, re] of required) check(`dialogue : mentionne « ${label} »`, re.test(copy.message));
  check('dialogue : boutons « Refuser » / « Autoriser » inchangés', copy.refuseLabel === 'Refuser' && copy.allowLabel === 'Autoriser');
  check('version Réponses intelligentes incrémentée (2), capture vocale inchangée (1)', AI_CONSENT_VERSION.smartReplies === 2 && AI_CONSENT_VERSION.voiceCapture === 1);
  const accepted = { grantedAt: NOW.toISOString(), version: 1 };
  const oldAccepted: AiConsentRecord = { smartReplies: accepted, voiceCapture: accepted };
  check('accord v1 des Réponses intelligentes → invalide (le nouveau dialogue est redemandé)', !hasValidConsent(oldAccepted, 'smartReplies'));
  check('accord v1 de la capture vocale → toujours valide (texte inchangé)', hasValidConsent(oldAccepted, 'voiceCapture'));
  setAiConsentSnapshot('user-A', oldAccepted);
  check('verrou réseau : envoi Réponses intelligentes bloqué tant que la v2 n’est pas acceptée', throwsConsent('smartReplies') && !throwsConsent('voiceCapture'));
  setAiConsentSnapshot(null, {});
  const ctx = read('src', 'data', 'messageSuggestion.ts');
  check('données envoyées inchangées : contact {prenom, genre, relation, familyRole}', /contact: \{ prenom: contact\.prenom, genre: contact\.genre, relation: contact\.relation, familyRole: contact\.familyRole \}/.test(ctx));
  check('données envoyées inchangées : quiz {interests, wish} et 5 pensées maximum', /interests: contact\.quiz\.interests/.test(ctx) && /\.slice\(0, 5\)/.test(ctx));
}

console.log('5 + 11. Câblage : Réessayer, erreurs réseau, ordre des gardes (source)');
{
  const captureApi = read('src', 'lib', 'captureApi.ts');
  const invokeBody = captureApi.slice(captureApi.indexOf('async function invokeCaptureFunction'));
  check("captureApi : assertAiConsent('voiceCapture') AVANT le client supabase dans invokeCaptureFunction (donc aussi reextractCapture)", invokeBody.indexOf("assertAiConsent('voiceCapture')") !== -1 && invokeBody.indexOf("assertAiConsent('voiceCapture')") < invokeBody.indexOf('if (!supabase)'));
  const uploadBody = captureApi.slice(captureApi.indexOf('export async function uploadAudioForCapture'));
  check("captureApi : uploadAudioForCapture vérifie le consentement AVANT de lire le fichier audio", uploadBody.indexOf("assertAiConsent('voiceCapture')") !== -1 && uploadBody.indexOf("assertAiConsent('voiceCapture')") < uploadBody.indexOf('await fetch(input.uri)'));
  check('captureApi : reextractCapture passe par invokeCaptureFunction (verrouillé)', /export async function reextractCapture[\s\S]*return invokeCaptureFunction\(/.test(captureApi));
  const msgApi = read('src', 'lib', 'messageSuggestionApi.ts');
  const reqBody = msgApi.slice(msgApi.indexOf('export async function requestMessageSuggestion'));
  check("messageSuggestionApi : assertAiConsent('smartReplies') AVANT tout appel réseau", reqBody.indexOf("assertAiConsent('smartReplies')") !== -1 && reqBody.indexOf("assertAiConsent('smartReplies')") < reqBody.indexOf('supabase.functions.invoke'));
  check('le verrou ne dépend pas de l\'état réseau (indépendant de NetInfo/erreurs)', !/NetInfo|isConnected/.test(read('src', 'lib', 'aiConsentGate.ts')));

  const capture = read('src', 'screens', 'CaptureScreen.tsx');
  const pressIn = capture.slice(capture.indexOf('async function handlePressIn'), capture.indexOf('async function handlePressOut'));
  const iConsent = pressIn.indexOf("hasAiConsent('voiceCapture')");
  check('CaptureScreen.handlePressIn : consentement vérifié', iConsent !== -1);
  check('…AVANT la vérification réseau, la permission micro et recorder.record()', iConsent < pressIn.indexOf('NetInfo.fetch') && iConsent < pressIn.indexOf('requestRecordingPermissionsAsync') && iConsent < pressIn.indexOf('recorder.record()'));
  check('…refus/dismiss : retour immédiat sans enregistrement (return avant record)', /if \(accepted && \(await grantAiConsent\('voiceCapture'\)\)\) setConsentJustGranted\(true\);\s*\n\s*busyRef\.current = false;\s*\n\s*return;/.test(pressIn));
  const retry = capture.slice(capture.indexOf('async function handleRetryAnalysis'), capture.indexOf('function handleDiscard'));
  check('CaptureScreen.handleRetryAnalysis : consentement vérifié AVANT reextractCapture', retry.indexOf("hasAiConsent('voiceCapture')") !== -1 && retry.indexOf("hasAiConsent('voiceCapture')") < retry.indexOf('reextractCapture('));
  check('…refus : return sans envoi', /if \(!accepted \|\| !\(await grantAiConsent\('voiceCapture'\)\)\) return;/.test(retry));

  const message = read('src', 'screens', 'MessageScreen.tsx');
  const gen = message.slice(message.indexOf('async function handleGenerate()'), message.indexOf('function handleGenerateButtonPress'));
  check('MessageScreen.handleGenerate : consentement AVANT requestMessageSuggestion', gen.indexOf("hasAiConsent('smartReplies')") !== -1 && gen.indexOf("hasAiConsent('smartReplies')") < gen.indexOf('requestMessageSuggestion('));
  check('…refus : généré arrêté, garde anti-double-tap libérée, aucun appel réseau', /generatingRef\.current = false;\s*\n\s*return;/.test(gen));
  check('…le brouillon n\'est pas modifié au refus (setDrafts uniquement après l\'appel réseau)', gen.indexOf('setDrafts') > gen.indexOf('requestMessageSuggestion('));
}

console.log('12. Parcours non liés à l\'IA inchangés + aucun appel IA hors des deux modules verrouillés');
{
  const srcDir = path.join(__dirname, '..', 'src');
  const offenders: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        if (/functions\.invoke\(/.test(content) && !/captureApi\.ts$|messageSuggestionApi\.ts$|accountDeletionApi\.ts$/.test(entry.name)) offenders.push(full);
      }
    }
  })(srcDir);
  check('aucun appel functions.invoke en dehors de captureApi / messageSuggestionApi / accountDeletionApi', offenders.length === 0, offenders.join(', '));
  const del = read('src', 'lib', 'accountDeletionApi.ts');
  check("accountDeletionApi n'appelle que 'delete-account' (aucun service d'IA)", /invoke\('delete-account'/.test(del) && !/invoke\('(capture|suggest-message)'/.test(del));
  const auth = read('src', 'lib', 'authRepo.ts');
  check('authentification OTP inchangée par ce chantier (aucune référence au consentement)', !/aiConsent|AiConsent/.test(auth));
  const notif = read('src', 'lib', 'notifications.ts');
  check('rappels/notifications inchangés (aucune référence au consentement)', !/aiConsent|AiConsent/.test(notif));
}

console.log('Réglages : activation explicite, révocation, destinataires visibles');
{
  const settings = read('src', 'screens', 'SettingsScreen.tsx');
  check('Réglages : section SERVICES D’IA', /SERVICES D’IA/.test(settings));
  check('activer → dialogue askAiConsent avant grantAiConsent (jamais un simple basculement)', /if \(await askAiConsent\(scope\)\) await grantAiConsent\(scope\);/.test(settings));
  check('désactiver → revokeAiConsent immédiat', /if \(!enable\) \{[\s\S]{0,260}await revokeAiConsent\(scope\);/.test(settings));
  check("révocation non persistée → l'utilisateur est prévenu", /if \(!persisted\) \{[\s\S]{0,500}Alert\.alert\(\s*\n\s*'Désactivation non enregistrée'/.test(settings));
  const captureSrc = read('src', 'screens', 'CaptureScreen.tsx');
  check('indication discrète après autorisation (appuyer de nouveau)', /Autorisation enregistrée\. Maintenez le bouton pour enregistrer\./.test(captureSrc) && /setConsentJustGranted\(false\);/.test(captureSrc));
  check('état du Switch = consentement valide (jamais précoché)', /value=\{hasValidConsent\(aiConsent, scope\)\}/.test(settings));
  check('destinataires nommés dans les textes : Groq et OpenAI', /Groq/.test(AI_CONSENT_COPY.voiceCapture.message) && /OpenAI/.test(AI_CONSENT_COPY.voiceCapture.message) && /OpenAI/.test(AI_CONSENT_COPY.smartReplies.message));
  check('données énumérées : audio, texte transcrit / proche, occasion, quiz, 5 pensées', /audio/.test(AI_CONSENT_COPY.voiceCapture.message) && /cinq pensées/.test(AI_CONSENT_COPY.smartReplies.message) && /quiz/.test(AI_CONSENT_COPY.smartReplies.message));
  const prompt = read('src', 'lib', 'aiConsentPrompt.ts');
  check('dialogue : Refuser (cancel) + Autoriser, fermeture = refus', /style: 'cancel'/.test(prompt) && /onDismiss: \(\) => resolve\(false\)/.test(prompt));
}

// ---------------------------------------------------------------------------------------------
// Courses asynchrones — contrôleur pur avec faux stockage dont chaque lecture peut être suspendue.
// ---------------------------------------------------------------------------------------------
type Deferred = { promise: Promise<string | null>; resolve: (v: string | null) => void };
function deferred(): Deferred {
  let resolve!: (v: string | null) => void;
  const promise = new Promise<string | null>((r) => (resolve = r));
  return { promise, resolve };
}
type Fault = 'throw' | 'drop' | null;
type Faults = {
  write: (key: string, value: string) => Fault;
  remove: (key: string) => Fault;
  read: (key: string) => boolean; // true = la lecture échoue
};
function makeEnv(
  opts: {
    initial?: Record<string, string>;
    readGate?: (key: string) => Promise<string | null> | null;
    readGateAlways?: boolean;
    failWrites?: number | 'always';
    failRemoves?: number | 'always';
    faults?: Partial<Faults>;
  } = {},
) {
  const data: Record<string, string> = { ...(opts.initial ?? {}) };
  let writeFailures = opts.failWrites ?? 0;
  let removeFailures = opts.failRemoves ?? 0;
  const writes: string[] = [];
  const gatedOnce = new Set<string>();
  const faults: Faults = {
    write: opts.faults?.write ?? (() => null),
    remove: opts.faults?.remove ?? (() => null),
    read: opts.faults?.read ?? (() => false),
  };
  const storage: ConsentStorage = {
    read: async (key) => {
      if (faults.read(key)) throw new Error('lecture impossible');
      const gated = opts.readGate?.(key);
      if (gated && (opts.readGateAlways || !gatedOnce.has(key))) {
        gatedOnce.add(key);
        return gated;
      }
      return key in data ? data[key] : null;
    },
    write: async (key, value) => {
      if (writeFailures === 'always' || (typeof writeFailures === 'number' && writeFailures > 0)) {
        if (typeof writeFailures === 'number') writeFailures--;
        throw new Error('écriture impossible');
      }
      const fault = faults.write(key, value);
      if (fault === 'throw') throw new Error('écriture impossible');
      if (fault === 'drop') return; // « réussit » sans rien stocker : seule la relecture peut le détecter
      writes.push(key);
      data[key] = value;
    },
    remove: async (key) => {
      if (removeFailures === 'always' || (typeof removeFailures === 'number' && removeFailures > 0)) {
        if (typeof removeFailures === 'number') removeFailures--;
        throw new Error('suppression impossible');
      }
      const fault = faults.remove(key);
      if (fault === 'throw') throw new Error('suppression impossible');
      if (fault === 'drop') return;
      delete data[key];
    },
  };
  const published: AiConsentRecord[] = [];
  const controller = createAiConsentController({
    storage,
    publish: (owner, record) => {
      published.push(record);
      setAiConsentSnapshot(owner, record);
    },
    now: () => NOW,
  });
  return { controller, data, writes, published, faults };
}
/** Redémarrage simulé : nouveau contrôleur, stockage tel qu'il est resté, aucune panne. */
async function restart(env: { data: Record<string, string> }, owner = 'user-A') {
  const next = makeEnv({ initial: env.data });
  next.controller.bind(owner);
  await flush();
  return next;
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const keyA = aiConsentStorageKey('user-A');
const grantedVoice = JSON.stringify(withConsentGranted({}, 'voiceCapture', NOW));
const grantedSmart = JSON.stringify(withConsentGranted({}, 'smartReplies', NOW));

async function races() {
  console.log('Courses asynchrones (contrôleur) — refus, révocation, changement de compte');

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice } });
    env.controller.bind('user-A');
    await flush();
    check('R0 : record stocké relu → consentement valide pour le bon compte', env.controller.has('voiceCapture') && isAiConsentGranted('voiceCapture'));
    env.controller.bind('user-B');
    check('R1 : bind(B) est SYNCHRONE — le verrou réseau se ferme immédiatement, sans attendre de rendu', !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
    await flush();
    check("R1b : B n'hérite jamais du consentement de A", !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
    env.controller.bind(null);
    check('R12 : déconnexion (bind null) → tout bloqué immédiatement', !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
    env.controller.bind('user-A');
    await flush();
    check('R11 : retour sur le compte A → son consentement est relu', env.controller.has('voiceCapture'));
  }

  {
    const slow = deferred();
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, readGate: (key) => (key === keyA ? slow.promise : null) });
    env.controller.bind('user-A');
    env.controller.bind('user-B');
    slow.resolve(grantedVoice);
    await flush();
    check("R2 : une lecture périmée (compte A) ne s'applique jamais au compte B", !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
  }

  {
    const slow = deferred();
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, readGate: (key) => (key === keyA ? slow.promise : null) });
    env.controller.bind('user-A');
    const revoking = env.controller.revoke('voiceCapture');
    const publishedBeforeLoad = env.published.length;
    check('R3 : révocation pendant un chargement → effet IMMÉDIAT', !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
    slow.resolve(grantedVoice);
    await flush();
    check("R3a : AUCUNE publication transitoire de l'ancien accord vers le verrou réseau après la demande de révocation", env.published.slice(publishedBeforeLoad).every((r) => !hasValidConsent(r, 'voiceCapture')), JSON.stringify(env.published.slice(publishedBeforeLoad)));
    check('R3b : …et l\'ancienne lecture ne ressuscite jamais le consentement révoqué', !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
    const persisted = await revoking;
    check('R3c : révocation persistée (clé supprimée)', persisted === true && !(keyA in env.data));
  }

  {
    const slow = deferred();
    const env = makeEnv({ initial: { [keyA]: grantedSmart }, readGate: (key) => (key === keyA ? slow.promise : null) });
    env.controller.bind('user-A');
    const granting = env.controller.grant('voiceCapture');
    slow.resolve(grantedSmart);
    check('R4 : grant attend la fin du chargement et réussit', (await granting) === true);
    const stored = parseConsentRecord(env.data[keyA]);
    check("R4b : accorder la capture ne PERD PAS l'accord réponses intelligentes déjà stocké", hasValidConsent(stored, 'voiceCapture') && hasValidConsent(stored, 'smartReplies'));
  }

  {
    const slow = deferred();
    const env = makeEnv({ readGate: (key) => (key === keyA ? slow.promise : null) });
    env.controller.bind('user-A');
    const granting = env.controller.grant('voiceCapture');
    env.controller.bind('user-B');
    slow.resolve(null);
    const ok = await granting;
    check('R5 : accord demandé pour A mais compte changé en attendant → refusé, aucune écriture sous A', ok === false && !(keyA in env.data) && !env.controller.has('voiceCapture'));
  }

  {
    const env = makeEnv({ failWrites: 'always' });
    env.controller.bind('user-A');
    await flush();
    const ok = await env.controller.grant('voiceCapture');
    check('R6 : écriture impossible → accord valable pour la SESSION seulement (comportement défini)', ok === true && env.controller.has('voiceCapture') && !(keyA in env.data));
    const restarted = makeEnv({ initial: env.data });
    restarted.controller.bind('user-A');
    await flush();
    check("R6b : après redémarrage, rien n'a été persisté → la demande est refaite (jamais d'accord fantôme)", !restarted.controller.has('voiceCapture'));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, failWrites: 'always', failRemoves: 'always' });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    check("R7 : révocation non persistable → bloquée en mémoire ET signalée (false) pour prévenir l'utilisateur", persisted === false && !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, failRemoves: 1 });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    check('R8 : un échec transitoire est retenté (2e tentative) → révocation persistée', persisted === true && !(keyA in env.data));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice } });
    env.controller.bind('user-A');
    await flush();
    const revoking = env.controller.revoke('voiceCapture');
    const granting = env.controller.grant('voiceCapture');
    await Promise.all([revoking, granting]);
    check('R10 : révoquer puis ré-autoriser aussitôt → état final cohérent (autorisé, persisté)', env.controller.has('voiceCapture') && hasValidConsent(parseConsentRecord(env.data[keyA]), 'voiceCapture'));
  }

  {
    const env = makeEnv();
    env.controller.bind('user-A');
    await flush();
    check('R9 : refus (aucun grant appelé) → aucune écriture, aucun consentement', env.writes.length === 0 && !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
    env.controller.bind(null);
    check("R9b : sans compte, un accord ne peut pas être enregistré", (await env.controller.grant('voiceCapture')) === false);
  }

  {
    const env = makeEnv({ initial: { [keyA]: '{corrompu' } });
    env.controller.bind('user-A');
    await flush();
    check('R13 : stockage corrompu → aucun consentement (échec fermé)', !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
  }

  {
    let calls = 0;
    const env = makeEnv({
      readGateAlways: true,
      readGate: () => {
        calls++;
        return Promise.reject(new Error('lecture impossible'));
      },
    });
    env.controller.bind('user-A');
    await flush();
    check('R14 : lecture impossible (enregistrement ET trace) → aucun consentement (échec fermé)', calls >= 1 && !env.controller.has('voiceCapture') && throwsConsent('voiceCapture'));
  }

  console.log('Révocation durcie — trace distincte, relecture, pannes totales/partielles, redémarrages, comptes');
  const keyRevA = aiConsentRevocationKey('user-A');
  const keyB = aiConsentStorageKey('user-B');
  const isMain = (k: string) => k === keyA;
  const isTrace = (k: string) => k === keyRevA;
  const blocked = (c: { has: (s: 'voiceCapture' | 'smartReplies') => boolean }, s: 'voiceCapture' | 'smartReplies' = 'voiceCapture') => !c.has(s) && throwsConsent(s);

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, faults: { write: (k) => (isMain(k) ? 'throw' : null), remove: (k) => (isMain(k) ? 'throw' : null) } });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    check('H1 : enregistrement principal inécrivable, trace OK → révocation vérifiée (true)', persisted === true && blocked(env.controller));
    check("H1b : l'ancien accord est encore dans l'enregistrement principal (la trace est donc seule à protéger)", hasValidConsent(parseConsentRecord(env.data[keyA]), 'voiceCapture'));
    const after = await restart(env);
    check('H1c : après redémarrage, la trace est PRIORITAIRE → consentement invalide', blocked(after.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, faults: { write: (k) => (isTrace(k) ? 'throw' : null), remove: (k) => (isTrace(k) ? 'throw' : null) } });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    const after = await restart(env);
    check("H2 : trace inécrivable, enregistrement principal OK → révocation vérifiée (true), invalide après redémarrage", persisted === true && blocked(after.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, faults: { write: () => 'throw', remove: () => 'throw' } });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    check('H3 : panne TOTALE → jamais « enregistrée » (false) mais envois bloqués dans la session', persisted === false && blocked(env.controller));
    const after = await restart(env);
    check('H3b : RISQUE RÉSIDUEL NON RÉSOLU — panne totale puis redémarrage : l\'ancien accord REVIENT (rien n\'a pu être écrit)', after.controller.has('voiceCapture') === true);
    env.faults.write = () => null;
    env.faults.remove = () => null; // le stockage récupère
    const retried = await env.controller.revoke('voiceCapture');
    const afterRetry = await restart(env);
    check('H3c : « Réessayer » une fois le stockage rétabli → vérifié (true), invalide après redémarrage', retried === true && blocked(afterRetry.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, faults: { write: () => 'drop', remove: () => 'drop' } });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    check('H4 : écritures « réussies » mais perdues en silence → détectées par relecture, jamais annoncées enregistrées (false)', persisted === false && blocked(env.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, faults: { write: (k) => (isTrace(k) ? 'drop' : null), remove: (k) => (isTrace(k) ? 'drop' : null) } });
    env.controller.bind('user-A');
    await flush();
    const persisted = await env.controller.revoke('voiceCapture');
    const after = await restart(env);
    check("H5 : trace perdue en silence mais enregistrement principal vérifié → true, invalide après redémarrage", persisted === true && blocked(after.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice } });
    env.controller.bind('user-A');
    await flush();
    await env.controller.revoke('voiceCapture');
    const granted = await env.controller.grant('voiceCapture');
    const after = await restart(env);
    check('H6 : révoquer puis ré-autoriser explicitement → trace effacée, valide après redémarrage', granted === true && after.controller.has('voiceCapture') && !(keyRevA in env.data));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice } });
    env.controller.bind('user-A');
    await flush();
    await env.controller.revoke('voiceCapture');
    env.faults.write = (k) => (isTrace(k) ? 'throw' : null);
    env.faults.remove = (k) => (isTrace(k) ? 'throw' : null);
    const granted = await env.controller.grant('voiceCapture');
    check('H7 : nouvel accord dont la trace ne peut pas être effacée → valable pour la SESSION seulement', granted === true && env.controller.has('voiceCapture'));
    const after = await restart(env);
    check('H7b : …et au redémarrage la trace révoque encore (échec fermé, jamais d\'accord fantôme)', blocked(after.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice, [keyRevA]: JSON.stringify({ voiceCapture: NOW.toISOString() }) }, faults: { read: (k) => isTrace(k) } });
    env.controller.bind('user-A');
    await flush();
    check('H8 : trace illisible → aucun consentement (échec fermé), même si l\'enregistrement principal est valide', blocked(env.controller));
  }

  for (const [label, corrupt] of [['JSON invalide', '{oops'], ['tableau', '[]'], ['valeur non textuelle', '{"voiceCapture":5}']] as const) {
    const env = makeEnv({ initial: { [keyA]: grantedVoice + '', [keyRevA]: corrupt } });
    env.controller.bind('user-A');
    await flush();
    check(`H9 : trace corrompue (${label}) → aucun consentement (échec fermé)`, blocked(env.controller));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice, [keyB]: grantedSmart } });
    env.controller.bind('user-A');
    await flush();
    await env.controller.revoke('voiceCapture');
    env.controller.bind('user-B');
    await flush();
    check("H10 : compte B conserve SON consentement ; la révocation de A ne l'affecte pas", env.controller.has('smartReplies') && !env.controller.has('voiceCapture'));
    env.controller.bind('user-A');
    await flush();
    check('H10b : retour sur A → la révocation de A est toujours appliquée (trace du compte A)', blocked(env.controller));
    check("H10c : l'enregistrement de B n'a pas été modifié", env.data[keyB] === grantedSmart && !(aiConsentRevocationKey('user-B') in env.data));
  }

  {
    const slow = deferred();
    const env = makeEnv({ initial: { [keyA]: grantedVoice, [keyB]: grantedSmart }, readGate: (k) => (isMain(k) ? slow.promise : null) });
    env.controller.bind('user-A'); // lecture de A suspendue
    const revoking = env.controller.revoke('voiceCapture');
    env.controller.bind('user-B'); // le compte change avant la fin
    slow.resolve(grantedVoice);
    const persisted = await revoking;
    await flush();
    const trace = parseRevocationRecord(env.data[keyRevA] ?? null);
    check("H11 : révocation demandée pour A puis changement de compte → persistée QUAND MÊME pour A (trace)", persisted === true && trace !== null && trace.voiceCapture !== undefined);
    check("H11b : B n'hérite ni de l'accord ni de la révocation de A", env.controller.has('smartReplies') && !env.controller.has('voiceCapture'));
  }

  {
    const env = makeEnv({ initial: { [keyA]: JSON.stringify({ ...withConsentGranted(withConsentGranted({}, 'voiceCapture', NOW), 'smartReplies', NOW) }) } });
    env.controller.bind('user-A');
    await flush();
    const results = await Promise.all([env.controller.revoke('voiceCapture'), env.controller.revoke('smartReplies')]);
    const trace = parseRevocationRecord(env.data[keyRevA] ?? null);
    const after = await restart(env);
    check('H12 : révocations concurrentes des deux scopes → les deux persistées, aucune écrasée', results.every(Boolean) && trace !== null && trace.voiceCapture !== undefined && trace.smartReplies !== undefined);
    check('H12b : après redémarrage, les deux sont bloquées', blocked(after.controller) && blocked(after.controller, 'smartReplies'));
  }

  {
    const env = makeEnv({ initial: { [keyA]: JSON.stringify({ voiceCapture: { version: 1, grantedAt: '2026-09-01T00:00:00.000Z' }, smartReplies: { version: 1, grantedAt: '2026-09-01T00:00:00.000Z' } }) } });
    env.controller.bind('user-A');
    await flush();
    check('H13 : ancien stockage sans trace — capture vocale v1 valide, Réponses intelligentes v1 invalide (version 2 requise)', env.controller.has('voiceCapture') && !env.controller.has('smartReplies'));
  }

  {
    const env = makeEnv({ initial: { [keyA]: grantedVoice }, faults: { write: () => 'throw', remove: () => 'throw' } });
    env.controller.bind('user-A');
    await flush();
    const failed = await env.controller.revoke('voiceCapture'); // panne totale : non persisté
    env.faults.write = () => null;
    env.faults.remove = () => null; // stockage rétabli, mais l'ancien accord est toujours sur le support
    env.controller.bind('user-B');
    await flush();
    env.controller.bind('user-A'); // déconnexion/reconnexion dans la même session
    await flush();
    check("H14 : révocation non persistée → reste appliquée après changement de compte puis retour dans la même session", failed === false && blocked(env.controller));
  }

  {
    const keys = [aiConsentStorageKey('user-A'), aiConsentRevocationKey('user-A'), 'pensif.contacts'];
    const purged = selectKeysToPurge(keys);
    check('H15 : suppression de compte — le consentement ET sa trace sont purgés (préfixe `pensif.`)', purged.includes(keys[0]) && purged.includes(keys[1]));
    const env = makeEnv({ initial: {} });
    env.controller.bind('user-NEW');
    await flush();
    check('H15b : nouveau compte après suppression → aucun consentement hérité', blocked(env.controller) && blocked(env.controller, 'smartReplies'));
    check('H15c : les deux clés ne se confondent pas (préfixes distincts)', !aiConsentRevocationKey('x').startsWith(aiConsentStorageKey('x')) && !aiConsentStorageKey('x').startsWith(aiConsentRevocationKey('x')));
  }

  {
    const settings = read('src', 'screens', 'SettingsScreen.tsx');
    check('H16 : alerte de persistance — « Réessayer » + « Fermer », rappelle la révocation', /text: 'Réessayer', onPress: \(\) => void toggleAiConsent\(scope, false\)/.test(settings) && /text: 'Fermer', style: 'cancel'/.test(settings));
    const alertMatch = settings.match(/Alert\.alert\(\s*\n\s*'Désactivation non enregistrée',\s*\n\s*"([^"]+)"/);
    const message = alertMatch ? alertMatch[1] : '';
    check("H16b : le message dit que le choix n'a PAS été enregistré (aucune promesse de sécurité)", /n'a pas pu être enregistré/.test(message) && !/garanti|sécurisé|définitivement|certain/i.test(message), message);
    check('H16c : aucune confirmation positive « enregistrée » sur le chemin d\'échec', !/Révocation enregistrée|bien enregistré/.test(settings));
  }

}

races()
  .catch((e) => {
    failures++;
    console.log(`  FAIL exception inattendue — ${e instanceof Error ? e.stack : String(e)}`);
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} échec(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
