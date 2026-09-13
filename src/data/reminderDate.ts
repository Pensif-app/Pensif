// Construction d'un rappel absolu à partir de composants LOCAUX — extrait de PenseeDetailScreen.tsx
// (BUG PENSÉES V2 ANDROID : un rappel pourtant futur était rejeté comme "dans le passé") pour rester
// pur et testable sous ts-node, et pour que la règle soit appliquée à un seul endroit : une date/
// heure saisie par l'utilisateur représente toujours un instant LOCAL sur l'appareil, jamais une
// chaîne à interpréter en UTC. Toute construction passe par `new Date(year, month, day, hour,
// minute, 0, 0)` — jamais par une chaîne ISO/`Date.parse` pour une saisie utilisateur.

export type LocalDateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

/** Décompose un Date en ses composants LOCAUX (jamais UTC) — utilisé pour lire ce qu'un picker natif
 *  a réellement retourné, un seul champ à la fois. */
export function toLocalDateTimeParts(d: Date): LocalDateTimeParts {
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
}

/** Reconstruit un Date à partir de composants locaux explicites. C'est la SEULE façon de construire
 *  un rappel dans ce module — jamais via une chaîne ISO (qui serait interprétée en UTC) ni via un
 *  `Date` copié puis muté (`new Date(prev)` + `setHours`/`setFullYear`), qui propagerait sans le
 *  détecter une valeur déjà faussée par un picker natif. */
export function fromLocalDateTimeParts(parts: LocalDateTimeParts): Date {
  return new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute, 0, 0);
}

/** Remplace le JOUR (année/mois/jour) d'un rappel existant par celui choisi dans le picker date,
 *  en conservant l'heure déjà réglée — reconstruit un Date NEUF à partir des composants locaux des
 *  deux, jamais une mutation de l'un par l'autre. */
export function withLocalDate(base: Date, pickedDate: Date): Date {
  const time = toLocalDateTimeParts(base);
  const day = toLocalDateTimeParts(pickedDate);
  return fromLocalDateTimeParts({ ...time, year: day.year, month: day.month, day: day.day });
}

/** Remplace l'HEURE (heure/minute) d'un rappel existant par celle choisie dans le picker heure, en
 *  conservant le jour déjà réglé — même principe que withLocalDate. */
export function withLocalTime(base: Date, pickedTime: Date): Date {
  const day = toLocalDateTimeParts(base);
  const time = toLocalDateTimeParts(pickedTime);
  return fromLocalDateTimeParts({ ...day, hour: time.hour, minute: time.minute });
}

/** Un rappel est-il réellement futur ? Comparaison d'INSTANTS (epoch ms, `getTime()`), jamais de
 *  chaînes ni de composants — la seule comparaison de dates fiable quelle que soit la façon dont
 *  chacune a été construite. */
export function isFutureReminder(reminder: Date, now: Date = new Date()): boolean {
  return reminder.getTime() > now.getTime();
}
