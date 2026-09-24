/// <reference types="node" />
// Tests de non-régression — CHANTIER "Data Safety P0-1" : Auth récupérable V1 (2026-09-20).
// Couvre les 14 scénarios requis (A à N) : auth gate (session existante / absente / "Continuer" /
// "J'ai déjà un compte"), sécurisation du compte anonyme courant, conflit email déjà associé, et
// propriété du cache local (purge/migration selon `cacheOwnerUserId`).
//
// Combine deux approches, comme les autres suites de ce projet :
// - simulations PURES (harnais reproduisant fidèlement la logique réelle de store.tsx, réseau
//   simulé) pour les scénarios comportementaux (A, B, C, E, F, K, L, M, N) ;
// - vérifications de SOURCE (authRepo.ts, store.tsx, SettingsScreen.tsx) pour les scénarios qui ne
//   sont que des paramètres passés au SDK Supabase, sans branche logique à simuler utilement
//   (D, G, H), et pour verrouiller les garde-fous explicites (I, J).
//
// Usage : npx tsx scripts/test-regression-auth-gate.ts

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
// Harnais [A/B/C/E/F] — reproduit le bloc de boot de store.tsx (useEffect principal) : session déjà
// présente → initializeForSession direct ; absente → JAMAIS de signInAnonymously automatique,
// authGate passe à 'choice' ; "Continuer"/"J'ai déjà un compte" empruntent ensuite le MÊME chemin
// initializeForSession (voir consigne §4, "éviter deux implémentations différentes du boot").
// ---------------------------------------------------------------------------------------------
function createBootHarness(opts: {
  existingSession: { userId: string; isAnonymous: boolean } | null;
  otpKnownEmails?: string[];
}) {
  let authGate: 'none' | 'choice' = 'none';
  let userId: string | null = null;
  let isAnonymous = false;
  let initializeForSessionCalls: string[] = [];
  let signInAnonymouslyCalls = 0;
  let anonSessionCreated = false;

  async function getExistingSessionFake() {
    return opts.existingSession;
  }

  async function initializeForSession(session: { userId: string; isAnonymous: boolean }) {
    initializeForSessionCalls.push(session.userId);
    userId = session.userId;
    isAnonymous = session.isAnonymous;
  }

  // Reproduit exactement le bloc `else` (Supabase configuré) du useEffect de boot.
  async function boot() {
    const session = await getExistingSessionFake();
    if (session) {
      await initializeForSession(session);
      authGate = 'none';
    } else {
      authGate = 'choice'; // JAMAIS signInAnonymously() ici — voir §4
    }
  }

  // Reproduit store.chooseAnonymous().
  async function chooseAnonymous() {
    signInAnonymouslyCalls += 1;
    anonSessionCreated = true;
    const session = { userId: 'user-new-anon', isAnonymous: true };
    await initializeForSession(session);
    authGate = 'none';
  }

  // Reproduit requestExistingAccountOtp/verifyExistingAccountOtp + store.completeAuthWithSession().
  async function completeExistingAccountLogin(email: string, token: string): Promise<{ ok: boolean }> {
    const known = (opts.otpKnownEmails ?? []).includes(email) && token === 'good-otp';
    if (!known) return { ok: false }; // aucune session créée, aucun anonyme en repli
    const session = { userId: `user-recovered-${email}`, isAnonymous: false };
    await initializeForSession(session);
    authGate = 'none';
    return { ok: true };
  }

  return {
    get authGate() {
      return authGate;
    },
    get userId() {
      return userId;
    },
    get isAnonymous() {
      return isAnonymous;
    },
    get initializeForSessionCalls() {
      return initializeForSessionCalls;
    },
    get signInAnonymouslyCalls() {
      return signInAnonymouslyCalls;
    },
    get anonSessionCreated() {
      return anonSessionCreated;
    },
    boot,
    chooseAnonymous,
    completeExistingAccountLogin,
  };
}

