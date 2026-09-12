import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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
 */
export async function rescheduleAllReminders(contacts: Contact[], pensees: Pensee[], today: Date, userName?: string | null) {
  if (Platform.OS === 'web') return;

  // Annulation D'ABORD, indépendamment du résultat de la permission : si la permission a été
  // retirée depuis les réglages système entre-temps, on ne doit jamais laisser un planning
  // programmé quand la permission était encore accordée traîner silencieusement (voir §9) — annuler
  // ne nécessite pas la permission elle-même.
  await Notifications.cancelAllScheduledNotificationsAsync();

  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  const candidates = selectCandidatesToSchedule(buildCandidates(contacts, pensees, today, userName), new Date());

  for (const c of candidates) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: c.title, body: c.body, sound: true, data: c.data as unknown as Record<string, unknown> },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: c.triggerAt },
      });
    } catch (e) {
      if (__DEV__) console.warn('[Pensif] échec de programmation d’une notification', c.data, e);
      // On continue avec les suivantes — un échec isolé (ex. limite système atteinte) ne doit
      // jamais faire perdre le reste du lot déjà trié par priorité.
    }
  }
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
): { unsubscribe: () => void; retryPending: () => void } {
  const handledIds = new Set<string>();
  const pending = createPendingOnce<unknown>();

  function retryPending() {
    if (!pending.hasPending() || !isReady()) return;
    // Consommée AVANT tout calcul/navigation : jamais rejouée, même si resolveNotificationAction ou
    // navigate() échoue derrière.
    const data = pending.consumeIfReady(isReady);
    const action = resolveNotificationAction(data, getContacts(), new Date());
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
