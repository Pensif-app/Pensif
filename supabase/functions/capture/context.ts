// Validation du contexte temporel envoyé par le client + dérivation du jour de semaine côté
// SERVEUR (le client n'envoie plus `weekday` — CORRECTION explicite : deux sources de vérité
// contradictoires étaient possibles sinon). `localDateTime` est un couple de composants calendaires
// (année/mois/jour) — le jour de semaine d'une date ne dépend PAS du fuseau horaire, donc aucune
// conversion de fuseau n'est nécessaire ici : `Date.UTC` n'est utilisé que comme calcul calendaire
// pur (jamais pour représenter un instant réel), même discipline que reminderDate.ts côté app
// (jamais de réinterprétation implicite d'une valeur locale).
import { TemporalContext } from '../_shared/captureContract.ts';

const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

export class InvalidContextError extends Error {}

function isValidTimeZone(timezone: string): boolean {
  try {
    // @ts-ignore — Intl.supportedValuesOf est disponible sous Deno mais pas toujours dans les types lib DOM ciblés.
    const supported: string[] = Intl.supportedValuesOf('timeZone');
    return supported.includes(timezone);
  } catch {
    // Environnement sans Intl.supportedValuesOf : on retombe sur une vérification de format minimale
    // plutôt que de bloquer toute requête pour une raison indépendante de l'utilisateur.
    return typeof timezone === 'string' && timezone.length > 0 && !timezone.includes(' ');
  }
}

/**
 * Valide `timezone`/`localDateTime` (bruts, venant du client) et dérive `weekday`. Lève
 * `InvalidContextError` (→ 400) si l'un des deux champs est absent, mal typé ou mal formé —
 * jamais de valeur par défaut silencieuse qui fausserait la résolution de "vendredi"/"demain" par
 * le LLM.
 */
export function buildTemporalContext(raw: unknown): TemporalContext {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidContextError('context manquant ou invalide');
  }
  const { timezone, localDateTime } = raw as Record<string, unknown>;

  if (typeof timezone !== 'string' || !isValidTimeZone(timezone)) {
    throw new InvalidContextError('context.timezone manquant ou invalide (attendu : identifiant IANA, ex. "Europe/Paris")');
  }
  if (typeof localDateTime !== 'string') {
    throw new InvalidContextError('context.localDateTime manquant ou invalide (attendu : "YYYY-MM-DDTHH:mm:ss", sans Z/offset)');
  }
  const match = LOCAL_DATETIME_PATTERN.exec(localDateTime);
  if (!match) {
    throw new InvalidContextError('context.localDateTime doit être au format "YYYY-MM-DDTHH:mm:ss", sans Z ni offset');
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  // Calcul calendaire pur (voir commentaire d'en-tête) — pas une conversion de fuseau.
  const asUtcCalendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtcCalendarDate.getUTCFullYear() !== year ||
    asUtcCalendarDate.getUTCMonth() !== month - 1 ||
    asUtcCalendarDate.getUTCDate() !== day ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59
  ) {
    throw new InvalidContextError('context.localDateTime ne correspond à aucune date/heure calendaire réelle');
  }

  const weekday = WEEKDAYS_FR[asUtcCalendarDate.getUTCDay()];

  return { timezone, localDateTime, weekday };
}