// ---------------------------------------------------------------------------------------------
// Harnais [K/L/M/N] — reproduit fidèlement `initializeForSession` (store.tsx) pour la partie
// propriété du cache (§5) : lecture de `cacheOwnerUserId`, purge AVANT tout chargement distant/drain
// si le propriétaire diffère, migration silencieuse (préservation) si absent.
// ---------------------------------------------------------------------------------------------
function createCacheOwnershipHarness(initialAsyncStorage: Record<string, string>) {
  const asyncStorage: Record<string, string> = { ...initialAsyncStorage };
  const order: string[] = [];
  let draftsCleared = false;
  let drainedOutbox: unknown[] | null = null;

  async function getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(asyncStorage, key) ? asyncStorage[key] : null;
  }
  async function setItem(key: string, val: string) {
    asyncStorage[key] = val;
  }
  async function removeItem(key: string) {
    delete asyncStorage[key];
  }
  async function clearAllLocalDraftsFake() {
    draftsCleared = true;
    order.push('draftsCleared');
  }

  const KEYS = {
    contacts: 'pensif.contacts',
    pensees: 'pensif.pensees',
    outbox: 'pensif.outbox',
    cacheOwnerUserId: 'pensif.cacheOwnerUserId',
  };

  async function initializeForSession(session: { userId: string }) {
    const storedOwner = await getItem(KEYS.cacheOwnerUserId);

    let cachedContacts: unknown[] = [];
    let cachedPensees: unknown[] = [];
    let loadedOutbox: unknown[] = [];

    if (storedOwner && storedOwner !== session.userId) {
      order.push('purge:start');
      await removeItem(KEYS.contacts);
      await removeItem(KEYS.pensees);
      await removeItem(KEYS.outbox);
      await clearAllLocalDraftsFake();
      await setItem(KEYS.cacheOwnerUserId, session.userId);
      order.push('purge:done');
      // cachedContacts/cachedPensees/loadedOutbox restent volontairement vides.
    } else {
      const [c, p, o] = await Promise.all([getItem(KEYS.contacts), getItem(KEYS.pensees), getItem(KEYS.outbox)]);
      cachedContacts = c ? JSON.parse(c) : [];
      cachedPensees = p ? JSON.parse(p) : [];
      loadedOutbox = o ? JSON.parse(o) : [];
      if (!storedOwner) {
        await setItem(KEYS.cacheOwnerUserId, session.userId); // migration : attribution sans effacement
      }
    }

    order.push('remoteLoad');
    if (loadedOutbox.length) {
      drainedOutbox = loadedOutbox;
      order.push('drain');
    }

    return { cachedContacts, cachedPensees, loadedOutbox };
  }

  return {
    asyncStorage,
    order,
    get draftsCleared() {
      return draftsCleared;
    },
    get drainedOutbox() {
      return drainedOutbox;
    },
    initializeForSession,
  };
}

