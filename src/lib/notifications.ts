import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { canScheduleExactAlarms } from 'expo-exact-alarm';
import { Contact, Pensee } from '../data/types';
import { navigateToAttention } from '../data/homeAttention';
import {
  buildCandidates,
  consumeNotificationResponseOnce,
  createPendingOnce,
  resolveNotificationAction,
  selectCandidatesToSchedule,
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
 * Annule d'abord tout ce qui était programmé (l'app n'utilise pas les notifications pour autre
 * chose), construit tous les candidats possibles (voir notificationPlanning.ts), les trie par
 * priorité (occurrence en cours avant occurrence suivante, puis par proximité), et n'en programme
 * qu'un nombre borné — jamais un anniversaire dans plus d'un an n'évince une pensée proche, et
 * jamais plus que le budget défini dans notificationPlanning.ts. Un échec individuel de
 * programmation (ex. budget déjà atteint côté OS) n'interrompt jamais les suivants.
 *
 * Appelée automatiquement (à chaque changement de données, au retour au premier plan…) — elle ne
 * doit donc JAMAIS déclencher le prompt système de permission (voir CHANTIER PRÉ-BÊTA 1 §5) : elle
 * se contente de VÉRIFIER l'état actuel (getNotificationPermissionStatus) et renonce silencieusement
 * si la permission n'est pas déjà accordée. Seule une action utilisateur explicite (le switch de
 * Réglages) doit appeler `ensureNotificationPermissions`, qui, elle, peut demander.
 */
export async function rescheduleAllReminders(contacts: Contact[], pensees: Pensee[], today: Date, userName?: string | null) {
  if (Platform.OS === 'web') return;

  // Annulation D'ABORD, indépendamment de la permission : si elle a été retirée depuis les réglages
  // système entre-temps, on ne doit jamais laisser un planning programmé quand elle était encore
  // accordée traîner silencieusement (voir §9) — annuler ne nécessite pas la permission elle-même.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') return;

  // Voir le commentaire au-dessus d'ANDROID_CHANNEL_ID : condition nécessaire à la délivrance
  // réelle sur Android 8+, pas seulement à la réussite de scheduleNotificationAsync().
  await ensureAndroidNotificationChannel();

  if (__DEV__) {
    // Log allégé (BUG NOTIFICATIONS ANDROID "systématiquement en retard" — résolu et validé sur
    // device réel) : un seul log par reschedule global, plus aucun détail par notification ni
    // dump de la liste programmée (voir CHANTIER NETTOYAGE POST-DEBUG).
    console.log(`[Pensif][notifications] exactAlarm=${canScheduleExactAlarms()}`);
    // Diagnostic temporaire — BUG NOTIFICATIONS PENSÉES V2. Ne journalise que ce qui est
    // nécessaire au diagnostic (id, reminderAt, raison d'exclusion), jamais le texte de la pensée
    // ni aucune autre donnée personnelle.
    const nowMs = Date.now();
    for (const p of pensees) {
      if (!p.reminderAt) {
        console.log(`[Pensif][notif-debug] pensée ${p.id} ignorée — reminderAt absent (rappel désactivé)`);
        continue;
      }
      const interpreted = new Date(p.reminderAt);
      const future = interpreted.getTime() > nowMs;
      console.log(
        `[Pensif][notif-debug] pensée ${p.id} — reminderAt=${p.reminderAt} interprété=${interpreted.toString()} → ${
          future ? 'future, sera planifiée' : 'déjà passée, ignorée par selectCandidatesToSchedule'
        }`,
      );
    }
  }

  const candidates = selectCandidatesToSchedule(buildCandidates(contacts, pensees, today, userName), new Date());

  for (const c of candidates) {
    try {
      const trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DATE as const,
        date: c.triggerAt,
        channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
      };
      await Notifications.scheduleNotificationAsync({
        content: { title: c.title, body: c.body, sound: true, data: c.data as unknown as Record<string, unknown> },
        trigger,
      });
    } catch (e) {
      if (__DEV__) console.warn('[Pensif] échec de programmation d’une notification', c.data, e);
      // On continue avec les suivantes — un échec isolé (ex. limite système atteinte) ne doit
      // jamais faire perdre le reste du lot déjà trié par priorité.
    }
  }
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
