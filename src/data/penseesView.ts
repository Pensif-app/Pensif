// Regroupement/tri des pensées pour l'écran Pensées (voir PenseesScreen.tsx) — délibérément séparé
// de homeAttention.ts (une pensée sur l'Accueil et une pensée sur l'écran Pensées répondent à des
// besoins différents : fenêtre glissante de 60 jours + mélangée aux autres attentions côté Accueil,
// vs. TOUTES les pensées (passées incluses) groupées uniquement par elles-mêmes ici) — mais les
// calculs de base (pensée active aujourd'hui, pensée terminée, sous-titre) sont partagés via
// calendar.ts plutôt que recodés une 2e fois.
import { Contact, Pensee } from './types';
import { daysBetween, dIso, effectivePenseeAnchorDate, isPenseeActiveOn, isPenseeEnded, penseeAnchor, penseeSubtitle, reminderAtLabel } from './calendar';
import { nextPenseeReminderOccurrence } from './reminderRecurrence';

// 'memo' — CHANTIER PENSÉES V2 : une pensée sans aucune ancre calendrier ni rappel (voir
// penseeAnchor, calendar.ts) n'est ni "à venir" ni "passée", elle reste un élément mémorisé — elle
// ne devient JAMAIS "passée" simplement parce qu'elle vieillit.
export type PenseeBucket = 'today' | 'upcoming' | 'past' | 'memo';

export type PenseeCard = {
  id: string;
  pensee: Pensee;
  subtitle: string;
  /** null si la pensée n'a aucun rappel programmé (entièrement facultatif désormais). */
  reminderLabel: string | null;
  bucket: PenseeBucket;
  /** Sert uniquement au tri : 0 = active aujourd'hui, positif = jours avant, négatif = jours après
   *  (pensée passée), 0 par convention pour une pensée "memo" (non utilisé pour son tri, voir
   *  groupPenseeCards). Jamais affiché tel quel, jamais utilisé comme priorité/score. */
  daysFromToday: number;
};

/** Construit une carte par pensée, sans filtrer ni trier — voir groupPenseeCards pour la répartition
 *  en groupes attendue par l'écran. */
export function buildPenseeCards(pensees: Pensee[], contacts: Contact[], today: Date): PenseeCard[] {
  const todayIso = dIso(today);
  return pensees.map((p) => {
    const anchor = penseeAnchor(p);
    // CHANTIER "P0 Récurrence Phase 1" (2026-09-21) — BUG D corrigé : pour une pensée récurrente,
    // le badge affichait toujours l'heure/jour de la toute PREMIÈRE occurrence (`p.reminderAt` brut),
    // même une fois celle-ci révolue. Utilise désormais la PROCHAINE occurrence réelle
    // (nextPenseeReminderOccurrence, reminderRecurrence.ts) quand une récurrence est active et
    // encore valide ; retombe sur `p.reminderAt` brut si la récurrence est épuisée (comportement
    // conservateur, ne masque pas l'information) ou si la pensée n'a pas de récurrence (ponctuelle —
    // comportement STRICTEMENT inchangé, voir consigne §5). Référence désormais le jour EFFECTIF
    // (effectivePenseeAnchorDate) plutôt que l'ancre brute, pour qu'un rappel quotidien continue de
    // n'afficher que l'heure ("Rappel 21h40", jamais "21 sept. à 21h40") même quand sa 1ère
    // occurrence historique est passée.
    const nextOccurrence = nextPenseeReminderOccurrence(p, today);
    const effectiveReminderAt = p.reminderRecurrence ? (nextOccurrence ? nextOccurrence.toISOString() : p.reminderAt) : p.reminderAt;
    const effectiveAnchorDay = effectivePenseeAnchorDate(p, today);
    const reminderLabel = effectiveReminderAt ? `Rappel ${reminderAtLabel(effectiveReminderAt, effectiveAnchorDay ?? undefined)}` : null;
    if (!anchor) {
      // Purement mémorisée : jamais "passée", triée par date de création (voir groupPenseeCards).
      return { id: p.id, pensee: p, subtitle: penseeSubtitle(p, contacts), reminderLabel, bucket: 'memo' as const, daysFromToday: 0 };
    }
    const activeToday = isPenseeActiveOn(p, todayIso);
    // BUG A corrigé : isPenseeEnded (calendar.ts) est désormais récurrence-aware — une pensée dont
    // l'ancre brute est révolue mais dont le rappel récurrent a encore une occurrence future n'est
    // plus jamais classée "passée". penseeAnchor lui-même reste INCHANGÉ (consigne §1).
    const ended = isPenseeEnded(p, today);
    const daysFromToday = activeToday ? 0 : daysBetween(effectiveAnchorDay ?? anchor.date, today);
    const bucket: PenseeBucket = activeToday ? 'today' : ended ? 'past' : 'upcoming';
    return {
      id: p.id,
      pensee: p,
      subtitle: penseeSubtitle(p, contacts),
      reminderLabel,
      bucket,
      daysFromToday,
    };
  });
}

/**
 * Répartit les cartes déjà construites en groupes, chacun trié comme demandé (§6 du chantier) :
 * "à venir" du plus proche au plus lointain, "passées" de la plus récente à la plus ancienne,
 * "mémorisées" (sans ancre) de la plus récemment créée à la plus ancienne. Aucun scoring — un tri
 * chronologique simple dans chaque groupe, rien d'autre.
 */
export function groupPenseeCards(
  cards: PenseeCard[],
): { today: PenseeCard[]; upcoming: PenseeCard[]; past: PenseeCard[]; memo: PenseeCard[] } {
  const today = cards.filter((c) => c.bucket === 'today');
  const upcoming = cards.filter((c) => c.bucket === 'upcoming').sort((a, b) => a.daysFromToday - b.daysFromToday);
  // daysFromToday est négatif pour une pensée passée (ex. -1 = hier, -30 = il y a un mois) — trier
  // en DÉCROISSANT ramène donc la plus récente (la moins négative) en premier.
  const past = cards.filter((c) => c.bucket === 'past').sort((a, b) => b.daysFromToday - a.daysFromToday);
  const memo = cards.filter((c) => c.bucket === 'memo').sort((a, b) => b.pensee.createdAt.localeCompare(a.pensee.createdAt));
  return { today, upcoming, past, memo };
}
