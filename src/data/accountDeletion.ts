// CHANTIER "Suppression des données / du compte" (2026-09-26). Logique PURE (aucun import expo/react-native) :
// libellés UX selon l'état du compte, sélection des clés locales à purger, et orchestrateur de suppression
// avec l'ordre STRICT "serveur d'abord, purge locale seulement après succès serveur". Toutes les
// dépendances sont injectées (voir store.tsx) — testable sous tsx avec de faux effets.

// ── 1. Libellés (UX) ─────────────────────────────────────────────────────────────────────────────────────
// Compte ANONYME (aucun e-mail) : jamais le mot "compte" — l'utilisateur n'a pas l'impression d'en avoir
// créé un. Compte SÉCURISÉ (e-mail) : "Supprimer mon compte".
export type AccountDeletionCopy = {
  rowTitle: string;
  rowSubtitle: string;
  alertTitle: string;
  alertBody: string;
  confirmLabel: string;
  cancelLabel: string;
};

export function getAccountDeletionCopy(isAnonymous: boolean): AccountDeletionCopy {
  if (isAnonymous) {
    return {
      rowTitle: 'Supprimer mes données',
      rowSubtitle: 'Supprime définitivement vos données Pensif.',
      alertTitle: 'Supprimer mes données ?',
      alertBody:
        'Cette action supprimera définitivement vos pensées, vos proches et les données associées à Pensif.\nCette action est irréversible.',
      confirmLabel: 'Supprimer définitivement',
      cancelLabel: 'Annuler',
    };
  }
  return {
    rowTitle: 'Supprimer mon compte',
    rowSubtitle: 'Supprime définitivement votre compte Pensif et ses données.',
    alertTitle: 'Supprimer mon compte ?',
    alertBody:
      'Cette action supprimera définitivement votre compte Pensif ainsi que vos pensées, vos proches et les données associées.\nCette action est irréversible.',
    confirmLabel: 'Supprimer définitivement',
    cancelLabel: 'Annuler',
  };
}

// ── 2. Clés locales à purger ─────────────────────────────────────────────────────────────────────────────
// Purge par PRÉFIXE plutôt que par liste figée : toute clé applicative `pensif.*` (contacts, pensées,
// outbox, propriétaire du cache, prénom, thème, rappels, tutoriel, brouillons de message, anciennes clés
// legacy), les brouillons de quiz (`quiz-draft-*`) et la session Supabase persistée (`sb-*`, filet de
// sécurité si signOut échoue). Une clé future `pensif.xxx` est donc purgée sans rien modifier ici.
const PURGE_PREFIXES = ['pensif.', 'quiz-draft-', 'sb-'] as const;

export function selectKeysToPurge(allKeys: readonly string[]): string[] {
  return allKeys.filter((key) => PURGE_PREFIXES.some((prefix) => key.startsWith(prefix)));
}

// ── 3. Classification des erreurs ────────────────────────────────────────────────────────────────────────
// Durcissement (2026-09-26) : on distingue ce qu'on SAIT de ce qu'on ignore. Le serveur ne fait plus qu'UNE
// opération destructrice (`auth.admin.deleteUser`, cascade Postgres — voir delete-account/index.ts), donc :
//   - SERVER_REJECTED    : réponse HTTP explicite du serveur AVANT toute suppression (rien n'a été supprimé) ;
//   - SESSION_INVALID    : 401 — jeton refusé (session expirée/révoquée OU compte déjà supprimé : ambigu seul) ;
//   - NETWORK_UNCERTAIN  : coupure, timeout, relay, 5xx de passerelle, réponse illisible — la requête a pu
//                          aboutir. JAMAIS présentée comme "échec certain".
export type DeletionErrorKind = 'SERVER_REJECTED' | 'SESSION_INVALID' | 'NETWORK_UNCERTAIN';

export class AccountDeletionError extends Error {
  constructor(public readonly kind: DeletionErrorKind) {
    super(kind);
  }
}

export type InvokeFailure =
  | { source: 'http'; status: number; bodyError?: string | null }
  | { source: 'relay' }
  | { source: 'fetch' }
  | { source: 'other' };

