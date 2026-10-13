// CHANTIER "App Review 5.1.1(i)/5.1.2(i)" — contrôleur du consentement IA du compte COURANT (2026-10-14), révocation durcie.
// Machine à états PURE (aucun import expo/react-native : stockage et publication sont injectés) pour tester les courses
// asynchrones et les pannes de stockage avec de faux effets. Le store n'en est que l'hôte.
//
// Garanties :
//  - `bind(owner)` est SYNCHRONE : plus aucun consentement n'est valide (verrou réseau publié vide) jusqu'à la lecture de
//    celui du NOUVEAU compte. Un chargement devenu obsolète (compte changé) n'est jamais appliqué (`epoch`).
//  - RÉVOCATION : bloque immédiatement en mémoire ; puis écrit une TRACE distincte (`pensif.aiConsentRevoked.<compte>`)
//    AVANT de réécrire l'enregistrement principal. Au chargement la trace est prioritaire : une scope révoquée y figurant
//    est invalide même si l'enregistrement principal la contient encore. Chaque écriture est vérifiée par RELECTURE.
//  - `revoke` ne retourne `true` (« enregistrée ») que si au moins un des deux supports a été vérifié par relecture.
//    Sinon `false` : le blocage reste actif pour toute la session (y compris après changement de compte puis retour), et
//    appeler `revoke` à nouveau réessaie la persistance.
//  - ACCORD : efface d'abord la trace de la scope (vérifié) puis écrit l'enregistrement principal. Si la trace ne peut pas
//    être effacée, l'accord reste valable pour la SESSION seulement (rien n'est persisté : au redémarrage, la trace
//    révoque encore → échec fermé).
//  - Lecture : toute lecture impossible ou contenu corrompu (enregistrement OU trace) → aucun consentement (échec fermé).
//  - Les écritures de persistance passent par une file SÉRIALISÉE : pas de lecture-modification-écriture entrelacée.
//  - LIMITE NON RÉSOLUE : si le stockage est entièrement inscriptible en échec au moment de la révocation, rien ne peut être
//    persisté ; `revoke` retourne `false` et l'ancien accord peut reparaître au redémarrage.
import {
  AI_CONSENT_SCOPES,
  AiConsentRecord,
  AiConsentScope,
  AiRevocationRecord,
  aiConsentRevocationKey,
  aiConsentStorageKey,
  hasValidConsent,
  parseConsentRecord,
  parseRevocationRecord,
  withConsentGranted,
  withConsentRevoked,
} from './aiConsent';

export type ConsentStorage = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

type ReadResult = { ok: true; raw: string | null } | { ok: false };

