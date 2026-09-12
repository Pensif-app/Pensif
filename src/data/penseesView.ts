// Regroupement/tri des pensées pour l'écran Pensées (voir PenseesScreen.tsx) — délibérément séparé
// de homeAttention.ts (une pensée sur l'Accueil et une pensée sur l'écran Pensées répondent à des
// besoins différents : fenêtre glissante de 60 jours + mélangée aux autres attentions côté Accueil,
// vs. TOUTES les pensées (passées incluses) groupées uniquement par elles-mêmes ici) — mais les
// calculs de base (pensée active aujourd'hui, pensée terminée, sous-titre) sont partagés via
// calendar.ts plutôt que recodés une 2e fois.
import { Contact, Pensee } from './types';
import { daysBetween, dIso, formatCustomOffset, isPenseeActiveOn, isPenseeEnded, penseeSubtitle, reminderLabels } from './calendar';

export type PenseeBucket = 'today' | 'upcoming' | 'past';

export type PenseeCard = {
  id: string;
  pensee: Pensee;
  subtitle: string;
  /** null si aucun rappel exploitable (ex. rappel custom sans customOffsetMinutes renseigné). */
  reminderLabel: string | null;
  bucket: PenseeBucket;
  /** Sert uniquement au tri : 0 = active aujourd'hui, positif = jours avant, négatif = jours après
   *  (pensée passée). Jamais affiché tel quel, jamais utilisé comme priorité/score. */
  daysFromToday: number;
};

function reminderLabelFor(p: Pensee): string | null {
  if (p.remind === 'custom') {
    return p.customOffsetMinutes != null ? `Rappel ${formatCustomOffset(p.customOffsetMinutes)}` : null;
  }
  return `Rappel ${reminderLabels[p.remind]}`;
}

/** Construit une carte par pensée, sans filtrer ni trier — voir groupPenseeCards pour la répartition
 *  en 3 sections attendue par l'écran. */
export function buildPenseeCards(pensees: Pensee[], contacts: Contact[], today: Date): PenseeCard[] {
  const todayIso = dIso(today);
  return pensees.map((p) => {
    const activeToday = isPenseeActiveOn(p, todayIso);
    const ended = isPenseeEnded(p, todayIso);
    const daysFromToday = activeToday ? 0 : daysBetween(p.date, today);
    const bucket: PenseeBucket = activeToday ? 'today' : ended ? 'past' : 'upcoming';
    return {
      id: p.id,
      pensee: p,
      subtitle: penseeSubtitle(p, contacts),
      reminderLabel: reminderLabelFor(p),
      bucket,
      daysFromToday,
    };
  });
}

/**
 * Répartit les cartes déjà construites en 3 groupes, chacun trié comme demandé (§6 du chantier) :
 * "à venir" du plus proche au plus lointain, "passées" de la plus récente à la plus ancienne.
 * Aucun scoring — un tri chronologique simple dans chaque groupe, rien d'autre.
 */
export function groupPenseeCards(cards: PenseeCard[]): { today: PenseeCard[]; upcoming: PenseeCard[]; past: PenseeCard[] } {
  const today = cards.filter((c) => c.bucket === 'today');
  const upcoming = cards.filter((c) => c.bucket === 'upcoming').sort((a, b) => a.daysFromToday - b.daysFromToday);
  // daysFromToday est négatif pour une pensée passée (ex. -1 = hier, -30 = il y a un mois) — trier
  // en DÉCROISSANT ramène donc la plus récente (la moins négative) en premier.
  const past = cards.filter((c) => c.bucket === 'past').sort((a, b) => b.daysFromToday - a.daysFromToday);
  return { today, upcoming, past };
}