/** Traduit un échec d'appel `supabase.functions.invoke` (déjà réduit à ces formes par l'API) en catégorie. */
export function classifyInvokeFailure(failure: InvokeFailure): DeletionErrorKind {
  if (failure.source === 'http') {
    if (failure.status === 401) return 'SESSION_INVALID';
    // Notre fonction répond explicitement `delete_failed` (500) quand `deleteUser` a échoué : l'opération est
    // atomique côté Postgres (cascade dans la même instruction) → rien n'a été supprimé.
    if (failure.status === 500 && failure.bodyError === 'delete_failed') return 'SERVER_REJECTED';
    // Autres 4xx : la fonction a refusé la requête avant de supprimer (405, 400, 404 fonction non déployée...).
    if (failure.status >= 400 && failure.status < 500) return 'SERVER_REJECTED';
    // 5xx sans notre corps structuré (502/503/504, timeouts de passerelle, crash) : résultat INCONNU.
    return 'NETWORK_UNCERTAIN';
  }
  return 'NETWORK_UNCERTAIN';
}

// ── 4. Sondage de l'existence du compte (réconciliation) ─────────────────────────────────────────────────
// Résultat de `supabase.auth.getUser()` (appel réseau réel à GoTrue, qui rafraîchit d'abord un jeton expiré
// rafraîchissable — un simple jeton expiré n'est donc JAMAIS pris pour un compte supprimé) :
//   exists            : l'utilisateur répond → le compte existe encore ;
//   absent_confirmed  : code `user_not_found` (403) → GoTrue confirme que l'utilisateur n'existe plus ;
//   session_gone      : session/refresh token introuvable (`session_not_found`, `refresh_token_not_found`,
//                       `refresh_token_already_used`, session locale absente) → cohérent avec un compte supprimé
//                       (ses sessions/refresh tokens partent en cascade) MAIS aussi avec une session révoquée ou
//                       un refresh token invalide alors que le compte existe encore : ÉTAT INDÉTERMINÉ, jamais
//                       une preuve — ne déclenche AUCUNE purge, même si un marqueur "pending" existe (pour un
//                       utilisateur anonyme, purger ici pourrait détruire l'accès à des données encore
//                       présentes côté serveur : la sécurité des données locales prime sur l'inférence d'un succès) ;
//   indeterminate     : réseau, 5xx, tout le reste → on ne conclut rien.
export type AccountProbe = 'exists' | 'absent_confirmed' | 'session_gone' | 'indeterminate';

export function classifyProbeResult(input: {
  hasUser: boolean;
  error: { code?: string | null; status?: number | null; name?: string | null } | null;
}): AccountProbe {
  if (input.hasUser) return 'exists';
  const code = input.error?.code ?? null;
  if (code === 'user_not_found') return 'absent_confirmed';
  if (code === 'session_not_found' || code === 'refresh_token_not_found' || code === 'refresh_token_already_used') return 'session_gone';
  if (input.error?.name === 'AuthSessionMissingError') return 'session_gone';
  return 'indeterminate';
}

/** Le nettoyage local automatique n'a lieu QUE si le serveur confirme l'absence du compte (`user_not_found`).
 *  `session_gone` et `indeterminate` ne purgent jamais (le marqueur pending est conservé), et l'existence d'un
 *  marqueur ne change RIEN à cette règle. */
export function shouldFinalizeAfterProbe(probe: AccountProbe): boolean {
  return probe === 'absent_confirmed';
}

// ── 5. Orchestrateur ─────────────────────────────────────────────────────────────────────────────────────
export type PendingMarker = 'in_flight' | 'uncertain';

export type AccountDeletionFailureReason = DeletionErrorKind | 'offline' | 'busy' | 'ACCOUNT_STILL_EXISTS';

export type AccountDeletionResult =
  | { ok: true; localCleanupComplete: boolean; reconciled: boolean }
  | { ok: false; reason: AccountDeletionFailureReason };

export type LocalCleanupDeps = {
  /** Détache la session en mémoire (plus aucun drain/écriture distante possible avec l'ancien user). */
  detachSession: () => void;
  /** Annule toutes les notifications locales programmées + badge à 0. */
  cancelNotifications: () => Promise<void>;
  /** Déconnexion LOCALE de Supabase (jamais un signOut global : le compte n'existe plus côté serveur). */
  signOutLocal: () => Promise<void>;
  /** Réinitialise l'état applicatif en mémoire et ré-affiche l'écran initial ("Commencer"). */
  resetToOnboarding: () => void;
  /** Vide AsyncStorage (voir `selectKeysToPurge` — y compris le marqueur pending). */
  purgeLocalStorage: () => Promise<void>;
};

