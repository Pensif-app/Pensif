// CHANTIER "Notifications récurrentes — correctif OFF→ON" (2026-09-19), étendu par le CHANTIER
// "Édition complète des récurrences dans Modifier la pensée" (2026-09-20). Pur, AUCUNE dépendance
// react-native/expo NI Capture (captureReview.ts/CaptureScreen.tsx, tous deux FROZEN) — testable sous
// ts-node. Réutilise SANS DUPLIQUER l'algorithme de `reminderRecurrence.ts` (normalizeReminderRecurrence/
// reminderRecurrenceMatchesDate/computeNextReminderOccurrences), lui-même FROZEN et non modifié ici.
//
// BUG CORRIGÉ (audit dédié, 2026-09-19) : PenseeDetailScreen.tsx n'avait AUCUNE UI pour afficher/
// modifier `reminderRecurrence`. Sans règle explicite, `save()` reconduisait cette valeur à
// l'identique à CHAQUE sauvegarde — y compris juste après avoir désactivé le rappel (`reminderAt=
// null`) : réactiver ensuite le rappel avec une nouvelle date ressuscitait alors silencieusement
// l'ANCIENNE récurrence, invisible et non voulue.
import { Pensee, ReminderRecurrence } from './types';
import { LocalDateParts, computeNextReminderOccurrences, nextPenseeReminderOccurrence, normalizeReminderRecurrence, reminderRecurrenceMatchesDate } from './reminderRecurrence';
import { isoOf } from './dateLocal';

/**
 * Déterminait la valeur de `reminderRecurrence` à écrire quand cet écran n'avait encore AUCUNE UI
 * d'édition de récurrence (rappel désactivé → récurrence explicitement effacée ; rappel actif →
 * récurrence existante préservée telle quelle). CONSERVÉE TELLE QUELLE (comportement et tests
 * inchangés, voir scripts/test-regression-pensee-detail-recurrence.ts, commit 2aabf22) mais N'EST
 * PLUS APPELÉE par `PenseeDetailScreen.save()` depuis l'ajout de l'édition complète — remplacée par
 * `toPenseeReminderRecurrence(recurrenceDraft)`, qui produit exactement la même valeur tant que
 * l'utilisateur ne touche pas la nouvelle UI (voir `buildPenseeRecurrenceDraft`, round-trip identité).
 */
export function resolveReminderRecurrenceForSave(
  existing: Pensee | undefined,
  reminderEnabled: boolean,
): ReminderRecurrence | null {
  if (!reminderEnabled) return null;
  return existing?.reminderRecurrence ?? null;
}

// ---------------------------------------------------------------------------------------------
// CHANTIER "Édition complète des récurrences dans Modifier la pensée" (2026-09-20)
// ---------------------------------------------------------------------------------------------

export type PenseeRecurrenceDraftFrequency = 'daily' | 'weekly';

/** Brouillon d'édition LOCAL à PenseeDetailScreen — forme volontairement INDÉPENDANTE de
 *  `RecurrenceDraft` (captureReview.ts, FROZEN) : `untilDate` est ici une chaîne 'YYYY-MM-DD' (pas
 *  un `LocalDate` objet), et il n'y a pas de champ `heardExpression` (concept propre à l'extraction
 *  Capture, sans équivalent ici). Aucune dépendance runtime à Capture. */
export type PenseeRecurrenceDraft = {
  enabled: boolean;
  /** `null` uniquement quand `enabled=false` — ce module ne produit jamais `enabled:true` avec
   *  `frequency:null` (voir `setPenseeRecurrenceFrequency`, qui fixe toujours les deux ensemble) :
   *  aucun équivalent ici du "unclear non résolu" de Capture, qui n'existe pas dans ce flux. */
  frequency: PenseeRecurrenceDraftFrequency | null;
  /** Pertinent uniquement si `frequency === 'weekly'` — toujours `[]` pour 'daily' ou `null`
   *  frequency (voir `setPenseeRecurrenceFrequency`, qui vide ce tableau à chaque changement). */
  daysOfWeek: number[];
  occurrenceCount: number | null;
  /** 'YYYY-MM-DD', ou `null`. */
  untilDate: string | null;
};

/** Représentation canonique "Répétition = Jamais" — jamais un objet partiellement rempli qui
 *  laisserait un résidu de règle (même exigence "sans résidu" que `DEFAULT_RECURRENCE_DRAFT`,
 *  captureReview.ts, non réutilisée ici pour rester indépendante de Capture). */
export const NEVER_PENSEE_RECURRENCE_DRAFT: PenseeRecurrenceDraft = {
  enabled: false,
  frequency: null,
  daysOfWeek: [],
  occurrenceCount: null,
  untilDate: null,
};

