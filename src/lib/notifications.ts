import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Contact, Pensee } from '../data/types';
import { namedayTable, normalizeName, reminderLabels } from '../data/calendar';
import { isQuizComplete } from '../data/quiz';

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

/** Prochaine occurrence (à 9h locales) d'une date 'YYYY-MM-DD', en ignorant l'année fournie. */
function nextOccurrence(dateStr: string, today: Date): Date {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let d = new Date(today.getFullYear(), month, day, 9, 0, 0);
  if (d < todayMid) d = new Date(today.getFullYear() + 1, month, day, 9, 0, 0);
  return d;
}

async function scheduleAt(date: Date, title: string, body: string) {
  if (date.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

/**
 * Recalcule et reprogramme tous les rappels locaux à partir des contacts et pensées actuels.
 * Annule d'abord tout ce qui était programmé — l'app n'utilise pas les notifications pour autre chose,
 * donc c'est plus simple et plus fiable que de suivre des identifiants un par un.
 */
export async function rescheduleAllReminders(contacts: Contact[], pensees: Pensee[], today: Date, userName?: string | null) {
  if (Platform.OS === 'web') return;
  const granted = await ensureNotificationPermissions();
  if (!granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const c of contacts) {
    if (!c.date) continue;

    const bday = nextOccurrence(c.date, today);
    await scheduleAt(bday, `🎂 Anniversaire de ${c.prenom}`, "C'est aujourd'hui — un petit message lui ferait plaisir.");

    if (isQuizComplete(c.quiz)) {
      const reminder = new Date(bday);
      reminder.setDate(reminder.getDate() - 14);
      await scheduleAt(
        reminder,
        `🎁 Dans 14 jours, l'anniversaire de ${c.prenom}`,
        'Des idées cadeaux adaptées à son budget t’attendent dans Pensif.',
      );
    }

    const mmdd = namedayTable[normalizeName(c.prenom)];
    if (mmdd) {
      const nameDay = nextOccurrence(`2000-${mmdd}`, today);
      await scheduleAt(nameDay, `🎉 C'est la fête de ${c.prenom} !`, 'Bonus : une petite attention possible aujourd’hui.');
    }
  }

  if (userName) {
    const userMmdd = namedayTable[normalizeName(userName)];
    if (userMmdd) {
      const nameDay = nextOccurrence(`2000-${userMmdd}`, today);
      await scheduleAt(nameDay, '🎉 C’est ta fête aujourd’hui !', 'Profite de ta journée 😊');
    }
  }

  for (const p of pensees) {
    const parts = p.date.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (p.remind === 'custom') {
      if (p.customOffsetMinutes == null) continue;
      // Même référence que le sélecteur dans l'app : la fin de la journée choisie, pas 9h — un
      // rappel personnalisé doit pouvoir tomber n'importe quand dans le reste de ce jour-là.
      const endOfDay = new Date(year, month, day, 23, 59, 59);
      const reminder = new Date(endOfDay.getTime() - p.customOffsetMinutes * 60000);
      await scheduleAt(reminder, '💭 Pensée', p.texte);
      continue;
    }
    const target = new Date(year, month, day, 9, 0, 0);
    const reminder = new Date(target);
    reminder.setDate(reminder.getDate() - parseInt(p.remind, 10));
    await scheduleAt(reminder, '💭 Pensée', `${p.texte} (rappel ${reminderLabels[p.remind]})`);
  }
}
