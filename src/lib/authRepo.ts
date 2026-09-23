// CHANTIER "Data Safety P0-1 — récupération du compte / conversion anonyme → permanent" (2026-09-20).
// Couche AUTH, volontairement séparée de supabaseRepo.ts (qui reste dédié aux données contacts/
// pensées) — aucune de ces fonctions ne touche `contacts`/`pensees`/l'outbox, uniquement
// `supabase.auth`. Toutes les erreurs sont retournées explicitement (jamais lancées telles quelles
// vers l'UI sans contexte), avec `error.code` (typé par le SDK, voir @supabase/auth-js ErrorCode)
// quand disponible — permet à l'appelant de distinguer précisément `email_exists`/`otp_expired`/etc.
// sans parser un message texte fragile.
//
// IMPORTANT — architecture V1 retenue (2026-09-20) : plus AUCUN de ces helpers ne crée de session
// anonyme "au cas où". `startAnonymousSession` n'est appelée QUE par le choix explicite "Continuer"
// de l'utilisateur (voir AuthGateScreen.tsx/store.tsx) — jamais automatiquement au boot, jamais en
// arrière-plan. Le chemin "J'ai déjà un compte" (requestExistingAccountOtp/verifyExistingAccountOtp)
// ne crée JAMAIS de compte (`shouldCreateUser:false` explicite).
import { supabase } from './supabase';

export type ExistingSession = { userId: string; isAnonymous: boolean };

/** Résultat uniforme des opérations auth pouvant échouer — jamais une exception lancée pour un échec
 *  "normal" (email déjà pris, réseau, OTP expiré...), toujours un objet explicite que l'appelant
 *  peut inspecter (`code`) sans try/catch dédié à chaque cas. */
export type AuthOpResult = { ok: true } | { ok: false; code: string | undefined; message: string };
export type AuthOpResultWithSession = { ok: true; userId: string } | { ok: false; code: string | undefined; message: string };

function failure(error: { code?: string; message?: string } | null | undefined, fallbackMessage: string): { ok: false; code: string | undefined; message: string } {
  return { ok: false, code: error?.code, message: error?.message ?? fallbackMessage };
}

/** Lit la session ACTUELLEMENT persistée, sans jamais en créer une — opération locale pure côté
 *  client (voir `persistSession:true`, supabase.ts), fonctionne hors ligne. `null` = aucune session
 *  du tout (jamais lancé de compte anonyme, jamais de compte permanent connu sur cet appareil). */
export async function getExistingSession(): Promise<ExistingSession | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return { userId: data.session.user.id, isAnonymous: Boolean(data.session.user.is_anonymous) };
}

/** Crée EXPLICITEMENT un nouveau compte anonyme — appelée UNIQUEMENT sur action "Continuer" de
 *  l'utilisateur (AuthGateScreen), jamais en fallback silencieux. Lance en cas d'échec réseau/serveur
 *  (l'appelant décide de l'affichage — voir consigne §7 "un abandon du flow ne doit jamais bloquer le
 *  boot normal futur" : l'appelant réaffiche simplement l'auth gate si ceci échoue). */
export async function startAnonymousSession(): Promise<ExistingSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) return null;
  return { userId: data.session.user.id, isAnonymous: true };
}

/**
 * OUTIL DEV UNIQUEMENT (CHANTIER "Data Safety P0-1 — test récupération sans réinstallation",
 * 2026-09-20) — déconnecte la session Supabase active, pour simuler la perte locale d'un appareil
 * (perte de `persistSession`, réinstallation) SANS jamais toucher au métier auth réel
 * (requestExistingAccountOtp/verifyExistingAccountOtp/updateUser restent strictement inchangés).
 * Garde `__DEV__` explicite : ne fait RIEN en build production, même si appelée par erreur —
 * l'appelant (store.tsx `devSimulateReinstall`) est lui-même gardé par `__DEV__`, deux niveaux de
 * protection volontaires plutôt qu'un seul.
 */
export async function devSignOutForReinstallSimulation(): Promise<void> {
  if (!__DEV__) return;
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Chemin "J'ai déjà un compte" — étape 1. `shouldCreateUser:false` EXPLICITE : ne crée JAMAIS de
 * nouveau compte si l'email est inconnu (voir consigne — comportement exact de Supabase sur un email
 * inconnu avec ce réglage n'est pas garanti identique à `email_exists`/un code dédié par la
 * documentation du SDK ; l'appelant doit traiter tout échec ici comme "email non trouvé ou erreur",
 * jamais supposer un code précis non confirmé).
 */
export async function requestExistingAccountOtp(email: string): Promise<AuthOpResult> {
  if (!supabase) return { ok: false, code: undefined, message: 'Supabase non configuré' };
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return failure(error, 'Envoi du code impossible');
  return { ok: true };
}

/** Chemin "J'ai déjà un compte" — étape 2. `type:'email'` (login OTP standard, PAS 'email_change' —
 *  celui-ci est réservé à `verifyAccountSecurityOtp` ci-dessous, sur un compte DÉJÀ authentifié).
 *  Succès → NOUVELLE session, `userId` = celui du compte PERMANENT retrouvé (jamais celui d'une
 *  session anonyme temporaire, puisqu'aucune n'a été créée sur ce chemin). */
export async function verifyExistingAccountOtp(email: string, token: string): Promise<AuthOpResultWithSession> {
  if (!supabase) return { ok: false, code: undefined, message: 'Supabase non configuré' };
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.session) return failure(error, 'Code invalide');
  return { ok: true, userId: data.session.user.id };
}

