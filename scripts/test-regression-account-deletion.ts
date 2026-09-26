// CHANTIER "Suppression des données / du compte" (2026-09-26, durci le même jour). La logique pure
// (data/accountDeletion.ts) est EXÉCUTÉE avec de faux effets ; le câblage (SettingsScreen, store, client API,
// Edge Function, schéma) est vérifié par source-grep. Voir aussi supabase/functions/delete-account/index.test.ts (Deno).
//
// Usage : npx tsx scripts/test-regression-account-deletion.ts

import * as fs from 'fs';
import * as path from 'path';
import {
  AccountDeletionDeps,
  AccountDeletionError,
  AccountProbe,
  PendingMarker,
  classifyInvokeFailure,
  classifyProbeResult,
  createAccountDeletionRunner,
  describeDeletionFailure,
  getAccountDeletionCopy,
  getBackupSectionCopy,
  reconcilePendingDeletion,
  selectKeysToPurge,
  shouldFinalizeAfterProbe,
} from '../src/data/accountDeletion';

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');

/** Faux effets : journalise chaque appel ; le marqueur pending est simulé en mémoire (`state.pending`). */
function makeDeps(log: string[], state: { pending: PendingMarker | null }, overrides: Partial<AccountDeletionDeps> = {}): AccountDeletionDeps {
  return {
    isOnline: async () => true,
    deleteRemote: async () => {
      log.push('remote');
    },
    detachSession: () => {
      log.push('detach');
    },
    cancelNotifications: async () => {
      log.push('notifications');
    },
    signOutLocal: async () => {
      log.push('signOut');
    },
    purgeLocalStorage: async () => {
      log.push('purge');
      state.pending = null; // le marqueur (préfixe `pensif.`) est purgé avec le reste
    },
    resetToOnboarding: () => {
      log.push('reset');
    },
    readPending: async () => state.pending,
    writePending: async (m) => {
      log.push(`pending:${m}`);
      state.pending = m;
    },
    clearPending: async () => {
      log.push('clearPending');
      state.pending = null;
    },
    probeAccount: async () => {
      log.push('probe');
      return 'indeterminate';
    },
    ...overrides,
  };
}
const LOCAL_EFFECTS = ['detach', 'notifications', 'signOut', 'reset', 'purge'];
const touchesLocal = (log: string[]) => log.some((l) => LOCAL_EFFECTS.includes(l));
const reasonOf = (r: { ok: boolean }) => (r as { reason?: string }).reason;

