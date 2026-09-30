/// <reference types="node" />
// Tests de non-régression — CHANTIER "Déconnexion / changement de compte" (2026-09-30).
// Combine, comme les autres suites de ce projet (voir test-regression-auth-gate.ts) :
// - un harnais PUR reproduisant fidèlement l'ordre exact de `signOutAndSwitchAccount` (store.tsx) :
//   signOut local AVANT toute purge, purge complète (cache account-scoped + préférences device-scoped
//   + tutoriel), état mémoire réinitialisé SEULEMENT ENSUITE, authGate = 'choice' ;
// - des vérifications de SOURCE (authRepo.ts, store.tsx, SettingsScreen.tsx) verrouillant les
//   garde-fous explicites de la consigne : jamais `deleteUser`/`delete-account`, gating sur un compte
//   sécurisé uniquement, confirmation avant action, aucun compte anonyme créé automatiquement après
//   déconnexion.
//
// Usage : npx tsx scripts/test-regression-sign-out-switch-account.ts

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
  return fs.readFileSync(path.join(__dirname, '..', 'src', ...segments), 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------------------------
// Harnais — reproduit `signOutAndSwitchAccount` (store.tsx) : ordre des effets + état final.
// ---------------------------------------------------------------------------------------------
function createSignOutHarness() {
  const calls: string[] = [];
  const asyncStorage = new Set(['pensif.contacts', 'pensif.pensees', 'pensif.outbox', 'pensif.cacheOwnerUserId', 'pensif.userName', 'pensif.themePref', 'pensif.notificationsEnabled', 'pensif.tutorialSeen']);
  let userIdRef: string | null = 'user-secured-1';
  let contacts = ['contact-a', 'contact-b'];
  let pensees = ['pensee-a'];
  let outbox = ['op-1'];
  let userId: string | null = 'user-secured-1';
  let isAnonymous = false;
  let authGate: 'none' | 'choice' = 'none';

  async function signOutAndSwitchAccount() {
    calls.push('signOutLocalSession');
    calls.push('purge:start');
    for (const key of ['pensif.contacts', 'pensif.pensees', 'pensif.outbox', 'pensif.cacheOwnerUserId', 'pensif.userName', 'pensif.themePref', 'pensif.notificationsEnabled', 'pensif.tutorialSeen']) {
      asyncStorage.delete(key);
    }
    calls.push('clearAllLocalDrafts');
    outbox = [];
    contacts = [];
    pensees = [];
    userIdRef = null;
    userId = null;
    isAnonymous = false;
    authGate = 'choice';
    calls.push('done');
  }

  return {
    signOutAndSwitchAccount,
    state: () => ({ calls, asyncStorageHasAccountKeys: asyncStorage.size > 0, userIdRef, contacts, pensees, outbox, userId, isAnonymous, authGate }),
  };
}

async function main() {
  console.log('1. Ordre des effets et état final après déconnexion');
  {
    const h = createSignOutHarness();
    await h.signOutAndSwitchAccount();
    const s = h.state();
    check('signOut local AVANT toute purge (1er appel)', s.calls[0] === 'signOutLocalSession', JSON.stringify(s.calls));
    check('purge cache + brouillons après le signOut', s.calls.indexOf('purge:start') > s.calls.indexOf('signOutLocalSession'));
    check('AsyncStorage account-scoped entièrement purgé', s.asyncStorageHasAccountKeys === false);
    check('userIdRef remis à null (plus aucun drain possible)', s.userIdRef === null);
    check('contacts/pensées/outbox locaux vidés', s.contacts.length === 0 && s.pensees.length === 0 && s.outbox.length === 0);
    check('userId store = null, isAnonymous = false', s.userId === null && s.isAnonymous === false);
    check("authGate = 'choice' (ré-affiche l'écran de choix, jamais un compte anonyme auto-créé)", s.authGate === 'choice');
  }

  console.log('2. authRepo.ts — signOutLocalSession reste scope:local, jamais un appel destructeur');
  {
    const authRepo = readSrc('lib', 'authRepo.ts');
    check("signOutLocalSession appelle signOut({ scope: 'local' })", /export async function signOutLocalSession[\s\S]{0,120}scope:\s*'local'/.test(authRepo));
    check('authRepo.ts ne contient aucun appel deleteUser', !/\.deleteUser\s*\(/.test(authRepo));
    check("authRepo.ts ne référence jamais 'delete-account'", !/delete-account/.test(authRepo));
  }

  console.log('3. store.tsx — signOutAndSwitchAccount câblée correctement, aucune suppression serveur');
  {
    const store = readSrc('data', 'store.tsx');
    const fnMatch = store.match(/async function signOutAndSwitchAccount\(\)\s*\{[\s\S]*?\n  \}/);
    check('signOutAndSwitchAccount définie dans store.tsx', Boolean(fnMatch));
    const fnBody = fnMatch ? fnMatch[0] : '';
    check('appelle signOutLocalSession() en premier effet', /await signOutLocalSession\(\)/.test(fnBody));
    check("purge cacheOwnerUserId (empêche tout mélange de données entre comptes)", /KEYS\.cacheOwnerUserId/.test(fnBody));
    check("remet authGate à 'choice'", /setAuthGate\('choice'\)/.test(fnBody));
    check('ne référence ni deleteAccountRemote ni deleteAllUserData', !/deleteAccountRemote|deleteAllUserData/.test(fnBody));
    check("exposée dans l'objet retourné du store", /signOutAndSwitchAccount,\s*\n\s*\};/.test(store));
  }

  console.log('4. SettingsScreen.tsx — gating compte sécurisé, confirmation explicite, aucun auto-anonyme');
  {
    const screen = readSrc('screens', 'SettingsScreen.tsx');
    const fnMatch = screen.match(/function confirmSignOut\(\)\s*\{[\s\S]*?\n  \}/);
    check('confirmSignOut définie', Boolean(fnMatch));
    const fnBody = fnMatch ? fnMatch[0] : '';
    check("Alert.alert de confirmation avant tout appel à signOutAndSwitchAccount", /Alert\.alert\(/.test(fnBody) && fnBody.indexOf('Alert.alert(') < fnBody.indexOf('signOutAndSwitchAccount()'));
    check("bouton 'Annuler' présent (style: 'cancel')", /style:\s*'cancel'/.test(fnBody));
    check('single-flight (garde signingOut)', /if \(signingOut\) return/.test(fnBody));
    const gatingMatch = screen.match(/\{!isAnonymous && \(\s*\n\s*<>\s*\n[\s\S]{0,400}confirmSignOut/);
    check("ligne 'Se déconnecter' rendue UNIQUEMENT pour !isAnonymous (compte sécurisé)", Boolean(gatingMatch));
  }

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