/** Construit le brouillon initial depuis la règle persistée d'une pensée (ou son absence) — une
 *  pensée récurrente existante doit afficher fidèlement sa vraie règle dès l'ouverture de l'écran. */
export function buildPenseeRecurrenceDraft(existingRule: ReminderRecurrence | null | undefined): PenseeRecurrenceDraft {
  if (!existingRule) return NEVER_PENSEE_RECURRENCE_DRAFT;
  return {
    enabled: true,
    frequency: existingRule.frequency,
    daysOfWeek: existingRule.frequency === 'weekly' ? existingRule.daysOfWeek : [],
    occurrenceCount: existingRule.occurrenceCount,
    untilDate: existingRule.untilDate,
  };
}

/** Choisit 'daily'/'weekly' — active TOUJOURS la récurrence en même temps (`enabled:true`), et vide
 *  TOUJOURS `daysOfWeek` (un jour choisi pour 'weekly' n'a aucun sens pour 'daily', et repartir de
 *  zéro évite qu'un ancien choix ne resurgisse après un aller-retour entre les deux fréquences —
 *  même règle que `setRecurrenceFrequency`, captureReview.ts, non dupliquée ici). */
export function setPenseeRecurrenceFrequency(
  draft: PenseeRecurrenceDraft,
  frequency: PenseeRecurrenceDraftFrequency,
): PenseeRecurrenceDraft {
  return { ...draft, enabled: true, frequency, daysOfWeek: [] };
}

/** Coche/décoche un jour pour une récurrence 'weekly' — sans effet si la fréquence actuelle n'est
 *  pas 'weekly', pour ne jamais construire un état incohérent. `daysOfWeek=[]` après ce toggle est un
 *  état UI INCOMPLET valide temporairement (l'utilisateur coche encore) — voir
 *  `validatePenseeRecurrenceEdit`, qui bloque la SAUVEGARDE dans ce cas, jamais cette fonction elle-
 *  même (elle ne fait que refléter l'état actuel des cases cochées). */
export function togglePenseeRecurrenceDay(draft: PenseeRecurrenceDraft, day: number): PenseeRecurrenceDraft {
  if (draft.frequency !== 'weekly') return draft;
  const has = draft.daysOfWeek.includes(day);
  const daysOfWeek = has ? draft.daysOfWeek.filter((d) => d !== day) : [...draft.daysOfWeek, day];
  return { ...draft, daysOfWeek };
}

/** "Fin = Jamais" — efface les DEUX bornes (occurrenceCount/untilDate), sans toucher à
 *  enabled/frequency/daysOfWeek (la récurrence elle-même reste active, seule sa fin change). Pour
 *  désactiver la récurrence ENTIÈRE ("Répétition = Jamais"), utiliser `NEVER_PENSEE_RECURRENCE_DRAFT`
 *  directement (reset complet, jamais partiel — même exigence que `toggleRecurrence(false)`,
 *  captureReview.ts). */
export function setPenseeRecurrenceNever(draft: PenseeRecurrenceDraft): PenseeRecurrenceDraft {
  return { ...draft, occurrenceCount: null, untilDate: null };
}

/** "Après X fois" — fixe `occurrenceCount` et efface `untilDate` DANS LE MÊME APPEL (bornes
 *  mutuellement exclusives, jamais les deux définies simultanément — contrairement à
 *  `setRecurrenceOccurrenceCount`/captureReview.ts, qui délègue cet appariement à l'appelant, cette
 *  version auto-exclusive rend l'exclusivité impossible à oublier au point d'appel). */
export function setPenseeRecurrenceOccurrenceCount(draft: PenseeRecurrenceDraft, occurrenceCount: number): PenseeRecurrenceDraft {
  return { ...draft, occurrenceCount, untilDate: null };
}

/** "Jusqu'au [date]" — symétrique de `setPenseeRecurrenceOccurrenceCount` : fixe `untilDate`, efface
 *  `occurrenceCount` dans le même appel. */
export function setPenseeRecurrenceUntilDate(draft: PenseeRecurrenceDraft, untilDate: string): PenseeRecurrenceDraft {
  return { ...draft, untilDate, occurrenceCount: null };
}

/** Construit la règle NORMALISÉE (voir `normalizeReminderRecurrence`, reminderRecurrence.ts —
 *  algorithme réutilisé, jamais dupliqué) à partir d'un brouillon. `null` si la récurrence est
 *  désactivée, si `frequency` n'est pas encore choisie (structurellement impossible à produire via
 *  les helpers ci-dessus, mais jamais supposé), OU si la structure est incohérente (ex. 'weekly' sans
 *  aucun jour) — jamais une règle partiellement reconstruite. */