async function main() {
  console.log('\n[A] session déjà existante au boot → pas d’auth gate, boot normal direct');
  {
    const h = createBootHarness({ existingSession: { userId: 'user-existing', isAnonymous: false } });
    await h.boot();
    check('authGate reste \'none\'', h.authGate === 'none');
    check('initializeForSession appelée avec la session existante', h.initializeForSessionCalls.includes('user-existing'));
    check('aucun signInAnonymously appelé', h.signInAnonymouslyCalls === 0);
  }

  console.log('\n[B] aucune session au boot → PAS de signInAnonymously automatique, auth gate affiché');
  {
    const h = createBootHarness({ existingSession: null });
    await h.boot();
    check('authGate passe à \'choice\'', h.authGate === 'choice');
    check('aucun anonyme créé automatiquement', h.anonSessionCreated === false && h.signInAnonymouslyCalls === 0);
    check('userId reste absent (rien n’a été initialisé silencieusement)', h.userId === null);
  }

  console.log('\n[C] "Continuer" → signInAnonymously puis boot via le MÊME chemin initializeForSession');
  {
    const h = createBootHarness({ existingSession: null });
    await h.boot();
    await h.chooseAnonymous();
    check('un anonyme est bien créé', h.signInAnonymouslyCalls === 1 && h.anonSessionCreated === true);
    check('initializeForSession appelée pour ce nouvel anonyme', h.initializeForSessionCalls.includes('user-new-anon'));
    check('authGate repasse à \'none\' après le choix', h.authGate === 'none');
    check('isAnonymous vrai pour ce compte', h.isAnonymous === true);
  }

  console.log('\n[D] "J’ai déjà un compte" → requestExistingAccountOtp appelle signInWithOtp avec shouldCreateUser:false');
  {
    const authRepoSrc = readSrc('lib', 'authRepo.ts');
    const fnStart = authRepoSrc.indexOf('export async function requestExistingAccountOtp');
    const fnBlock = authRepoSrc.slice(fnStart, authRepoSrc.indexOf('\n}', fnStart));
    check('requestExistingAccountOtp existe', fnStart !== -1);
    check(
      'signInWithOtp appelée avec shouldCreateUser: false (jamais de création de compte via ce chemin)',
      /signInWithOtp\(\{\s*email,\s*options:\s*\{\s*shouldCreateUser:\s*false\s*\}\s*\}\)/.test(fnBlock),
    );
  }

  console.log('\n[E] code OTP correct pour un compte existant → boot avec le user.id récupéré (ancien compte)');
  {
    const h = createBootHarness({ existingSession: null, otpKnownEmails: ['ancien@pensif.app'] });
    await h.boot();
    const result = await h.completeExistingAccountLogin('ancien@pensif.app', 'good-otp');
    check('la connexion réussit', result.ok === true);
    check('initializeForSession appelée avec le user.id RÉCUPÉRÉ (pas un nouvel anonyme)', h.initializeForSessionCalls.includes('user-recovered-ancien@pensif.app'));
    check('authGate repasse à \'none\'', h.authGate === 'none');
    check('aucun signInAnonymously déclenché sur ce chemin', h.signInAnonymouslyCalls === 0);
  }

  console.log('\n[F] email inconnu (jamais inscrit) → verifyOtp échoue, AUCUN compte créé, aucun anonyme en repli');
  {
    const h = createBootHarness({ existingSession: null, otpKnownEmails: ['connu@pensif.app'] });
    await h.boot();
    const result = await h.completeExistingAccountLogin('inconnu@pensif.app', 'good-otp');
    check('la connexion échoue proprement', result.ok === false);
    check('aucune session initialisée', h.userId === null && h.initializeForSessionCalls.length === 0);
    check('authGate reste \'choice\' (aucun anonyme créé en repli silencieux)', h.authGate === 'choice');
    check('aucun signInAnonymously déclenché', h.signInAnonymouslyCalls === 0);
  }

  console.log('\n[G] sécurisation du compte anonyme courant → requestAccountSecurityEmail appelle updateUser({ email })');
  {
    const authRepoSrc = readSrc('lib', 'authRepo.ts');
    const fnStart = authRepoSrc.indexOf('export async function requestAccountSecurityEmail');
    const fnBlock = authRepoSrc.slice(fnStart, authRepoSrc.indexOf('\n}', fnStart));
    check('requestAccountSecurityEmail existe', fnStart !== -1);
    check('appelle updateUser({ email }) (jamais linkIdentity, non supporté pour email — voir authRepo.ts)', /updateUser\(\{\s*email\s*\}\)/.test(fnBlock));
    // Vérifie l'ABSENCE d'appel réel (supabase.auth.linkIdentity(...)) — une mention en commentaire
    // explicatif ("pourquoi pas linkIdentity") peut légitimement subsister, voir le piège déjà
    // rencontré avec `ensureAnonSession`/`service_role` (check-onboarding-permissions.js).
    check('n’appelle jamais supabase.auth.linkIdentity (non supporté pour email, voir authRepo.ts)', !/\.auth\.linkIdentity\(/.test(authRepoSrc));
  }

  console.log('\n[H] vérification de la sécurisation → verifyOtp avec type: \'email_change\' (jamais \'email\')');
  {
    const authRepoSrc = readSrc('lib', 'authRepo.ts');
    const securityFnStart = authRepoSrc.indexOf('export async function verifyAccountSecurityOtp');
    const securityFnBlock = authRepoSrc.slice(securityFnStart, authRepoSrc.indexOf('\n}', securityFnStart));
    check('verifyAccountSecurityOtp existe', securityFnStart !== -1);
    check('utilise type: \'email_change\' (distinct de la connexion classique)', /type:\s*'email_change'/.test(securityFnBlock));

    const loginFnStart = authRepoSrc.indexOf('export async function verifyExistingAccountOtp');
    const loginFnBlock = authRepoSrc.slice(loginFnStart, authRepoSrc.indexOf('\n}', loginFnStart));
    check('verifyExistingAccountOtp (connexion "J’ai déjà un compte") utilise type: \'email\' — jamais \'email_change\'', /type:\s*'email'/.test(loginFnBlock) && !/email_change/.test(loginFnBlock));
  }

  console.log('\n[I] après sécurisation réussie, user.id AVANT === APRÈS est explicitement vérifié (erreur critique sinon, jamais silencieux)');
  {
    const settingsSrc = readSrc('screens', 'SettingsScreen.tsx');
    check('capture le user.id AVANT le flux (via getExistingSession)', /securityIdBefore/.test(settingsSrc) && /getExistingSession\(\)/.test(settingsSrc));
    check(
      'compare explicitement userId APRÈS vs AVANT, jamais un continue silencieux en cas de divergence',
      /result\.userId\s*!==\s*securityIdBefore/.test(settingsSrc),
    );
    check('aucun reload/purge déclenché après une sécurisation réussie (user.id inchangé, simple conversion anon→permanent)', !/verifySecurityCode[\s\S]{0,2000}clearAllLocalDrafts/.test(settingsSrc));
  }

  console.log('\n[J] email déjà associé à un autre compte → session anonyme courante intacte, jamais de fusion automatique');
  {
    const settingsSrc = readSrc('screens', 'SettingsScreen.tsx');
    check(
      'email_exists/identity_already_exists gérés explicitement (message dédié, pas une erreur générique)',
      /email_exists/.test(settingsSrc) || /identity_already_exists/.test(settingsSrc) || /describeAuthErrorCode/.test(settingsSrc),
    );
    // La fonction ne doit jamais appeler markAccountSecured/signOut en cas d'échec de l'envoi du code.
    const sendFnStart = settingsSrc.indexOf('async function sendSecurityCode');
    const sendFnBlock = settingsSrc.slice(sendFnStart, sendFnStart + 2000);
    check('sendSecurityCode existe', sendFnStart !== -1);
    check('en cas d’échec (email déjà associé ou autre), markAccountSecured n’est PAS appelée dans le même bloc d’échec', !/error[\s\S]{0,200}markAccountSecured\(\)/.test(sendFnBlock));
  }

  console.log('\n[K] cacheOwnerUserId IDENTIQUE à la session → cache chargé normalement, AUCUNE purge');
  {
    const h = createCacheOwnershipHarness({
      'pensif.cacheOwnerUserId': 'user-1',
      'pensif.contacts': JSON.stringify([{ id: 'c-1' }]),
      'pensif.pensees': JSON.stringify([{ id: 'p-1' }]),
      'pensif.outbox': JSON.stringify([{ id: 'op-1' }]),
    });
    const result = await h.initializeForSession({ userId: 'user-1' });
    check('aucune purge déclenchée', !h.order.includes('purge:start'));
    check('les brouillons locaux ne sont pas effacés', h.draftsCleared === false);
    check('le contact du cache est bien chargé', result.cachedContacts.some((c: any) => c.id === 'c-1'));
    check('la pensée du cache est bien chargée', result.cachedPensees.some((p: any) => p.id === 'p-1'));
    check('l’outbox du cache est bien chargée (et donc drainée)', result.loadedOutbox.some((o: any) => o.id === 'op-1'));
  }

  console.log('\n[L] cacheOwnerUserId DIFFÉRENT de la session → contacts/pensées/outbox purgés AVANT tout chargement distant');
  {
    const h = createCacheOwnershipHarness({
      'pensif.cacheOwnerUserId': 'user-old',
      'pensif.contacts': JSON.stringify([{ id: 'c-old' }]),
      'pensif.pensees': JSON.stringify([{ id: 'p-old' }]),
      'pensif.outbox': JSON.stringify([{ id: 'op-old' }]),
    });
    const result = await h.initializeForSession({ userId: 'user-new' });
    check('la purge est bien déclenchée', h.order.includes('purge:start'));
    check('la purge se termine AVANT le chargement distant (ordre garanti)', h.order.indexOf('purge:done') < h.order.indexOf('remoteLoad'));
    check('les brouillons locaux (message/quiz) sont purgés avec le reste', h.draftsCleared === true);
    check('AsyncStorage ne contient plus le cache de l’ancien compte', !('pensif.contacts' in h.asyncStorage) && !('pensif.pensees' in h.asyncStorage) && !('pensif.outbox' in h.asyncStorage));
    check('cacheOwnerUserId réattribué au nouveau compte', h.asyncStorage['pensif.cacheOwnerUserId'] === 'user-new');
    check('aucune donnée de l’ancien compte transmise à resolveBootData', result.cachedContacts.length === 0 && result.cachedPensees.length === 0 && result.loadedOutbox.length === 0);
  }

  console.log('\n[M] l’ancienne outbox n’est JAMAIS drainée sous le nouveau compte (cacheOwnerUserId différent)');
  {
    const h = createCacheOwnershipHarness({
      'pensif.cacheOwnerUserId': 'user-old',
      'pensif.outbox': JSON.stringify([{ id: 'op-old-pending' }]),
    });
    await h.initializeForSession({ userId: 'user-new' });
    check('aucun drain n’a eu lieu pour ce boot (outbox purgée, donc vide)', h.drainedOutbox === null);
    check('l’opération de l’ancien compte n’a jamais été transmise au drain', !h.order.includes('drain'));
  }

  console.log('\n[N] migration : installation existante sans cacheOwnerUserId + session déjà là → cache préservé, jamais effacé');
  {
    const h = createCacheOwnershipHarness({
      // pas de 'pensif.cacheOwnerUserId' — installation antérieure à ce chantier.
      'pensif.contacts': JSON.stringify([{ id: 'c-preexisting' }]),
      'pensif.pensees': JSON.stringify([{ id: 'p-preexisting' }]),
      'pensif.outbox': JSON.stringify([{ id: 'op-preexisting' }]),
    });
    const result = await h.initializeForSession({ userId: 'user-current' });
    check('aucune purge déclenchée (migration, pas un changement de compte)', !h.order.includes('purge:start'));
    check('le cache existant est intégralement préservé', result.cachedContacts.some((c: any) => c.id === 'c-preexisting') && result.cachedPensees.some((p: any) => p.id === 'p-preexisting') && result.loadedOutbox.some((o: any) => o.id === 'op-preexisting'));
    check('cacheOwnerUserId est désormais attribué (sans avoir effacé quoi que ce soit)', h.asyncStorage['pensif.cacheOwnerUserId'] === 'user-current');
    check('l’ancienne outbox EST bien drainée cette fois (c’est le même compte, pas un changement)', h.order.includes('drain'));
  }

  // -------------------------------------------------------------------------------------------
  // CORRECTIF "Auth P0-1 — OTP réel" (2026-09-20) : le token réel généré par Supabase (test device
  // réel, Brevo) contient 8 chiffres — l'UI Pensif était figée à 6, bug confirmé. `sanitizeOtpInput`/
  // `isOtpSubmittable` (authRepo.ts) ne sont pas importables sous Node pur (authRepo.ts → supabase.ts
  // → react-native-url-polyfill/AsyncStorage, comme le reste des fichiers React Native de ce projet)
  // — reproduites ici À L'IDENTIQUE pour un test PUR du comportement, puis verrouillées par une
  // vérification de SOURCE ci-dessous garantissant que l'implémentation réelle correspond exactement.
  // -------------------------------------------------------------------------------------------
  const OTP_MIN_LENGTH = 6;
  const OTP_MAX_LENGTH = 10;
  function sanitizeOtpInput(raw: string): string {
    return raw.replace(/[^0-9]/g, '').slice(0, OTP_MAX_LENGTH);
  }
  function isOtpSubmittable(otp: string): boolean {
    return otp.length >= OTP_MIN_LENGTH && otp.length <= OTP_MAX_LENGTH;
  }

  console.log('\n[OTP] la longueur du token n’est JAMAIS supposée fixe à 6 chiffres (6 à 10 chiffres acceptés)');
  {
    check('6 chiffres accepté', isOtpSubmittable(sanitizeOtpInput('123456')) && sanitizeOtpInput('123456') === '123456');
    check('8 chiffres accepté (cas réel confirmé : Supabase/Brevo)', isOtpSubmittable(sanitizeOtpInput('12345678')) && sanitizeOtpInput('12345678') === '12345678');
    check('10 chiffres accepté (borne haute)', isOtpSubmittable(sanitizeOtpInput('1234567890')) && sanitizeOtpInput('1234567890') === '1234567890');
    check('5 chiffres refusé (bouton indisponible)', !isOtpSubmittable(sanitizeOtpInput('12345')));
    check('un 11e chiffre est impossible à saisir (troncature à 10, jamais plus)', sanitizeOtpInput('123456789012').length === 10 && sanitizeOtpInput('123456789012') === '1234567890');
    check('lettres/espaces supprimés de la saisie (jamais transmis à verifyOtp)', sanitizeOtpInput('12 34a5b6') === '123456');
    check('un zéro initial est conservé (chaîne, jamais parsé en nombre)', sanitizeOtpInput('012345') === '012345' && sanitizeOtpInput('012345')[0] === '0');
    check('aucun padding automatique (une saisie de 6 chiffres reste 6, pas complétée à 10)', sanitizeOtpInput('123456').length === 6);
  }

  console.log('\n[OTP — source] authRepo.ts / AuthGateScreen.tsx / SettingsScreen.tsx utilisent bien les mêmes constantes/fonctions, aucune longueur codée en dur à 6');
  {
    const authRepoSrc = readSrc('lib', 'authRepo.ts');
    check('OTP_MIN_LENGTH = 6, OTP_MAX_LENGTH = 10 définies dans authRepo.ts (source unique de vérité)', /OTP_MIN_LENGTH\s*=\s*6/.test(authRepoSrc) && /OTP_MAX_LENGTH\s*=\s*10/.test(authRepoSrc));
    check('sanitizeOtpInput ne garde que les chiffres (regex [^0-9])', /replace\(\/\[\^0-9\]\/g,\s*''\)/.test(authRepoSrc));
    check('sanitizeOtpInput tronque à OTP_MAX_LENGTH (jamais 6 en dur)', /\.slice\(0,\s*OTP_MAX_LENGTH\)/.test(authRepoSrc));
    check('isOtpSubmittable compare à OTP_MIN_LENGTH/OTP_MAX_LENGTH, jamais un nombre en dur', /otp\.length >= OTP_MIN_LENGTH && otp\.length <= OTP_MAX_LENGTH/.test(authRepoSrc));

    const gateSrc = readSrc('components', 'AuthGateScreen.tsx');
    check('AuthGateScreen : plus de maxLength={6} en dur — utilise OTP_MAX_LENGTH', !/maxLength=\{6\}/.test(gateSrc) && /maxLength=\{OTP_MAX_LENGTH\}/.test(gateSrc));
    check('AuthGateScreen : la saisie OTP passe par sanitizeOtpInput (jamais setCode brut)', /onChangeText=\{\(text\) => setCode\(sanitizeOtpInput\(text\)\)\}/.test(gateSrc));
    check('AuthGateScreen : le bouton "Vérifier" est désactivé tant que isOtpSubmittable(code) est faux', /PrimaryButton label="Vérifier" onPress=\{handleVerifyCode\} disabled=\{!isOtpSubmittable\(code\)\}/.test(gateSrc));
    check('AuthGateScreen : aucun auto-submit au 6e chiffre (handleVerifyCode jamais appelée depuis onChangeText)', !/onChangeText[\s\S]{0,120}handleVerifyCode/.test(gateSrc));

    // CHANTIER "UX — Première ouverture plus chaleureuse" (2026-09-24) : hiérarchie/wording seulement.
    check('1er écran : CTA principal "Commencer" (PrimaryButton primary) câblé sur handleContinueAnonymously (flux nouveau compte inchangé)', /<PrimaryButton label="Commencer" onPress=\{handleContinueAnonymously\} \/>/.test(gateSrc));
    check('1er écran : ancien label "Continuer" absent de l’écran', !/label="Continuer"/.test(gateSrc));
    check('1er écran : "J’ai déjà un compte" présent en lien secondaire (Pressable + Text), plus un PrimaryButton concurrent', /<Text style=\{\[styles\.linkText, \{ color: theme\.accent \}\]\}>J’ai déjà un compte<\/Text>/.test(gateSrc) && !/PrimaryButton label="J’ai déjà un compte"/.test(gateSrc));
    check('1er écran : "J’ai déjà un compte" garde la même action (resetToChoice + setStep(\'email\'))', /onPress=\{\(\) => \{ resetToChoice\(\); setStep\('email'\); \}\}/.test(gateSrc));
    check('1er écran : accroche + description chaleureuses présentes', gateSrc.includes('Les petites choses comptent.') && gateSrc.includes('Garde en mémoire ce que les personnes qui comptent pour toi te confient, et retrouve-le au bon moment.'));
    check('1er écran : logo = asset existant assets/icon.png (aucun nouvel asset)', gateSrc.includes("require('../../assets/icon.png')"));
    check('1er écran : couleurs via theme (aucune couleur en dur, thèmes Système/Clair/Obscur)', !/#[0-9A-Fa-f]{3,8}\b/.test(gateSrc));

    const settingsSrc = readSrc('screens', 'SettingsScreen.tsx');
    check('SettingsScreen : plus de maxLength={6} en dur — utilise OTP_MAX_LENGTH', !/maxLength=\{6\}/.test(settingsSrc) && /maxLength=\{OTP_MAX_LENGTH\}/.test(settingsSrc));
    check('SettingsScreen : la saisie OTP passe par sanitizeOtpInput', /onChangeText=\{\(text\) => setSecurityCode\(sanitizeOtpInput\(text\)\)\}/.test(settingsSrc));
    check('SettingsScreen : le bouton "Vérifier" est désactivé tant que isOtpSubmittable(securityCode) est faux', /verifySecurityCode\} disabled=\{!isOtpSubmittable\(securityCode\)\}/.test(settingsSrc));
    check('SettingsScreen : aucun auto-submit au 6e chiffre', !/onChangeText[\s\S]{0,120}verifySecurityCode/.test(settingsSrc));
  }

  console.log('\n[Clavier iOS] KeyboardAvoidingView réutilisé (pattern déjà employé, aucune hauteur fixe par modèle d’iPhone)');
  {
    const gateSrc = readSrc('components', 'AuthGateScreen.tsx');
    check('AuthGateScreen enveloppe son contenu dans un KeyboardAvoidingView', /<KeyboardAvoidingView/.test(gateSrc));
    check('behavior="padding" réservé à iOS (Android géré nativement, comme CalendarScreen.tsx)', /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/.test(gateSrc));
    check('offset petit et FIXE, jamais calculé/dérivé d’un modèle d’iPhone précis (même valeur que CalendarScreen.tsx : 10)', /keyboardVerticalOffset=\{Platform\.OS === 'ios' \? 10 : 0\}/.test(gateSrc));

    const screenSrc = readSrc('components', 'Screen.tsx');
    check('Screen.tsx (utilisé par SettingsScreen) enveloppe sa ScrollView dans un KeyboardAvoidingView', /<KeyboardAvoidingView[\s\S]{0,200}<ScrollView/.test(screenSrc));
    check('même pattern behavior/offset que CalendarScreen.tsx/AuthGateScreen.tsx, pas de logique dupliquée divergente', /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/.test(screenSrc) && /keyboardVerticalOffset=\{Platform\.OS === 'ios' \? 10 : 0\}/.test(screenSrc));
  }

  // -------------------------------------------------------------------------------------------
  // CHANTIER "Data Safety P0-1 — test récupération sans réinstallation" (2026-09-20) — outil DEV
  // `devSimulateReinstall` (store.tsx). Harnais reproduisant fidèlement l'ordre réel : signOut AVANT
  // toute purge, purge du cache account-scoped UNIQUEMENT (jamais les préférences device-scoped),
  // état en mémoire réinitialisé EN DERNIER, aucun drain déclenché à aucun moment.
  // -------------------------------------------------------------------------------------------
  function createDevReinstallHarness(initialAsyncStorage: Record<string, string>) {
    const asyncStorage: Record<string, string> = { ...initialAsyncStorage };
    const order: string[] = [];
    let signedOut = false;
    let draftsCleared = false;
    let drainCalls = 0;
    let outboxState: unknown[] = JSON.parse(initialAsyncStorage['pensif.outbox'] ?? '[]');
    let contactsState: unknown[] = JSON.parse(initialAsyncStorage['pensif.contacts'] ?? '[]');
    let penseesState: unknown[] = JSON.parse(initialAsyncStorage['pensif.pensees'] ?? '[]');
    let userId: string | null = 'user-current';
    let isAnonymous = false;
    let authGate: 'none' | 'choice' = 'none';

    async function devSignOutForReinstallSimulationFake() {
      order.push('signOut');
      signedOut = true;
    }
    async function clearAllLocalDraftsFake() {
      order.push('draftsCleared');
      draftsCleared = true;
    }
    function drainNowFake() {
      drainCalls += 1;
      order.push('drain');
    }

    async function devSimulateReinstall() {
      await devSignOutForReinstallSimulationFake();

      delete asyncStorage['pensif.contacts'];
      delete asyncStorage['pensif.pensees'];
      delete asyncStorage['pensif.outbox'];
      delete asyncStorage['pensif.cacheOwnerUserId'];
      // DEV — vraie première installation (2026-09-24) : prénom, préférences internes et flag tutoriel remis à neuf.
      delete asyncStorage['pensif.userName'];
      delete asyncStorage['pensif.themePref'];
      delete asyncStorage['pensif.notificationsEnabled'];
      delete asyncStorage['pensif.tutorialSeen'];
      order.push('cachePurged');
      await clearAllLocalDraftsFake();

      outboxState = [];
      contactsState = [];
      penseesState = [];
      userId = null;
      isAnonymous = false;
      authGate = 'choice';
      order.push('stateReset');
      // AUCUN appel à drainNowFake() ici, volontairement.
    }

    return {
      asyncStorage,
      order,
      get signedOut() {
        return signedOut;
      },
      get draftsCleared() {
        return draftsCleared;
      },
      get drainCalls() {
        return drainCalls;
      },
      get outboxState() {
        return outboxState;
      },
      get contactsState() {
        return contactsState;
      },
      get penseesState() {
        return penseesState;
      },
      get userId() {
        return userId;
      },
      get isAnonymous() {
        return isAnonymous;
      },
      get authGate() {
        return authGate;
      },
      devSimulateReinstall,
      drainNowFake, // exposé uniquement pour prouver qu'il n'est JAMAIS appelé par devSimulateReinstall
    };
  }

  console.log('\n[Dev reset] la simulation de réinstallation purge bien la session + le cache account-scoped');
  {
    const h = createDevReinstallHarness({
      'pensif.contacts': JSON.stringify([{ id: 'c-1' }]),
      'pensif.pensees': JSON.stringify([{ id: 'p-1' }]),
      'pensif.outbox': JSON.stringify([{ id: 'op-1' }]),
      'pensif.cacheOwnerUserId': 'user-current',
    });
    await h.devSimulateReinstall();
    check('signOut Supabase déclenché', h.signedOut === true);
    check('signOut se produit AVANT la purge du cache (ordre garanti)', h.order.indexOf('signOut') < h.order.indexOf('cachePurged'));
    check('AsyncStorage : contacts/pensées/outbox/cacheOwnerUserId supprimés', !('pensif.contacts' in h.asyncStorage) && !('pensif.pensees' in h.asyncStorage) && !('pensif.outbox' in h.asyncStorage) && !('pensif.cacheOwnerUserId' in h.asyncStorage));
    check('brouillons locaux (message/quiz) purgés', h.draftsCleared === true);
    check('état en mémoire vidé : contacts/pensées/outbox', h.contactsState.length === 0 && h.penseesState.length === 0 && h.outboxState.length === 0);
    check('userId réinitialisé à null (plus aucun compte)', h.userId === null);
    check('isAnonymous réinitialisé à false', h.isAnonymous === false);
  }

  console.log('\n[Dev reset] MISE À JOUR 2026-09-24 — vraie première installation : prénom, préférences et flag tutoriel remis à neuf');
  {
    const h = createDevReinstallHarness({
      'pensif.userName': 'Marie',
      'pensif.themePref': 'dark',
      'pensif.notificationsEnabled': '1',
      'pensif.tutorialSeen': '1',
      'pensif.contacts': JSON.stringify([{ id: 'c-1' }]),
    });
    await h.devSimulateReinstall();
    check('pensif.userName supprimé (la saisie du prénom redevient nécessaire)', h.asyncStorage['pensif.userName'] === undefined);
    check('pensif.themePref supprimé', h.asyncStorage['pensif.themePref'] === undefined);
    check('pensif.notificationsEnabled supprimé', h.asyncStorage['pensif.notificationsEnabled'] === undefined);
    check('pensif.tutorialSeen supprimé (le tutoriel redevient éligible)', h.asyncStorage['pensif.tutorialSeen'] === undefined);
    check('données locales vidées (contacts)', h.asyncStorage['pensif.contacts'] === undefined);
  }

  console.log('\n[Dev reset] aucune ancienne outbox n’est drainée pendant/après le reset');
  {
    const h = createDevReinstallHarness({
      'pensif.outbox': JSON.stringify([{ id: 'op-pending-before-reset' }]),
    });
    await h.devSimulateReinstall();
    check('drainNow n’est jamais appelé par devSimulateReinstall', h.drainCalls === 0 && !h.order.includes('drain'));
    check('l’outbox est vide juste après le reset (rien à drainer même si un appel externe survenait)', h.outboxState.length === 0);
  }

  console.log('\n[Dev reset] l’auth gate est affichée juste après le reset (retour à l’état "aucune session")');
  {
    const h = createDevReinstallHarness({});
    check('authGate = \'none\' avant le reset (état initial simulé)', h.authGate === 'none');
    await h.devSimulateReinstall();
    check('authGate passe à \'choice\' après le reset', h.authGate === 'choice');
  }

  console.log('\n[Dev reset — source] devSimulateReinstall (store.tsx) et son garde-fou DEV-only');
  {
    const storeSrc = readSrc('data', 'store.tsx');
    const devFnStart = storeSrc.indexOf('async function devSimulateReinstall()');
    const devFnBlock = storeSrc.slice(devFnStart, storeSrc.indexOf('\n  }', devFnStart));
    check('devSimulateReinstall existe', devFnStart !== -1);
    check('garde-fou __DEV__ explicite, retour immédiat sinon (impossible en build production)', /if \(!__DEV__\) return;/.test(devFnBlock));
    check('signOut Supabase déclenché via authRepo.ts (jamais un appel supabase.auth direct dans store.tsx)', /devSignOutForReinstallSimulation\(\)/.test(devFnBlock));
    check('purge uniquement le cache account-scoped (contacts/pensees/outbox/cacheOwnerUserId)', /KEYS\.contacts/.test(devFnBlock) && /KEYS\.pensees/.test(devFnBlock) && /KEYS\.outbox/.test(devFnBlock) && /KEYS\.cacheOwnerUserId/.test(devFnBlock));
    check('remet à neuf prénom/thème/rappels + flag tutoriel (vraie première installation, mise à jour 2026-09-24)', /removeItem\(KEYS\.userName\)/.test(devFnBlock) && /removeItem\(KEYS\.themePref\)/.test(devFnBlock) && /removeItem\(KEYS\.notificationsEnabled\)/.test(devFnBlock) && /removeItem\(TUTORIAL_SEEN_KEY\)/.test(devFnBlock));
    check('état mémoire remis à neuf : userName null, thème system, rappels true, modale prénom fermée', /setUserNameState\(null\)/.test(devFnBlock) && /setThemePrefState\('system'\)/.test(devFnBlock) && /setNotificationsEnabledState\(true\)/.test(devFnBlock) && /setNamePromptOpen\(false\)/.test(devFnBlock));
    check('aucune donnée SERVEUR touchée : aucun appel deleteContactRemote/deletePenseeRemote/.delete( dans le reset', !/deleteContactRemote|deletePenseeRemote|\.delete\(|\.from\(/.test(devFnBlock));
    check('brouillons locaux purgés (clearAllLocalDrafts)', /clearAllLocalDrafts\(\)/.test(devFnBlock));
    check('authGate remis à \'choice\' (ré-affiche l’écran de choix, comme un premier lancement)', /setAuthGate\('choice'\)/.test(devFnBlock));
    check('aucun drainNow() appelé dans cette fonction (aucun drain avant/pendant/après purge)', !/drainNow\(\)/.test(devFnBlock));

    const authRepoSrc = readSrc('lib', 'authRepo.ts');
    const helperStart = authRepoSrc.indexOf('export async function devSignOutForReinstallSimulation');
    const helperBlock = authRepoSrc.slice(helperStart, authRepoSrc.indexOf('\n}', helperStart));
    check('devSignOutForReinstallSimulation existe (authRepo.ts)', helperStart !== -1);
    check('gardée par __DEV__ également côté authRepo.ts (double protection)', /if \(!__DEV__\) return;/.test(helperBlock));
    check('appelle bien supabase.auth.signOut()', /supabase\.auth\.signOut\(\)/.test(helperBlock));
    check('le métier auth réel reste inchangé : requestExistingAccountOtp/verifyExistingAccountOtp/updateUser toujours présents tels quels', /export async function requestExistingAccountOtp/.test(authRepoSrc) && /export async function verifyExistingAccountOtp/.test(authRepoSrc) && /updateUser\(\{\s*email\s*\}\)/.test(authRepoSrc));

    const settingsSrc = readSrc('screens', 'SettingsScreen.tsx');
    check('le bouton "[Dev] Simuler une réinstallation" n’est rendu que sous __DEV__ (impossible en build production)', /\{isSupabaseConfigured && \(\s*<>[\s\S]{0,1200}\{__DEV__ && \(\s*<>[\s\S]{0,500}Simuler une réinstallation/.test(settingsSrc));
    // Réglages V1 (2026-09-24) : le bouton vit désormais DANS le bloc `isSupabaseConfigured` de la carte
    // "DONNÉES ET CONFIDENTIALITÉ", toujours sous `__DEV__` (mêmes 2 conditions qu'avant, autre forme JSX).
    check('une confirmation est demandée avant d’agir (Alert.alert, pas d’exécution directe au tap)', /confirmSimulateReinstall[\s\S]{0,400}Alert\.alert/.test(settingsSrc));
  }

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : `${failures} ÉCHEC(S)`}`);
  if (failures > 0) throw new Error(`${failures} test(s) de non-régression ont échoué`);
}

main();
