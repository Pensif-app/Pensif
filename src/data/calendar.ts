import { CalEvent, Contact, Pensee } from './types';

export const monthAbbrev = ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
export const monthFull = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
export const weekdayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const weekdayFull = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
export const dIso = (d: Date) => isoOf(d.getFullYear(), d.getMonth(), d.getDate());

export function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
export function mondayOffset(y: number, m: number) {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}
export function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function isPastDate(y: number, m: number, d: number, today: Date) {
  return new Date(y, m, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}
export function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export function mondayOf(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Algorithme de Gauss/Meeus pour le dimanche de Pâques — sert de base aux jours fériés mobiles. */
export function easterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function nthSunday(year: number, month: number, n: number) {
  const offset = (7 - new Date(year, month, 1).getDay()) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}
function lastSunday(year: number, month: number) {
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - last.getDay());
}

const holidaysCache: Record<number, Record<string, string>> = {};
export function frenchHolidays(year: number) {
  if (holidaysCache[year]) return holidaysCache[year];
  const easter = easterDate(year);
  const h: Record<string, string> = {};
  h[isoOf(year, 0, 1)] = "Jour de l'An";
  h[dIso(addDays(easter, 1))] = 'Lundi de Pâques';
  h[isoOf(year, 4, 1)] = 'Fête du Travail';
  h[isoOf(year, 4, 8)] = 'Victoire 1945';
  h[dIso(addDays(easter, 39))] = 'Ascension';
  h[dIso(addDays(easter, 50))] = 'Lundi de Pentecôte';
  h[isoOf(year, 6, 14)] = 'Fête nationale';
  h[isoOf(year, 7, 15)] = 'Assomption';
  h[isoOf(year, 10, 1)] = 'Toussaint';
  h[isoOf(year, 10, 11)] = 'Armistice 1918';
  h[isoOf(year, 11, 25)] = 'Noël';
  holidaysCache[year] = h;
  return h;
}

const familyCache: Record<number, Record<string, string>> = {};
export function familyFetes(year: number) {
  if (familyCache[year]) return familyCache[year];
  let mere = lastSunday(year, 4);
  const pentecote = addDays(easterDate(year), 50);
  if (sameDate(mere, pentecote)) mere = nthSunday(year, 5, 1); // report au 1er dimanche de juin
  const f: Record<string, string> = {};
  f[dIso(nthSunday(year, 2, 1))] = 'Fête des Grands-mères';
  f[dIso(mere)] = 'Fête des Mères';
  f[dIso(nthSunday(year, 5, 3))] = 'Fête des Pères';
  f[dIso(nthSunday(year, 9, 1))] = 'Fête des Grands-pères';
  familyCache[year] = f;
  return f;
}

/** Table simplifiée du calendrier des prénoms (non exhaustive) — juste pour illustrer le bonus "fête du prénom". */
export const namedayTable: Record<string, string> = {
  lea: '03-22', odile: '12-13', sofia: '05-25', sophie: '05-25',
  marie: '08-15', jean: '12-27', pierre: '06-29', paul: '06-29',
  nicolas: '12-06', anne: '07-26', francois: '10-04', marc: '04-25',
  claire: '08-11', thomas: '07-03',
};

export function normalizeName(s: string) {
  const decomposed = (s || '').normalize('NFD');
  let out = '';
  for (let i = 0; i < decomposed.length; i++) {
    const code = decomposed.charCodeAt(i);
    if (code < 0x300 || code > 0x36f) out += decomposed[i];
  }
  return out.toLowerCase().trim();
}

export function contactName(contacts: Contact[], id: string) {
  const c = contacts.find((x) => x.id === id);
  return c ? `${c.prenom} ${c.nom}`.trim() : '';
}

export const reminderLabels: Record<string, string> = {
  '0': 'le jour J',
  '1': '1 jour avant',
  '3': '3 jours avant',
  '7': '1 semaine avant',
  '14': '2 semaines avant',
};

/** Nombre de jours avant la prochaine occurrence (anniversaire) d'une date 'YYYY-MM-DD'. 0 = aujourd'hui. */
export function daysUntilNext(dateStr: string, today: Date) {
  const parts = dateStr.split('-');
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next < todayMid) next = new Date(today.getFullYear() + 1, month, day);
  return Math.round((next.getTime() - todayMid.getTime()) / 86400000);
}

export function getDayEvents(
  year: number,
  month: number,
  day: number,
  contacts: Contact[],
  pensees: Pensee[],
  today: Date,
  userName?: string | null,
): CalEvent[] {
  const iso = isoOf(year, month, day);
  const list: CalEvent[] = [];

  contacts.forEach((c) => {
    if (!c.date) return;
    const parts = c.date.split('-');
    if (parseInt(parts[1], 10) - 1 === month && parseInt(parts[2], 10) === day) {
      list.push({
        type: 'anniv',
        label: `${c.prenom} ${c.nom}`.trim(),
        kind: sameDate(new Date(year, month, day), today) ? "Anniversaire · aujourd'hui 🎂" : 'Anniversaire',
        contactId: c.id,
      });
    }
    const mmdd = namedayTable[normalizeName(c.prenom)];
    if (mmdd === `${pad2(month + 1)}-${pad2(day)}`) {
      list.push({ type: 'fete', label: `${c.prenom} — fête de prénom`, kind: 'Bonus 🎉 · petite attention possible', contactId: c.id });
    }
  });

  if (userName) {
    const userMmdd = namedayTable[normalizeName(userName)];
    if (userMmdd === `${pad2(month + 1)}-${pad2(day)}`) {
      list.push({ type: 'fete', label: 'Ta fête à toi 🎉', kind: `Bonus · fête de ${userName}`, contactId: null });
    }
  }

  pensees.forEach((p) => {
    if (p.date === iso) {
      const extra = p.contactId ? ` · liée à ${contactName(contacts, p.contactId)}` : '';
      list.push({ type: 'pensee', label: p.texte, kind: `Pensée · rappel ${reminderLabels[p.remind]}${extra}`, contactId: p.contactId });
    }
  });

  const hol = frenchHolidays(year)[iso];
  if (hol) list.push({ type: 'civil', label: hol, kind: 'Jour férié', contactId: null });
  const fam = familyFetes(year)[iso];
  if (fam) list.push({ type: 'civil', label: fam, kind: 'Fête calendaire', contactId: null });

  return list;
}