export type AccountDeletionDeps = LocalCleanupDeps & {
  /** `true` si Internet est joignable. */
  isOnline: () => Promise<boolean>;
  /** Appelle l'Edge Function ; lève `AccountDeletionError` en cas d'échec. Ne résout QUE si le serveur a confirmé. */
  deleteRemote: () => Promise<void>;
  readPending: () => Promise<PendingMarker | null>;
  writePending: (marker: PendingMarker) => Promise<void>;
  clearPending: () => Promise<void>;
  probeAccount: () => Promise<AccountProbe>;
};

/** Message affiché pour un échec. `NETWORK_UNCERTAIN` ne prétend JAMAIS que rien n'a été supprimé. */
export function describeDeletionFailure(reason: AccountDeletionFailureReason): string {
  switch (reason) {
    case 'offline':
      return 'Une connexion Internet est nécessaire pour supprimer définitivement vos données.';
    case 'SESSION_INVALID':
      return 'Votre session n’est plus valide. Réessayez dans quelques instants ou relancez Pensif.';
    case 'NETWORK_UNCERTAIN':
      return 'Impossible de confirmer la suppression.\nVérifiez votre connexion puis réessayez.';
    case 'busy':
      return 'Une suppression est déjà en cours.';
    default:
      // SERVER_REJECTED, ACCOUNT_STILL_EXISTS : le serveur a répondu / le compte a été revérifié — rien n'a été supprimé.
      return 'La suppression a échoué. Vos données n’ont pas été supprimées. Réessayez.';
  }
}

async function safely<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

/** Nettoyage local complet, APRÈS confirmation (directe ou indirecte) que le compte n'existe plus. Chaque étape
 *  est isolée : l'échec de l'une n'empêche pas les suivantes. Retourne `false` si une étape a échoué. */
export async function runLocalCleanup(deps: LocalCleanupDeps): Promise<boolean> {
  let complete = true;
  const attempt = async (step: () => void | Promise<void>) => {
    try {
      await step();
    } catch {
      complete = false;
    }
  };
  await attempt(deps.detachSession);
  await attempt(deps.cancelNotifications);
  await attempt(deps.signOutLocal);
  await attempt(deps.resetToOnboarding);
  await attempt(deps.purgeLocalStorage);
  return complete;
}

/**
 * Crée l'exécuteur de suppression. SINGLE-FLIGHT : tant qu'une suppression est en cours, tout nouvel appel
 * (double tap) retourne `{ ok:false, reason:'busy' }` SANS relancer d'appel serveur.
 *
 * Ordre STRICT :
 *   1. Hors ligne → STOP (`offline`), rien n'est touché (aucun marqueur écrit).
 *   2. Marqueur "pending" persistant (`in_flight`) écrit AVANT l'appel : si l'app est tuée pendant l'appel, le
 *      prochain lancement sait qu'une suppression a été demandée (voir `reconcilePendingDeletion`).
 *   3. Appel serveur :
 *      - succès confirmé → nettoyage local complet ;
 *      - SERVER_REJECTED → marqueur retiré, rien n'est touché ;
 *      - SESSION_INVALID sans suppression antérieure en attente → marqueur retiré, rien n'est touché
 *        (un 401 seul n'est JAMAIS une preuve que le compte a été supprimé) ;
 *      - NETWORK_UNCERTAIN (ou SESSION_INVALID alors qu'une tentative antérieure était restée en attente) →
 *        marqueur `uncertain`, puis sondage de l'existence du compte : existe → marqueur retiré, échec certain ;
 *        absent CONFIRMÉ (`user_not_found`) uniquement → nettoyage local ; sinon (dont `session_gone`) → on garde
 *        le marqueur et on ne supprime RIEN localement.
 */