async function main() {
  console.log('1. Libellés : compte anonyme vs compte sécurisé');
  const anon = getAccountDeletionCopy(true);
  const secured = getAccountDeletionCopy(false);
  check('anonyme → "Supprimer mes données"', anon.rowTitle === 'Supprimer mes données');
  check('anonyme → sous-texte exact', anon.rowSubtitle === 'Supprime définitivement vos données Pensif.');
  check('anonyme → jamais le mot "compte" dans le libellé de ligne', !/compte/i.test(anon.rowTitle) && !/compte/i.test(anon.rowSubtitle));
  check('anonyme → alerte "Supprimer mes données ?"', anon.alertTitle === 'Supprimer mes données ?');
  check(
    'anonyme → corps exact',
    anon.alertBody ===
      'Cette action supprimera définitivement vos pensées, vos proches et les données associées à Pensif.\nCette action est irréversible.',
  );
  check('sécurisé → "Supprimer mon compte"', secured.rowTitle === 'Supprimer mon compte');
  check('sécurisé → sous-texte exact', secured.rowSubtitle === 'Supprime définitivement votre compte Pensif et ses données.');
  check('sécurisé → alerte "Supprimer mon compte ?"', secured.alertTitle === 'Supprimer mon compte ?');
  check(
    'sécurisé → corps exact',
    secured.alertBody ===
      'Cette action supprimera définitivement votre compte Pensif ainsi que vos pensées, vos proches et les données associées.\nCette action est irréversible.',
  );
  check('boutons : Annuler / Supprimer définitivement', anon.cancelLabel === 'Annuler' && anon.confirmLabel === 'Supprimer définitivement' && secured.confirmLabel === 'Supprimer définitivement');

  console.log('1b. Libellés "Sauvegarde" (Réglages) : anonyme vs sécurisé');
  const backupAnon = getBackupSectionCopy(true);
  const backupSecured = getBackupSectionCopy(false);
  check('anonyme → "Sauvegarde" / "Active" (sans "synchronisation")', backupAnon.rowLabel === 'Sauvegarde' && backupAnon.rowValue === 'Active');
  check(
    'anonyme → texte explicatif exact',
    backupAnon.explanation === 'Vos données sont sauvegardées par Pensif.\nVous pouvez choisir de les sécuriser pour les retrouver sur un autre appareil.',
  );
  check(
    'anonyme → sous-texte "Sécuriser mes données" exact',
    backupAnon.securitySubtitle === 'Associez une adresse e-mail pour pouvoir retrouver vos données à tout moment, même sur un autre appareil.',
  );
  check('anonyme → "Supprimer mes données" (ligne de suppression)', getAccountDeletionCopy(true).rowTitle === 'Supprimer mes données');
  check('sécurisé → "Sauvegarde et synchronisation" / "Active"', backupSecured.rowLabel === 'Sauvegarde et synchronisation' && backupSecured.rowValue === 'Active');
  check('sécurisé → texte explicatif exact', backupSecured.explanation === 'Vos données peuvent être retrouvées sur vos autres appareils.');
  check('sécurisé → aucun sous-texte de sécurisation', backupSecured.securitySubtitle === '');
  check('sécurisé → "Supprimer mon compte" (ligne de suppression)', getAccountDeletionCopy(false).rowTitle === 'Supprimer mon compte');
  {
    const settingsSource = read('src', 'screens', 'SettingsScreen.tsx');
    check('Réglages : libellés dérivés de isAnonymous (getBackupSectionCopy(isAnonymous))', /getBackupSectionCopy\(isAnonymous\)/.test(settingsSource));
    check('Réglages : texte explicatif rendu sous la ligne Sauvegarde', /\{backupCopy\.explanation\}/.test(settingsSource));
    check(
      'Réglages : statut "✓ Active" en vert doux (icône checkmark-circle + theme.sage), même rendu anonyme et sécurisé',
      settingsSource.includes('<Ionicons name="checkmark-circle" size={16} color={theme.sage}') &&
        settingsSource.includes("{ color: theme.sage, fontWeight: '600' }]}>{backupCopy.rowValue}"),
    );
    check(
      'Réglages : espace titre/sous-texte réduit (paddingBottom 4) et séparateur de suppression détaché (marginTop 8)',
      settingsSource.includes('[styles.row, { paddingBottom: 4 }]') && settingsSource.includes('{ backgroundColor: theme.line, marginTop: 8 }]} />'),
    );
    check('Réglages : "Sécuriser mes données" gardé par isAnonymous (absent du compte sécurisé)', /\{isAnonymous && \(\s*<>\s*<View style=\{\[styles\.divider[\s\S]{0,400}securityStep === 'idle'/.test(settingsSource));
    check('Réglages : sous-texte de sécurisation issu de backupCopy.securitySubtitle', /\{backupCopy\.securitySubtitle\}/.test(settingsSource));
  }

  console.log('2. Clés locales purgées');
  const keys = [
    'pensif.contacts', 'pensif.pensees', 'pensif.outbox', 'pensif.cacheOwnerUserId', 'pensif.userName', 'pensif.themePref',
    'pensif.notificationsEnabled', 'pensif.tutorialSeen', 'pensif.pendingDeleteContacts', 'pensif.messageDraft.abc.birthday',
    'quiz-draft-123', 'sb-whznwmzypipalixtifpk-auth-token', 'sb-xyz-auth-token-code-verifier',
  ];
  check('toutes les clés Pensif/quiz/session sont sélectionnées', selectKeysToPurge(keys).length === keys.length);
  check('une clé future pensif.xxx est purgée', selectKeysToPurge(['pensif.futureThing']).length === 1);
  check('une clé étrangère n’est PAS touchée', selectKeysToPurge(['expo.something', 'other']).length === 0);

  console.log('3. Serveur confirme { ok: true } → purge locale (ordre strict)');
  {
    const log: string[] = [];
    const state = { pending: null as PendingMarker | null };
    const result = await createAccountDeletionRunner(makeDeps(log, state))();
    check('résultat ok + nettoyage local complet', result.ok === true && (result as { localCleanupComplete: boolean }).localCleanupComplete === true);
    check(
      'ordre : marqueur → serveur → détachement → notifications → signOut local → reset onboarding → purge',
      JSON.stringify(log) === JSON.stringify(['pending:in_flight', 'remote', 'detach', 'notifications', 'signOut', 'reset', 'purge']),
      JSON.stringify(log),
    );
    check('le marqueur pending est purgé avec le reste', state.pending === null);
  }

  console.log('4. Classification des erreurs client');
  check('401 → SESSION_INVALID', classifyInvokeFailure({ source: 'http', status: 401 }) === 'SESSION_INVALID');
  check('500 { error: "delete_failed" } → SERVER_REJECTED (échec certain, atomique côté Postgres)', classifyInvokeFailure({ source: 'http', status: 500, bodyError: 'delete_failed' }) === 'SERVER_REJECTED');
  check('405 / 400 / 404 → SERVER_REJECTED (refus explicite avant suppression)', [405, 400, 404].every((status) => classifyInvokeFailure({ source: 'http', status }) === 'SERVER_REJECTED'));
  check('5xx SANS corps structuré (502/503/504) → NETWORK_UNCERTAIN', [500, 502, 503, 504, 546].every((status) => classifyInvokeFailure({ source: 'http', status, bodyError: null }) === 'NETWORK_UNCERTAIN'));
  check('relay / fetch (socket coupé) / erreur inconnue → NETWORK_UNCERTAIN', (['relay', 'fetch', 'other'] as const).every((source) => classifyInvokeFailure({ source }) === 'NETWORK_UNCERTAIN'));

  console.log('5. Erreur explicite du serveur → AUCUNE purge locale, réessai possible');
  {
    const log: string[] = [];
    const state = { pending: null as PendingMarker | null };
    const result = await createAccountDeletionRunner(
      makeDeps(log, state, {
        deleteRemote: async () => {
          log.push('remote');
          throw new AccountDeletionError('SERVER_REJECTED');
        },
      }),
    )();
    check('ok:false / SERVER_REJECTED', result.ok === false && reasonOf(result) === 'SERVER_REJECTED');
    check('aucun effet local', !touchesLocal(log), JSON.stringify(log));
    check('marqueur pending retiré (échec certain)', state.pending === null && log.includes('clearPending'));
    check('message : "n’ont pas été supprimées" (affirmation exacte, échec certain)', /n’ont pas été supprimées/.test(describeDeletionFailure('SERVER_REJECTED')));
    const runner = createAccountDeletionRunner(
      makeDeps([], { pending: null }, {
        deleteRemote: (() => {
          let n = 0;
          return async () => {
            n++;
            if (n === 1) throw new AccountDeletionError('SERVER_REJECTED');
          };
        })(),
      }),
    );
    const first = await runner();
    const second = await runner();
    check('2e tentative réussie après un échec certain', first.ok === false && second.ok === true);
  }

  console.log('6. NETWORK_UNCERTAIN (requête partie, réponse perdue) → aucune fausse affirmation, données conservées');
  {
    const log: string[] = [];
    const state = { pending: null as PendingMarker | null };
    const result = await createAccountDeletionRunner(
      makeDeps(log, state, {
        deleteRemote: async () => {
          log.push('remote');
          throw new AccountDeletionError('NETWORK_UNCERTAIN');
        },
        probeAccount: async () => {
          log.push('probe');
          return 'indeterminate';
        },
      }),
    )();
    check('ok:false / NETWORK_UNCERTAIN', result.ok === false && reasonOf(result) === 'NETWORK_UNCERTAIN');
    check('aucune purge locale (compte peut-être supprimé, mais pas prouvé)', !touchesLocal(log), JSON.stringify(log));
    check('marqueur pending "uncertain" CONSERVÉ pour la réconciliation', state.pending === 'uncertain');
    const message = describeDeletionFailure('NETWORK_UNCERTAIN');
    check('message exact prudent', message === 'Impossible de confirmer la suppression.\nVérifiez votre connexion puis réessayez.', message);
    check('jamais "n’ont pas été supprimées" / "échouée" / "conservées" dans le cas ambigu', !/n’ont pas été supprimées|échou|conserv|non supprimé/i.test(message));
    const unknown = await createAccountDeletionRunner(
      makeDeps([], { pending: null }, {
        deleteRemote: async () => {
          throw new Error('erreur inattendue');
        },
      }),
    )();
    check('erreur inconnue → traitée comme incertaine (jamais "échec certain")', unknown.ok === false && reasonOf(unknown) === 'NETWORK_UNCERTAIN');
  }

  console.log('7. Résultat ambigu → sondage immédiat du compte');
  for (const [probe, expectOk, expectReason, expectLocal] of [
    ['absent_confirmed', true, undefined, true],
    ['session_gone', false, 'NETWORK_UNCERTAIN', false],
    ['exists', false, 'ACCOUNT_STILL_EXISTS', false],
    ['indeterminate', false, 'NETWORK_UNCERTAIN', false],
  ] as [AccountProbe, boolean, string | undefined, boolean][]) {
    const log: string[] = [];
    const state = { pending: null as PendingMarker | null };
    const result = await createAccountDeletionRunner(
      makeDeps(log, state, {
        deleteRemote: async () => {
          throw new AccountDeletionError('NETWORK_UNCERTAIN');
        },
        probeAccount: async () => probe,
      }),
    )();
    check(`sondage "${probe}" → ${expectOk ? 'purge locale finale (absence CONFIRMÉE)' : `échec "${expectReason}"`}`, result.ok === expectOk && (expectOk || reasonOf(result) === expectReason), JSON.stringify(result));
    check(`sondage "${probe}" → ${expectLocal ? 'nettoyage local effectué' : 'aucune purge locale'}`, touchesLocal(log) === expectLocal, JSON.stringify(log));
    if (probe === 'exists') check('compte existant → marqueur pending retiré', state.pending === null);
    if (probe === 'indeterminate' || probe === 'session_gone') check(`${probe} → marqueur pending CONSERVÉ, données locales conservées`, state.pending === 'uncertain' && !touchesLocal(log));
    if (probe === 'session_gone') check('session_gone après NETWORK_UNCERTAIN → message prudent inchangé (jamais "supprimées" / "pas supprimées")', !/n’ont pas été supprimées|ont été supprimées/.test(describeDeletionFailure('NETWORK_UNCERTAIN')));
  }
  check('message "compte existe encore" = échec certain', /n’ont pas été supprimées/.test(describeDeletionFailure('ACCOUNT_STILL_EXISTS')));

  console.log('8. Simple 401 → PAS de purge automatique');
  {
    const log: string[] = [];
    const state = { pending: null as PendingMarker | null };
    const result = await createAccountDeletionRunner(
      makeDeps(log, state, {
        deleteRemote: async () => {
          throw new AccountDeletionError('SESSION_INVALID');
        },
        probeAccount: async () => {
          log.push('probe');
          return 'session_gone';
        },
      }),
    )();
    check('401 seul (aucune suppression antérieure en attente) → SESSION_INVALID, rien de supprimé', result.ok === false && reasonOf(result) === 'SESSION_INVALID' && !touchesLocal(log), JSON.stringify(log));
    check('aucun sondage déclenché par un 401 isolé, marqueur retiré', !log.includes('probe') && state.pending === null);
    // Retry APRÈS une réponse perdue : le marqueur "uncertain" existe déjà → le 401 est réinterprété.
    const log2: string[] = [];
    const state2 = { pending: 'uncertain' as PendingMarker | null };
    const retry = await createAccountDeletionRunner(
      makeDeps(log2, state2, {
        deleteRemote: async () => {
          throw new AccountDeletionError('SESSION_INVALID');
        },
        probeAccount: async () => 'session_gone',
      }),
    )();
    check('401 au réessai APRÈS un résultat ambigu + session_gone → PAS de purge, pending conservé', retry.ok === false && reasonOf(retry) === 'SESSION_INVALID' && !touchesLocal(log2) && state2.pending === 'uncertain');
    const log3: string[] = [];
    const retryExists = await createAccountDeletionRunner(
      makeDeps(log3, { pending: 'uncertain' }, {
        deleteRemote: async () => {
          throw new AccountDeletionError('SESSION_INVALID');
        },
        probeAccount: async () => 'exists',
      }),
    )();
    check('401 au réessai mais compte existant → pas de purge', retryExists.ok === false && !touchesLocal(log3));
  }

  console.log('9. Classification du sondage / règle de finalisation');
  check('utilisateur répond → exists', classifyProbeResult({ hasUser: true, error: null }) === 'exists');
  check('code user_not_found (403) → absent_confirmed', classifyProbeResult({ hasUser: false, error: { code: 'user_not_found', status: 403 } }) === 'absent_confirmed');
  check('session_not_found / refresh_token_not_found / refresh_token_already_used → session_gone', ['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].every((code) => classifyProbeResult({ hasUser: false, error: { code, status: 400 } }) === 'session_gone'));
  check('AuthSessionMissingError → session_gone', classifyProbeResult({ hasUser: false, error: { name: 'AuthSessionMissingError' } }) === 'session_gone');
  check('erreur réseau / 5xx / inconnue → indeterminate', classifyProbeResult({ hasUser: false, error: { name: 'AuthRetryableFetchError', status: 0 } }) === 'indeterminate' && classifyProbeResult({ hasUser: false, error: { code: 'unexpected_failure', status: 500 } }) === 'indeterminate' && classifyProbeResult({ hasUser: false, error: null }) === 'indeterminate');
  check('un jeton expiré (bad_jwt / 401 sans code de session) n’est PAS un compte supprimé', classifyProbeResult({ hasUser: false, error: { code: 'bad_jwt', status: 401 } }) === 'indeterminate');
  check('absent_confirmed finalise (avec ou sans marqueur)', shouldFinalizeAfterProbe('absent_confirmed') === true);
  check('session_gone ne finalise JAMAIS (même avec un marqueur pending)', shouldFinalizeAfterProbe('session_gone') === false);
  check('exists / indeterminate ne finalisent jamais', !shouldFinalizeAfterProbe('exists') && !shouldFinalizeAfterProbe('indeterminate'));

  console.log('10. Réconciliation au lancement');
  const reconcileDeps = (log: string[], state: { pending: PendingMarker | null }, probe: AccountProbe, online = true) => {
    const d = makeDeps(log, state, { probeAccount: async () => probe, isOnline: async () => online });
    return d;
  };
  {
    const log: string[] = [];
    check('aucun marqueur → "none", aucun sondage', (await reconcilePendingDeletion(reconcileDeps(log, { pending: null }, 'absent_confirmed'))) === 'none' && !log.includes('probe'));
  }
  {
    const log: string[] = [];
    const state = { pending: 'uncertain' as PendingMarker | null };
    check('marqueur + compte existe → "cleared", marqueur retiré, AUCUNE purge', (await reconcilePendingDeletion(reconcileDeps(log, state, 'exists'))) === 'cleared' && state.pending === null && !touchesLocal(log));
  }
  {
    const log: string[] = [];
    const state = { pending: 'in_flight' as PendingMarker | null };
    check('marqueur + compte absent confirmé → "finalized" (purge + notifications + onboarding)', (await reconcilePendingDeletion(reconcileDeps(log, state, 'absent_confirmed'))) === 'finalized' && LOCAL_EFFECTS.every((e) => log.includes(e)), JSON.stringify(log));
    check('ordre du nettoyage final', JSON.stringify(log.filter((l) => LOCAL_EFFECTS.includes(l))) === JSON.stringify(LOCAL_EFFECTS));
  }
  {
    const log: string[] = [];
    const state = { pending: 'uncertain' as PendingMarker | null };
    check('marqueur + session_gone → "kept", marqueur conservé, AUCUNE purge', (await reconcilePendingDeletion(reconcileDeps(log, state, 'session_gone'))) === 'kept' && state.pending === 'uncertain' && !touchesLocal(log), JSON.stringify(log));
  }
  {
    const log: string[] = [];
    const state = { pending: 'uncertain' as PendingMarker | null };
    check('marqueur + indéterminé → "kept", marqueur conservé, rien supprimé', (await reconcilePendingDeletion(reconcileDeps(log, state, 'indeterminate'))) === 'kept' && state.pending === 'uncertain' && !touchesLocal(log));
  }
  {
    const log: string[] = [];
    const state = { pending: 'uncertain' as PendingMarker | null };
    check('marqueur + hors ligne → "kept", aucun sondage, rien supprimé', (await reconcilePendingDeletion(reconcileDeps(log, state, 'absent_confirmed', false))) === 'kept' && !log.includes('probe') && !touchesLocal(log));
  }
  {
    // SANS marqueur, un simple "session disparue" ne déclenche jamais de purge (le sondage n'a même pas lieu).
    const log: string[] = [];
    check('sans marqueur : jamais de purge, même si la session semble morte', (await reconcilePendingDeletion(reconcileDeps(log, { pending: null }, 'session_gone'))) === 'none' && !touchesLocal(log));
  }

  console.log('11. Hors ligne (avant envoi) → aucun appel serveur, aucun marqueur');
  {
    const log: string[] = [];
    const result = await createAccountDeletionRunner(makeDeps(log, { pending: null }, { isOnline: async () => false }))();
    check('offline → ok:false / "offline"', result.ok === false && reasonOf(result) === 'offline');
    check('offline → aucun appel (ni serveur, ni marqueur, ni purge)', log.length === 0, JSON.stringify(log));
    const throwing = await createAccountDeletionRunner(
      makeDeps([], { pending: null }, {
        isOnline: async () => {
          throw new Error('netinfo');
        },
      }),
    )();
    check('NetInfo en erreur → traité comme hors ligne', throwing.ok === false && reasonOf(throwing) === 'offline');
    check('message hors ligne exact', describeDeletionFailure('offline') === 'Une connexion Internet est nécessaire pour supprimer définitivement vos données.');
  }

  console.log('12. Double tap → une seule requête');
  {
    const log: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = createAccountDeletionRunner(
      makeDeps(log, { pending: null }, {
        deleteRemote: async () => {
          log.push('remote');
          await gate;
        },
      }),
    );
    const first = runner();
    const second = await runner();
    release();
    const firstResult = await first;
    check('2e appel pendant la 1re → "busy"', second.ok === false && reasonOf(second) === 'busy');
    check('un seul appel serveur', log.filter((l) => l === 'remote').length === 1);
    check('la 1re suppression aboutit', firstResult.ok === true);
  }

  console.log('13. Purge locale partiellement en échec APRÈS confirmation serveur');
  {
    const log: string[] = [];
    const result = await createAccountDeletionRunner(
      makeDeps(log, { pending: null }, {
        cancelNotifications: async () => {
          throw new Error('notif');
        },
      }),
    )();
    check('succès quand même (le compte serveur n’existe plus)', result.ok === true);
    check('signalé : nettoyage local incomplet', result.ok === true && result.localCleanupComplete === false);
    check('les étapes suivantes sont quand même exécutées', log.includes('signOut') && log.includes('reset') && log.includes('purge'));
  }

  console.log('14. Câblage (source-grep)');
  const settings = read('src', 'screens', 'SettingsScreen.tsx');
  const store = read('src', 'data', 'store.tsx');
  const api = read('src', 'lib', 'accountDeletionApi.ts');
  const authRepo = read('src', 'lib', 'authRepo.ts');
  check('Réglages : libellé dépendant de isAnonymous (getAccountDeletionCopy(isAnonymous))', /getAccountDeletionCopy\(isAnonymous\)/.test(settings));
  check('Réglages : ligne rendue avec deletionCopy.rowTitle / rowSubtitle', /deletionCopy\.rowTitle/.test(settings) && /deletionCopy\.rowSubtitle/.test(settings));
  check('Réglages : alerte native destructive', /Alert\.alert\(deletionCopy\.alertTitle, deletionCopy\.alertBody/.test(settings) && /style: 'destructive'/.test(settings));
  check('Réglages : ligne désactivée pendant la suppression + loader', /disabled=\{deleting\}/.test(settings) && /deleting && <ActivityIndicator/.test(settings));
  check('Réglages : navigation réinitialisée seulement sur result.ok', /if \(result\.ok\) \{[\s\S]*navigationRef\.reset/.test(settings));
  check('Réglages : échec → Alert de description, pas de succès', /Suppression impossible', describeDeletionFailure\(result\.reason\)/.test(settings));
  check('Réglages : jamais le texte "Compte supprimé" affiché', !/Compte supprimé/.test(settings));
  check('store : deleteAllUserData exposé', /deleteAllUserData,/.test(store) && /deleteAllUserData: \(\) => Promise<AccountDeletionResult>/.test(store));
  check('store : hors ligne vérifié par NetInfo (isOnlineNow)', /isOnline: isOnlineNow/.test(store));
  check('store : annule les notifications ET remet le badge à 0', /await cancelAllReminders\(\);\s*await clearAppBadge\(\);/.test(store));
  check('store : purge AsyncStorage par préfixes + brouillons', /selectKeysToPurge\(keys\)/.test(store) && /clearAllLocalDrafts\(\)/.test(store));
  check('store : retour à l’écran de choix (authGate "choice")', /resetToOnboarding[\s\S]{0,700}setAuthGate\('choice'\)/.test(store));
  check('store : AUCUNE session anonyme recréée automatiquement dans la suppression', !/deleteAllUserData[\s\S]{0,2500}startAnonymousSession\(\)/.test(store.slice(store.indexOf('function deleteAllUserData'), store.indexOf('function deleteAllUserData') + 2500)));
  check('authRepo : déconnexion LOCALE de production (scope local, non gardée par __DEV__)', /signOut\(\{ scope: 'local' \}\)/.test(authRepo) && !/signOutLocalSession[\s\S]{0,200}__DEV__/.test(authRepo));
  check('client API : appelle l’Edge Function delete-account sans user_id', /invoke\('delete-account', \{ body: \{\} \}\)/.test(api) && !/user_?id/i.test(api));
  check('client API : ne résout que sur { ok: true } ; sinon incertain (jamais "échec certain")', /\.ok !== true\) throw new AccountDeletionError\('NETWORK_UNCERTAIN'\)/.test(api));
  check('client API : classification via classifyInvokeFailure (401 / corps delete_failed / relay / fetch)', /classifyInvokeFailure\(/.test(api) && /FunctionsRelayError/.test(api) && /FunctionsFetchError/.test(api) && /FunctionsHttpError/.test(api));
  check('store : réconciliation au lancement AVANT la restauration de session', /reconcilePendingDeletion\(\{ \.\.\.localCleanupDeps, \.\.\.pendingDeletionDeps \}\);[\s\S]{0,200}if \(reconciled === 'finalized'\) return;[\s\S]{0,100}getExistingSession\(\)/.test(store));
  check('store : marqueur pending persistant sous le préfixe pensif. (purgé avec le reste)', /accountDeletionPending: 'pensif\.accountDeletionPending'/.test(store) && selectKeysToPurge(['pensif.accountDeletionPending']).length === 1);
  check('store : sondage via authRepo.probeAccountExistence (getUser)', /probeAccount: probeAccountExistence/.test(store) && /supabase\.auth\.getUser\(\)/.test(authRepo));
  check('authRepo : sondage classé par classifyProbeResult (pur, testé)', /classifyProbeResult\(/.test(authRepo));
  check('Réglages : libellés UX inchangés (aucune chaîne modifiée)', /Supprimer mes données/.test(read('src', 'data', 'accountDeletion.ts')) && /Supprimer mon compte/.test(read('src', 'data', 'accountDeletion.ts')));

  console.log('15. Sécurité / schéma');
  const fnSource = read('supabase', 'functions', 'delete-account', 'index.ts');
  const schema = read('supabase', 'schema.sql');
  check('Edge Function : identifiant tiré du JWT (auth.getUser), jamais du corps', /auth\.getUser\(token\)/.test(fnSource) && !/req\.json\(\)|formData\(\)/.test(fnSource));
  const fnCode = fnSource.split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  check('Edge Function : auth.admin.deleteUser est l’UNIQUE opération destructrice', /auth\.admin\.deleteUser\(userId\)/.test(fnCode) && (fnCode.match(/deleteUser\(/g) ?? []).length === 1);
  check('Edge Function : AUCUN DELETE manuel préalable des 4 tables (plus de .from()/.delete())', !/\.from\(/.test(fnCode) && !/\.delete\(\)/.test(fnCode) && !/USER_OWNED_TABLES|deleteUserData/.test(fnCode));
  check('Edge Function : réponse minimale { ok: true } / { error: "delete_failed" }', /jsonResponse\(\{ ok: true \}, 200\)/.test(fnCode) && /jsonResponse\(\{ error: 'delete_failed' \}, 500\)/.test(fnCode));
  check('Edge Function : cascade attendue documentée (ON DELETE CASCADE + requête de vérification)', /ON DELETE CASCADE/.test(fnSource) && /pg_constraint/.test(fnSource));
  check('Edge Function : service_role uniquement côté serveur (resolveSupabaseSecretKey)', /resolveSupabaseSecretKey/.test(fnSource));
  check('Edge Function : ne journalise ni e-mail, ni jeton, ni contenu', !/console\.(log|error|warn)\([^)]*(email|token|jwt|userId|texte|prenom)/i.test(fnSource));
  const srcFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
    }
  };
  walk(path.join(__dirname, '..', 'src'));
  check('aucune clé service_role / secret dans le code (hors commentaires) de l’app', srcFiles.every((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)) // lignes de commentaire exclues (mentions "jamais de service_role")
        .every((line) => !/service_role|SERVICE_ROLE|SUPABASE_SECRET|resolveSupabaseSecretKey/.test(line)),
    ));
  check('app.json / .env.example : aucune clé service_role', !/service_role|SERVICE_ROLE_KEY=/.test(read('app.json')) && !/^EXPO_PUBLIC_[A-Z_]*SERVICE/m.test(read('.env.example')));
  const tables = ['contacts', 'pensees', 'capture_events', 'message_suggestion_events'];
  for (const table of tables) {
    const block = schema.match(new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? '';
    check(`schéma : ${table}.user_id → auth.users ON DELETE CASCADE`, /user_id uuid not null references auth\.users\(id\) on delete cascade/.test(block));
  }
  check('schéma : pensees.contact_id → contacts ON DELETE SET NULL (pas de blocage de cascade)', /contact_id uuid references contacts\(id\) on delete set null/.test(schema));
  check('schéma : aucune autre table portant user_id que les 4 connues', (schema.match(/create table if not exists (\w+)/g) ?? []).length === tables.length);
  check('RLS activée sur les 4 tables (inchangée)', tables.every((t) => new RegExp(`alter table ${t} enable row level security`).test(schema)));
  check('aucun fichier schema.sql modifié par cette passe (pas de nouvelle table)', !/delete_account|account_deletion/i.test(schema));

  console.log('16. Régression : suppression d’une pensée / d’un proche conservée');
  check('store : deleteContact et deletePensee toujours exposés', /deleteContact: \(contactId: string\) => void;/.test(store) && /deletePensee: \(penseeId: string\) => void;/.test(store));
  check('repo : suppression distante pensée/proche inchangée', /deleteContactRemote/.test(read('src', 'lib', 'supabaseRepo.ts')) && /deletePenseeRemote/.test(read('src', 'lib', 'supabaseRepo.ts')));

  console.log('');
  if (failures > 0) {
    console.log(`${failures} ÉCHEC(S).`);
    process.exit(1);
  }
  console.log('Tous les tests de suppression de compte passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
