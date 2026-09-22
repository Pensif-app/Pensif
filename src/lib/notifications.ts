import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { canScheduleExactAlarms } from 'expo-exact-alarm';
import { Contact, Pensee } from '../data/types';
import { navigateToAttention } from '../data/homeAttention';
import {
  MAX_SCHEDULED_NOTIFICATIONS,
  NotificationCandidate,
  buildCandidates,
  consumeNotificationResponseOnce,
  createPendingOnce,
  resolveNotificationAction,
  scheduleCandidateGroupsAtomically,
  selectCandidateGroupsToSchedule,
  toExpoWeekday,
} from './notificationPlanning';

export type { NotificationTapData } from './notificationPlanning';
export { resolveNotificationAction } from './notificationPlanning';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * BUG NOTIFICATIONS PENSÉES V2 (Android) : `scheduleNotificationAsync` résolvait sans erreur et
 * `reminderAt` était correctement construit et futur, mais AUCUNE notification n'était jamais
 * délivrée sur Pixel 8. Cause identifiée : sur Android 8+ (API 26+), une notification programmée
 * sans canal ("notification channel") explicite peut être silencieusement ignorée par l'OS — ce
 * n'était vrai ni pour les anniversaires ni pour aucune autre notification testée AVANT ce chantier
 * uniquement parce qu'aucun test réel sur device n'avait encore poussé une notification jusqu'à son
 * heure de déclenchement sans l'app ouverte. Un seul canal suffit pour tout Pensif (aucune
 * distinction de type de notification n'était demandée).
 */
const ANDROID_CHANNEL_ID = 'pensif-reminders';

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;
  // Le champ `sound` n'accepte PAS le sentinel "default" : côté natif (expo-notifications,
  // AndroidXNotificationsChannelManager), toute chaîne fournie ici est résolue comme un FICHIER
  // audio personnalisé embarqué (config plugin `sounds`) — d'où l'avertissement "Custom sound
  // 'default' not found". Le son système par défaut s'obtient en OMETTANT entièrement ce champ
  // (le natif utilise alors `Settings.System.DEFAULT_NOTIFICATION_URI`) ; lui passer `null`
  // rendrait au contraire le canal silencieux. On ne veut aucun son personnalisé pour l'instant.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Rappels Pensif',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function ensureNotificationPermissions() {
  if (Platform.OS === 'web') return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** État actuel de la permission, sans en redemander une — pour l'affichage dans les réglages. */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported';
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return 'granted';
  if (settings.canAskAgain === false) return 'denied';
  return 'undetermined';
}

export async function cancelAllReminders() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Recalcule et reprogramme tous les rappels locaux à partir des contacts et pensées actuels.
 *
 * CHANTIER NOTIFICATIONS RÉCURRENTES — incrément 3, "Décision overflow >56" (2026-09-18) — ORDRE
 * CORRIGÉ (l'incrément 2 annulait l'ancien planning AVANT même de savoir si le nouveau tenait dans le
 * budget, ce qui pouvait détruire un planning OS valide pour rien) :
 *   1. construire la demande complète (`buildCandidates`) ;
 *   2. résoudre la capacité par GROUPES ATOMIQUES (`selectCandidateGroupsToSchedule`) — jamais une
 *      série représentée partiellement (voir sa docstring, notificationPlanning.ts) ;
 *   3. le planning final est alors connu (`selection.scheduledCandidates`) ;
 *   4. SEULEMENT ENSUITE annuler l'ancien planning ;
 *   5. programmer le nouveau.
 * Exception : si la permission n'est plus accordée, on nettoie immédiatement tout reliquat (aucun
 * planning à protéger dans ce cas — voir branche dédiée ci-dessous) et on ne demande jamais la
 * permission ici (seule une action utilisateur explicite doit le faire, voir
 * `ensureNotificationPermissions`).
 *
 * Un groupe qui ne tient plus dans la capacité restante (`rejectedGroups`) est simplement absent du
 * planning programmé — il n'empêche JAMAIS les autres groupes (rappels ponctuels, anniversaires,
 * autres récurrences) d'être programmés normalement. Un échec individuel de programmation Expo (ex.
 * budget OS dépassé) n'interrompt jamais les candidats suivants — voir la docstring de chaque boucle
 * ci-dessous pour la limite connue de cette non-transactionnalité.
 */