export function createAccountDeletionRunner(deps: AccountDeletionDeps): () => Promise<AccountDeletionResult> {
  let inFlight = false;

  return async function runAccountDeletion(): Promise<AccountDeletionResult> {
    if (inFlight) return { ok: false, reason: 'busy' };
    inFlight = true;
    try {
      const online = await safely(deps.isOnline, false);
      if (!online) return { ok: false, reason: 'offline' };

      const pendingBefore = await safely(deps.readPending, null);
      await safely(() => deps.writePending('in_flight'), undefined);

      try {
        await deps.deleteRemote();
        // Le serveur a CONFIRMÉ : le compte n'existe plus.
        return { ok: true, localCleanupComplete: await runLocalCleanup(deps), reconciled: false };
      } catch (e) {
        const kind: DeletionErrorKind = e instanceof AccountDeletionError ? e.kind : 'NETWORK_UNCERTAIN';

        if (kind === 'SERVER_REJECTED' || (kind === 'SESSION_INVALID' && pendingBefore === null)) {
          await safely(deps.clearPending, undefined);
          return { ok: false, reason: kind };
        }

        // Résultat ambigu : on tente de le lever, sans jamais supprimer sur une simple supposition.
        await safely(() => deps.writePending('uncertain'), undefined);
        const probe = await safely(deps.probeAccount, 'indeterminate' as AccountProbe);
        if (probe === 'exists') {
          await safely(deps.clearPending, undefined);
          return { ok: false, reason: 'ACCOUNT_STILL_EXISTS' };
        }
        if (shouldFinalizeAfterProbe(probe)) {
          return { ok: true, localCleanupComplete: await runLocalCleanup(deps), reconciled: true };
        }
        return { ok: false, reason: kind };
      }
    } finally {
      inFlight = false;
    }
  };
}

export type ReconcileOutcome = 'none' | 'cleared' | 'finalized' | 'kept';

/**
 * Réconciliation au lancement (ou au retour réseau) : si un marqueur "pending" existe (suppression demandée
 * dont le résultat n'a jamais été confirmé — réponse perdue, app tuée pendant l'appel), on sonde le compte.
 *   - compte existant           → marqueur retiré, rien de supprimé, l'utilisateur peut réessayer ;
 *   - compte absent CONFIRMÉ (`user_not_found`) uniquement → nettoyage local complet ;
 *   - session_gone / hors ligne / indéterminé → marqueur conservé, RIEN n'est supprimé automatiquement.
 */
export async function reconcilePendingDeletion(
  deps: LocalCleanupDeps & Pick<AccountDeletionDeps, 'isOnline' | 'readPending' | 'clearPending' | 'probeAccount'>,
): Promise<ReconcileOutcome> {
  const pending = await safely(deps.readPending, null);
  if (pending === null) return 'none';
  const online = await safely(deps.isOnline, false);
  if (!online) return 'kept';
  const probe = await safely(deps.probeAccount, 'indeterminate' as AccountProbe);
  if (probe === 'exists') {
    await safely(deps.clearPending, undefined);
    return 'cleared';
  }
  if (shouldFinalizeAfterProbe(probe)) {
    await runLocalCleanup(deps);
    return 'finalized';
  }
  return 'kept';
}

// ── 6. Libellés "Sauvegarde" (Réglages) ──────────────────────────────────────────────────────────────────
// Présentation SEULE (2026-09-26) : la sauvegarde d'un compte ANONYME est bien active, mais ses données ne
// peuvent pas encore être retrouvées sur un autre appareil — d'où "Sauvegarde" (sans "synchronisation") et un
// texte explicatif ; après association d'un e-mail : "Sauvegarde et synchronisation".
export type BackupSectionCopy = {
  rowLabel: string;
  rowValue: string;
  explanation: string;
  /** Sous-texte de "Sécuriser mes données" — affiché seulement pour un compte anonyme. */
  securitySubtitle: string;
};

export function getBackupSectionCopy(isAnonymous: boolean): BackupSectionCopy {
  if (isAnonymous) {
    return {
      rowLabel: 'Sauvegarde',
      rowValue: 'Active',
      explanation: 'Vos données sont sauvegardées par Pensif.\nVous pouvez choisir de les sécuriser pour les retrouver sur un autre appareil.',
      securitySubtitle: 'Associez une adresse e-mail pour pouvoir retrouver vos données à tout moment, même sur un autre appareil.',
    };
  }
  return {
    rowLabel: 'Sauvegarde et synchronisation',
    rowValue: 'Active',
    explanation: 'Vos données peuvent être retrouvées sur vos autres appareils.',
    securitySubtitle: '',
  };
}