export function toPenseeReminderRecurrence(draft: PenseeRecurrenceDraft): ReminderRecurrence | null {
  if (!draft.enabled || draft.frequency === null) return null;
  return normalizeReminderRecurrence({
    frequency: draft.frequency,
    daysOfWeek: draft.daysOfWeek,
    occurrenceCount: draft.occurrenceCount,
    untilDate: draft.untilDate,
  });
}

export type PenseeRecurrenceValidationReason =
  | 'weekly_without_days'
  | 'anchor_not_matching_weekly'
  | 'until_before_anchor'
  | 'until_in_past'
  | 'finite_series_exhausted';

export type PenseeRecurrenceValidationResult = { ok: true } | { ok: false; reason: PenseeRecurrenceValidationReason };

/**
 * Validation AVANT sauvegarde — n'écrit jamais rien, ne déplace JAMAIS `reminderAt` silencieusement
 * (invariant produit : `reminderAt` reste sémantiquement la première occurrence). Appelée uniquement
 * quand `draft.enabled` est vrai (une récurrence désactivée n'a rien à valider ici — le garde "rappel
 * dans le passé" existant de `save()`, PenseeDetailScreen.tsx, couvre déjà le cas ponctuel).
 *
 * `reminderAt` : date/heure CONFIRMÉE du rappel (jamais `null` à cet appel — `save()` bloque déjà
 * `reminderEnabled && !reminderDate` avant d'atteindre cette validation). `now` : toujours fourni par
 * l'appelant (jamais `new Date()` interne), pour rester testable avec un instant injecté/fixe.
 */
export function validatePenseeRecurrenceEdit(
  draft: PenseeRecurrenceDraft,
  reminderAt: Date,
  now: Date,
): PenseeRecurrenceValidationResult {
  if (!draft.enabled) return { ok: true };

  const rule = toPenseeReminderRecurrence(draft);
  if (!rule) {
    // Cas réel unique atteignable via l'UI actuelle : 'weekly' avec `daysOfWeek=[]` (état "encore en
    // train de cocher", voir togglePenseeRecurrenceDay). `frequency===null` avec `enabled:true` n'est
    // structurellement jamais produit par les helpers de ce module (défensif seulement).
    return { ok: false, reason: 'weekly_without_days' };
  }

  const anchor: LocalDateParts = { year: reminderAt.getFullYear(), month: reminderAt.getMonth(), day: reminderAt.getDate() };

  // Invariant produit (reminderAt = première occurrence) — appliqué IDENTIQUEMENT pour finite ET
  // infinite (voir audit dédié) : le scheduler natif tolère un `reminderAt` incohérent pour une série
  // infinie (seule son HEURE est utilisée, voir buildPenseeReminderCandidates, notificationPlanning.ts,
  // FROZEN, non modifié), mais `reminderAt` reste utilisé ailleurs dans l'app (ancre Calendrier,
  // affichage) — jamais de dérive silencieuse entre la date affichée et le motif choisi.
  if (rule.frequency === 'weekly' && !reminderRecurrenceMatchesDate(rule, anchor)) {
    return { ok: false, reason: 'anchor_not_matching_weekly' };
  }

  if (rule.untilDate) {
    const anchorIso = isoOf(anchor.year, anchor.month, anchor.day);
    if (rule.untilDate < anchorIso) return { ok: false, reason: 'until_before_anchor' };
    const nowIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
    if (rule.untilDate < nowIso) return { ok: false, reason: 'until_in_past' };
  }

  // occurrenceCount reste ancré sur la VRAIE première occurrence (`reminderAt`), jamais réinterprété
  // comme "X nouvelles occurrences à partir de maintenant" (voir audit dédié, computeNextReminderOccurrences
  // — algorithme réutilisé tel quel, `from:now` ne fait que FILTRER le résultat déjà calculé depuis
  // `reminderAt`, jamais recalculer le compte depuis `now`). Un `untilDate` déjà écarté ci-dessus
  // (until_before_anchor/until_in_past) ne peut de toute façon plus produire d'occurrence future — ce
  // contrôle couvre en pratique surtout `occurrenceCount`, mais reste appliqué de façon générique à
  // toute règle finie pour ne jamais laisser passer un cas limite non anticipé.
  const isFinite = rule.occurrenceCount !== null || rule.untilDate !== null;
  if (isFinite) {
    const occurrences = computeNextReminderOccurrences(rule, reminderAt, { from: now, limit: Number.MAX_SAFE_INTEGER });
    if (occurrences.length === 0) return { ok: false, reason: 'finite_series_exhausted' };
  }

  return { ok: true };
}