export async function rescheduleAllReminders(contacts: Contact[], pensees: Pensee[], today: Date, userName?: string | null) {
  if (Platform.OS === 'web') return;

  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') {
    // Permission absente/retirée : aucun planning à construire ni à protéger — on se contente de
    // nettoyer un éventuel reliquat programmé pendant qu'elle était encore accordée (voir ancien §9,
    // comportement inchangé). Jamais de nouveau prompt ici.
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  if (__DEV__) {
    // Log allégé (BUG NOTIFICATIONS ANDROID "systématiquement en retard" — résolu et validé sur
    // device réel) : un seul log par reschedule global, plus aucun détail par notification ni
    // dump de la liste programmée (voir CHANTIER NETTOYAGE POST-DEBUG).
    console.log(`[Pensif][notifications] exactAlarm=${canScheduleExactAlarms()}`);
  }

  // Étape 1 — demande complète. Une pensée en récurrence infinie n'y génère JAMAIS de `oneShot` pour
  // sa "première occurrence" en plus de son trigger récurrent (voir buildPenseeReminderCandidates :
  // un seul point de vérité par pensée, aucune double génération possible).
  const allCandidates = buildCandidates(contacts, pensees, today, userName);

  // Étape 2 — résolution de capacité par GROUPES ATOMIQUES : une pensée (ponctuelle, récurrence finie
  // ou infinie) forme un seul groupe — soit intégralement programmée, soit intégralement absente.
  // `rejectedGroups` (actuellement seulement journalisé en __DEV__ — pas encore d'UI, voir consigne)
  // documente précisément ce qui a dû être écarté pour un futur écran de diagnostic utilisateur.
  const selection = selectCandidateGroupsToSchedule(allCandidates, new Date());
  if (__DEV__ && selection.rejectedGroups.length > 0) {
    console.warn(
      `[Pensif][notifications] ${selection.rejectedGroups.length} groupe(s) non représentable(s) faute de capacité ` +
        `(${selection.scheduledSlots}/${selection.requiredSlots} slots programmés, budget=${MAX_SCHEDULED_NOTIFICATIONS}) :`,
      selection.rejectedGroups,
    );
  }

  // Étape 3 (implicite) — `selection.scheduledCandidates` EST le planning final cohérent : à ce stade
  // plus aucune décision de capacité ne reste à prendre.

  // Étape 4 — annulation SEULEMENT MAINTENANT que le planning final est connu (jamais avant, voir
  // consigne "on ne doit jamais détruire le planning OS existant simplement parce que le nouveau
  // planning brut dépasse 56").
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Voir le commentaire au-dessus d'ANDROID_CHANNEL_ID : condition nécessaire à la délivrance réelle
  // sur Android 8+, pour CHAQUE trigger (DATE, DAILY ou WEEKLY) — pas seulement à la réussite de
  // scheduleNotificationAsync().
  await ensureAndroidNotificationChannel();
  const androidChannelId = Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined;

  // Étape 5 — programmation ATOMIQUE PAR GROUPE (CHANTIER NOTIFICATIONS RÉCURRENTES, incrément 3,
  // "atomicité réelle du scheduling", 2026-09-18) : `scheduleCandidateGroupsAtomically`
  // (notificationPlanning.ts, pure) garantit qu'un groupe accepté par la sélection finit RÉELLEMENT
  // 100% programmé côté OS ou 0% — jamais un résultat partiel (ex. 2/5 occurrences d'une série finie)
  // — en annulant (par `identifier` déterministe, AUCUNE persistance supplémentaire) tout ce qui a
  // été programmé pour un groupe dès que l'un de ses candidats échoue. Un groupe en échec (scheduling
  // OU rollback) reste totalement ISOLÉ : il n'affecte jamais le sort des autres groupes.
  const scheduling = await scheduleCandidateGroupsAtomically(selection.scheduledCandidates, {
    // CHANTIER "P0 Récurrence Phase 1" (2026-09-21) — consigne §10/§13 : AUDIT a montré que
    // `scheduleCandidateGroupsAtomically` (notificationPlanning.ts, NON modifié ici — voir consigne
    // §8) avale l'erreur Expo réelle dans un `catch {}` nu autour de `ops.schedule(candidate)` — elle
    // ne sait dire QUE "ce groupe a échoué", jamais POURQUOI. Wrapper additif ICI (couche
    // `notifications.ts` uniquement) : journalise l'erreur RÉELLE avant qu'elle ne soit avalée en
    // amont, puis la relance à l'identique — comportement de `scheduleCandidateGroupsAtomically`
    // strictement inchangé (même rollback, mêmes `failedGroups`), uniquement de la visibilité en plus.
    schedule: async (c) => {
      try {
        await scheduleOneCandidate(c, androidChannelId);
      } catch (error) {
        if (__DEV__) console.error(`[Pensif][notif-debug] ÉCHEC scheduleNotificationAsync pour identifier="${c.identifier}" kind=${c.kind} :`, error);
        throw error;
      }
    },
    cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
    onCancelError: (identifier, error) => {
      // Rollback impossible pour CET identifiant précis — capturé, jamais fatal : les autres
      // annulations du même rollback continuent (voir scheduleCandidateGroupsAtomically), et le
      // prochain rescheduleAllReminders (cancelAllScheduledNotificationsAsync global, voir plus haut)
      // reste le filet de sécurité final. Aucun système transactionnel plus complexe ici (consigne).
      if (__DEV__) console.warn('[Pensif] échec de l’annulation de rollback pour', identifier, error);
    },
  });
  if (__DEV__ && scheduling.failedGroups.length > 0) {
    console.warn(
      `[Pensif][notifications] ${scheduling.failedGroups.length} groupe(s) intégralement annulé(s) après un échec de programmation Expo en cours de route :`,
      scheduling.failedGroups,
    );
  }
}