/**
 * Sécurisation du compte courant (anonyme → permanent) — étape 1. `updateUser({email})` sur la
 * session ACTIVE (jamais `linkIdentity`, réservée OAuth/IdToken — voir audit dédié, aucune surcharge
 * SDK n'accepte `{email}`). Envoie un email de confirmation ; aucun changement de session tant que le
 * code n'est pas vérifié (voir `verifyAccountSecurityOtp`).
 */
export async function requestAccountSecurityEmail(email: string): Promise<AuthOpResult> {
  if (!supabase) return { ok: false, code: undefined, message: 'Supabase non configuré' };
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return failure(error, 'Envoi du code impossible');
  return { ok: true };
}

/** Sécurisation du compte courant — étape 2. `type:'email_change'` EXPLICITE (distinct du login OTP
 *  ci-dessus) — confirme le changement d'email sur la session anonyme déjà active. Succès →
 *  `userId` retourné DOIT être comparé par l'appelant à l'id d'avant la conversion (voir
 *  store.tsx/SettingsScreen : "user.id avant === user.id après" est une vérification EXPLICITE côté
 *  appelant, jamais supposée ici). */
export async function verifyAccountSecurityOtp(email: string, token: string): Promise<AuthOpResultWithSession> {
  if (!supabase) return { ok: false, code: undefined, message: 'Supabase non configuré' };
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
  if (error || !data.session) return failure(error, 'Code invalide');
  return { ok: true, userId: data.session.user.id };
}

// CORRECTIF "Auth P0-1 — OTP réel" (2026-09-20) : le token réel envoyé par Supabase (via Brevo, test
// device réel) fait 8 chiffres, pas 6 — l'UI ne doit JAMAIS supposer une longueur fixe. Plage
// acceptée large (6 à 10 chiffres) pour rester correcte quel que soit le fournisseur SMTP/la config
// Supabase. Reste une `string` de bout en bout (jamais parsé en `number`) pour préserver un éventuel
// zéro initial — `verifyOtp` attend une chaîne, et un zéro initial perdu casserait la comparaison
// côté serveur.
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

/** Nettoie une saisie OTP : ne garde que les chiffres, tronque à `OTP_MAX_LENGTH` — jamais de
 *  troncature à 6, jamais de padding automatique, jamais de conversion en nombre. */
export function sanitizeOtpInput(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, OTP_MAX_LENGTH);
}

/** Le bouton "Vérifier" devient disponible dès `OTP_MIN_LENGTH` chiffres — jamais un auto-submit
 *  déclenché depuis ce seuil, seulement une disponibilité du bouton (voir appelants). */
export function isOtpSubmittable(otp: string): boolean {
  return otp.length >= OTP_MIN_LENGTH && otp.length <= OTP_MAX_LENGTH;
}

/** Message utilisateur pour un `AuthOpResult`/`AuthOpResultWithSession` en échec — codes couverts
 *  explicitement (voir @supabase/auth-js `ErrorCode`, confirmés par audit dédié), jamais un texte
 *  brut de l'API affiché tel quel par défaut (`message` reste un repli, pas la source principale).
 *  UNIQUEMENT de l'affichage — ne décide jamais du comportement (voir les appelants pour la logique
 *  "email_exists → STOP sans changer la session", etc.). */
export function describeAuthErrorCode(code: string | undefined, fallbackMessage: string): string {
  switch (code) {
    case 'email_exists':
    case 'identity_already_exists':
    case 'email_conflict_identity_not_deletable':
      return 'Un compte Pensif existe déjà avec cet email.';
    // CHANTIER "Post-TestFlight Phase 6 — Recovery erreur email inconnu" (2026-09-23) — CORRECTIF :
    // `requestExistingAccountOtp` (`shouldCreateUser: false` explicite) renvoyait, sur un email ne
    // correspondant à AUCUN compte, une erreur dont le `code` ne figurait dans AUCUN cas ci-dessous —
    // elle retombait donc sur `fallbackMessage` (le texte anglais brut de Supabase, ex. observé en
    // test physique), affiché tel quel à l'utilisateur. `otp_disabled` est le code officiel confirmé
    // dans `@supabase/auth-js` (voir error-codes.ts, ErrorCode — "Sign in with OTP is disabled",
    // renvoyé notamment quand la création est refusée pour un email inconnu). Vérifié dans le SDK
    // installé (2.116.0), pas supposé arbitrairement — à reconfirmer par un test physique sur Build 2
    // (aucun appel réseau réel possible dans cette passe) : si un autre code apparaissait en
    // conditions réelles, ce `case` devra être complété, jamais remplacé par une supposition.
    case 'otp_disabled':
      return "Aucun compte Pensif n'est associé à cette adresse. Vérifie l'adresse saisie ou continue avec un nouveau compte.";
    case 'email_address_invalid':
      return 'Cette adresse email ne semble pas valide.';
    case 'otp_expired':
      return 'Ce code a expiré. Demande-en un nouveau.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de tentatives — réessaie dans quelques minutes.';
    case 'email_provider_disabled':
    case 'signup_disabled':
    case 'anonymous_provider_disabled':
      return 'Cette fonctionnalité est momentanément indisponible.';
    default:
      return fallbackMessage || 'Une erreur est survenue. Réessaie.';
  }
}