/** Message utilisateur — UNIQUEMENT pour affichage (`Alert`, PenseeDetailScreen.tsx), jamais une
 *  décision métier (la validation elle-même reste `validatePenseeRecurrenceEdit`). */
export function describePenseeRecurrenceValidationError(reason: PenseeRecurrenceValidationReason): string {
  switch (reason) {
    case 'weekly_without_days':
      return 'Choisis au moins un jour pour cette répétition.';
    case 'anchor_not_matching_weekly':
      return 'Le jour du rappel ne correspond pas aux jours sélectionnés.\nModifie la date du rappel ou les jours de répétition.';
    case 'until_before_anchor':
      return "La date de fin ne peut pas être avant la date du rappel.";
    case 'until_in_past':
      return 'La date de fin est déjà passée.';
    case 'finite_series_exhausted':
      return 'Cette répétition ne produirait plus aucun rappel — choisis une nouvelle date de départ ou modifie la fin.';
  }
}

const PENSEE_WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const PENSEE_WEEKDAY_SHORT_FR: Record<number, string> = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };

/** Libellé de la ligne "RÉPÉTITION" — "Aucune" si désactivée (CHANTIER "Phase 6 Addendum — Correctif
 *  rappel ponctuel + clavier", 2026-09-23 : "Aucune répétition", à ne jamais confondre avec "aucun
 *  rappel" — le rappel ponctuel reste défini uniquement par `reminderAt`, jamais par cette ligne),
 *  "À préciser" pour un 'weekly' sans aucun jour encore coché (état transitoire UNIQUEMENT visible
 *  pendant que la feuille RÉPÉTITION est ouverte — voir PenseeDetailScreen.tsx `closeRecurrenceEditor`,
 *  qui empêche désormais cet état de survivre à la fermeture de la feuille, jamais un motif deviné à
 *  la place de l'utilisateur). */
export function penseeRecurrenceFrequencyLabel(draft: PenseeRecurrenceDraft): string {
  if (!draft.enabled || draft.frequency === null) return 'Aucune';
  if (draft.frequency === 'daily') return 'Tous les jours';
  if (draft.daysOfWeek.length === 0) return 'À préciser';
  return PENSEE_WEEK_DISPLAY_ORDER.filter((d) => draft.daysOfWeek.includes(d))
    .map((d) => PENSEE_WEEKDAY_SHORT_FR[d])
    .join(', ');
}

/**
 * CHANTIER "Polish PenseeDetail — FIN manquant + présentation contact" (2026-09-20) — BUG CORRIGÉ :
 * `null` signifiait auparavant "récurrence désactivée OU aucune borne (Jamais)", masquant la ligne
 * "FIN" tout entière dès qu'une récurrence active n'avait pas encore de fin choisie — même règle que
 * `recurrenceEndLabel`/captureReview.ts à l'époque, mais jamais adaptée au besoin RÉEL de cet écran
 * (contrairement à Capture Review, `PenseeDetailScreen` veut TOUJOURS afficher "FIN" dès qu'une
 * récurrence est active, "Jamais" étant une valeur explicite parmi d'autres — voir consigne dédiée).
 * `penseeRecurrenceEndLabel` n'est utilisée QUE par cet écran (jamais partagée avec Capture Review,
 * voir grep dédié avant modification) — ce changement de comportement est donc sans risque de
 * régression ailleurs. `null` désormais UNIQUEMENT quand la récurrence est désactivée (pas de ligne
 * "FIN" du tout dans ce cas, inchangé). */
export function penseeRecurrenceEndLabel(draft: PenseeRecurrenceDraft): string | null {
  if (!draft.enabled) return null;
  if (draft.occurrenceCount !== null) {
    return draft.occurrenceCount === 1 ? 'Après 1 rappel' : `Après ${draft.occurrenceCount} rappels`;
  }
  if (draft.untilDate) {
    const [y, m, d] = draft.untilDate.split('-');
    return `Jusqu'au ${d}/${m}/${y}`;
  }
  return 'Jamais';
}

/**
 * CHANTIER "Réglages V1" (2026-09-24) — "Rappels programmés" (SettingsScreen) : nombre de pensées
 * dont le rappel a encore au moins une occurrence future. Une récurrence compte 1, quel que soit le
 * nombre d'occurrences restantes. Réutilise `nextPenseeReminderOccurrence` (primitive canonique,
 * aucune logique de récurrence dupliquée) ; `now` est toujours `store.today`.
 */
export function countScheduledReminders(pensees: Pensee[], now: Date): number {
  return pensees.filter((p) => Boolean(p.reminderAt) && nextPenseeReminderOccurrence(p, now) !== null).length;
}