/** Traduit UN candidat en appel `scheduleNotificationAsync` — traduction EXHAUSTIVE par `kind` (voir
 *  consigne "incrément 2, point 2") : `oneShot` → trigger DATE ; `recurringDaily`/`recurringWeekly` →
 *  trigger natif DAILY/WEEKLY (`toExpoWeekday` — conversion EXPLICITE et VÉRIFIÉE, jamais supposée
 *  identique à `Date.getDay()`, voir notificationPlanning.ts). Identifiant déterministe transmis tel
 *  quel (`NotificationRequestInput.identifier`, confirmé par l'audit) — aucun stockage d'ID
 *  supplémentaire côté Pensif : c'est ce même `identifier` qui permet un rollback ciblé (voir
 *  `scheduleCandidateGroupsAtomically`). Isolée dans sa propre fonction pour être injectée telle
 *  quelle comme `ops.schedule` (le moteur d'atomicité ne connaît, lui, aucun détail Expo). */
async function scheduleOneCandidate(c: NotificationCandidate, androidChannelId: string | undefined): Promise<void> {
  const trigger =
    c.kind === 'oneShot'
      ? { type: Notifications.SchedulableTriggerInputTypes.DATE as const, date: c.triggerAt, channelId: androidChannelId }
      : c.kind === 'recurringDaily'
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY as const, hour: c.hour, minute: c.minute, channelId: androidChannelId }
      : {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY as const,
          weekday: toExpoWeekday(c.weekday),
          hour: c.hour,
          minute: c.minute,
          channelId: androidChannelId,
        };
  await Notifications.scheduleNotificationAsync({
    identifier: c.identifier,
    content: { title: c.title, body: c.body, sound: true, data: c.data as unknown as Record<string, unknown> },
    trigger,
  });
}