export function createAiConsentController(opts: {
  storage: ConsentStorage;
  publish: (owner: string | null, record: AiConsentRecord) => void;
  now?: () => Date;
}) {
  const { storage } = opts;
  const now = opts.now ?? (() => new Date());
  let owner: string | null = null;
  let record: AiConsentRecord = {};
  let epoch = 0;
  let loading: Promise<void> = Promise.resolve();
  // Révocations demandées mais pas (encore) persistées, par compte : appliquées à tout chargement de ce compte pendant la
  // session, jusqu'à persistance vérifiée ou nouvel accord explicite.
  const revoking = new Map<string, Set<AiConsentScope>>();
  let queue: Promise<unknown> = Promise.resolve();

  function set(nextOwner: string | null, nextRecord: AiConsentRecord) {
    owner = nextOwner;
    record = nextRecord;
    opts.publish(nextOwner, nextRecord);
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  function markRevoking(forOwner: string, scope: AiConsentScope) {
    const scopes = revoking.get(forOwner) ?? new Set<AiConsentScope>();
    scopes.add(scope);
    revoking.set(forOwner, scopes);
  }
  function unmarkRevoking(forOwner: string, scope: AiConsentScope) {
    revoking.get(forOwner)?.delete(scope);
  }

  async function safeRead(key: string): Promise<ReadResult> {
    try {
      return { ok: true, raw: await storage.read(key) };
    } catch {
      return { ok: false };
    }
  }

  /** Écrit puis RELIT : `true` seulement si la valeur relue est identique. Deux tentatives. */
  async function writeVerified(key: string, value: string): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await storage.write(key, value);
        if ((await storage.read(key)) === value) return true;
      } catch {
        // nouvelle tentative
      }
    }
    return false;
  }

  /** Supprime puis RELIT : `true` seulement si la clé est bien absente. Deux tentatives. */
  async function removeVerified(key: string): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await storage.remove(key);
        if ((await storage.read(key)) === null) return true;
      } catch {
        // nouvelle tentative
      }
    }
    return false;
  }

  /** Persiste `next` (supprime la clé si vide ; sinon, repli sur un enregistrement `{}` vérifié). */
  async function persistRecord(key: string, next: unknown, isEmpty: boolean): Promise<boolean> {
    if (!isEmpty) return writeVerified(key, JSON.stringify(next));
    if (await removeVerified(key)) return true;
    return writeVerified(key, '{}');
  }

  /** Lecture-modification-écriture de l'enregistrement principal du compte, depuis le support (jamais depuis la mémoire). */
  async function rewriteMain(forOwner: string, mutate: (current: AiConsentRecord) => AiConsentRecord): Promise<boolean> {
    const key = aiConsentStorageKey(forOwner);
    const read = await safeRead(key);
    if (!read.ok) return false;
    const next = mutate(parseConsentRecord(read.raw));
    return persistRecord(key, next, Object.keys(next).length === 0);
  }

  /**
   * Lecture-modification-écriture de la trace de révocation. Trace illisible/corrompue : on suppose CONSERVATIVEMENT que
   * toutes les scopes sont révoquées avant d'appliquer la modification (jamais l'inverse).
   */
  async function updateRevocations(forOwner: string, mutate: (current: AiRevocationRecord) => AiRevocationRecord): Promise<boolean> {
    const key = aiConsentRevocationKey(forOwner);
    const read = await safeRead(key);
    const parsed = read.ok ? parseRevocationRecord(read.raw) : null;
    const stamp = now().toISOString();
    const base: AiRevocationRecord = parsed ?? Object.fromEntries(AI_CONSENT_SCOPES.map((s) => [s, stamp]));
    const next = mutate(base);
    if (parsed !== null && JSON.stringify(next) === JSON.stringify(parsed)) return true; // rien à changer
    return persistRecord(key, next, Object.keys(next).length === 0);
  }

  return {
    /** À appeler SYNCHRONEMENT partout où l'identité du compte change (aucun await avant). */
    bind(newOwner: string | null): void {
      const myEpoch = ++epoch;
      set(newOwner, {}); // échec fermé immédiat
      if (!newOwner) {
        loading = Promise.resolve();
        return;
      }
      loading = Promise.all([safeRead(aiConsentStorageKey(newOwner)), safeRead(aiConsentRevocationKey(newOwner))]).then(
        ([main, rev]) => {
          if (epoch !== myEpoch) return; // le compte a changé entre-temps : résultat périmé ignoré
          let loaded: AiConsentRecord = main.ok ? parseConsentRecord(main.raw) : {};
          const revocations = rev.ok ? parseRevocationRecord(rev.raw) : null;
          if (revocations === null) {
            loaded = {}; // trace illisible ou corrompue : on ne peut pas exclure une révocation → aucun consentement
          } else {
            for (const scope of AI_CONSENT_SCOPES) if (revocations[scope] !== undefined) loaded = withConsentRevoked(loaded, scope);
          }
          for (const scope of revoking.get(newOwner) ?? []) loaded = withConsentRevoked(loaded, scope);
          set(newOwner, loaded);
        },
      );
    },

    has(scope: AiConsentScope): boolean {
      return owner !== null && hasValidConsent(record, scope);
    },

    getRecord(): AiConsentRecord {
      return record;
    },

    /** `true` = accord actif (au moins pour la session). `false` = aucun compte, ou compte changé pendant l'attente. */
    async grant(scope: AiConsentScope): Promise<boolean> {
      const forOwner = owner;
      const myEpoch = epoch;
      if (!forOwner) return false;
      await loading;
      if (epoch !== myEpoch || owner !== forOwner) return false;
      unmarkRevoking(forOwner, scope); // un nouvel accord explicite remplace une révocation antérieure
      const stamp = now();
      set(forOwner, withConsentGranted(record, scope, stamp));
      await enqueue(async () => {
        const cleared = await updateRevocations(forOwner, (current) => {
          const next = { ...current };
          delete next[scope];
          return next;
        });
        if (!cleared) return false; // trace non effaçable : accord de session seulement, rien de persisté
        return rewriteMain(forOwner, (current) => withConsentGranted(current, scope, stamp));
      });
      return true;
    },

    /**
     * Bloque immédiatement, puis persiste. `true` = révocation VÉRIFIÉE sur au moins un support (relecture) ; `false` =
     * non enregistrée (blocage maintenu pour la session ; rappeler `revoke` pour réessayer).
     */
    async revoke(scope: AiConsentScope): Promise<boolean> {
      const forOwner = owner;
      if (!forOwner) return true;
      markRevoking(forOwner, scope);
      set(forOwner, withConsentRevoked(record, scope)); // effet immédiat
      const stamp = now().toISOString();
      const persisted = await enqueue(async () => {
        const traceOk = await updateRevocations(forOwner, (current) => ({ ...current, [scope]: stamp })); // trace d'abord
        const mainOk = await rewriteMain(forOwner, (current) => withConsentRevoked(current, scope));
        return traceOk || mainOk;
      });
      if (persisted) unmarkRevoking(forOwner, scope);
      return persisted;
    },
  };
}

export type AiConsentController = ReturnType<typeof createAiConsentController>;