/**
 * Dev helper temporaire (BUG NOTIFICATIONS PENSÉES V2) : programme une notification locale
 * totalement indépendante des pensées/contacts, 60 secondes après l'appel — sert à distinguer
 * "Expo/Android ne délivre aucune notification" de "le planificateur Pensées V2 ne programme pas
 * correctement le rappel". Bouton correspondant : SettingsScreen.tsx (visible en __DEV__ seulement).
 */
export async function scheduleTestNotificationIn60Seconds(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const granted = await ensureNotificationPermissions();
  if (!granted) return null;
  await ensureAndroidNotificationChannel();
  const triggerAt = new Date(Date.now() + 60_000);
  const identifier = await Notifications.scheduleNotificationAsync({
    content: { title: '🧪 Test Pensif', body: 'Notification de test, indépendante des pensées.', sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerAt,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
    },
  });
  if (__DEV__) console.log(`[Pensif][notif-debug] test +60s programmé — identifier=${identifier} triggerAt=${triggerAt.toString()}`);
  return identifier;
}

/**
 * Branche le tap sur une notification à la navigation réelle — à appeler une seule fois au
 * démarrage de l'app (voir App.tsx). Trois précautions, toutes vérifiées lors de l'audit "cold
 * start" :
 *
 * 1. Déduplication par identifiant (`consumeNotificationResponseOnce`) : `getLastNotificationResponseAsync`
 *    et le listener live peuvent en théorie recevoir la même interaction — la même réponse ne
 *    déclenche jamais deux navigations.
 * 2. `clearLastNotificationResponseAsync` après consommation : sans ça, l'OS ne "oublie" jamais la
 *    dernière réponse, et un simple lancement normal de l'app des jours plus tard la rejouerait à
 *    chaque fois (aucune notification n'a pourtant été touchée à ce moment-là).
 * 3. `isReady()` + file d'attente d'UNE seule action en attente : au tout début du boot (app fermée
 *    puis ouverte par un tap), ni le NavigationContainer ni les contacts réels du store ne sont
 *    encore prêts — la navigation est mise en attente et résolue avec les données LIVE dès que
 *    `isReady()` devient vrai (l'appelant doit rappeler `retryPending()` quand ses propres
 *    conditions de disponibilité changent), jamais avec un état vide figé au moment du tap.
 */
export function registerNotificationTapHandler(
  navigate: (name: string, params?: object) => void,
  getContacts: () => Contact[],
  isReady: () => boolean,
  // CHANTIER NAVIGATION NOTIFICATION PENSÉES V2 : nécessaire pour que resolveNotificationAction
  // puisse vérifier qu'une pensée existe encore avant d'y naviguer (voir son garde-fou "supprimée
  // entre-temps"), avec les données LIVE au moment du tap — même principe que getContacts.
  getPensees: () => Pensee[],
): { unsubscribe: () => void; retryPending: () => void } {
  const handledIds = new Set<string>();
  const pending = createPendingOnce<unknown>();

  function retryPending() {
    if (!pending.hasPending() || !isReady()) return;
    // Consommée AVANT tout calcul/navigation : jamais rejouée, même si resolveNotificationAction ou
    // navigate() échoue derrière.
    const data = pending.consumeIfReady(isReady);
    const action = resolveNotificationAction(data, getContacts(), getPensees(), new Date());
    if (action) navigateToAttention(navigate, action);
  }

  function handle(response: Notifications.NotificationResponse) {
    if (!consumeNotificationResponseOnce(response.notification.request.identifier, handledIds)) return;
    pending.set(response.notification.request.content.data);
    retryPending();
  }

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      handle(response);
      // Empêche cette même réponse de "revenir" au prochain lancement normal de l'app — l'OS ne la
      // nettoie jamais tout seul (voir point 2 ci-dessus).
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    })
    .catch(() => {});

  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return { unsubscribe: () => subscription.remove(), retryPending };
}
