import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Contact } from '../data/types';
import { Palette } from '../theme/colors';
import { resolveContactAssociationState } from '../data/contactAssociation';
import { Avatar } from './Avatar';

/**
 * CHANTIER UX — ligne compacte "contact associé", partagée par PenseeDetailScreen et le Review de
 * CaptureScreen (les deux seuls endroits qui associent un contact à UNE pensée précise — pas
 * MemorizedPenseesScreen, dont le filtre a une sémantique différente ("Tous les contacts" ≠ "aucune
 * personne", voir §9 du chantier, et un rendu déjà compact propre à ses chips de filtre existants).
 * Ne remplace JAMAIS toute la liste des contacts par des boutons — ouvre `ContactPicker` (déjà
 * partagé, voir ce fichier) uniquement sur action explicite ("Changer"/"Associer un contact").
 */
export function ContactAssociationField({
  theme,
  contacts,
  selectedContactId,
  onClear,
  onOpenPicker,
  disabled,
  suggestedContactId,
  onConfirmSuggestion,
  clearLabel = 'Aucun',
  associateLabel = 'Associer un contact',
  changeLabel = 'Changer',
  variant = 'default',
}: {
  theme: Palette;
  contacts: Contact[];
  selectedContactId: string | null;
  onClear: () => void;
  onOpenPicker: () => void;
  disabled?: boolean;
  /** Suggestion de la reconnaissance intelligente PAS ENCORE confirmée (Capture Review uniquement,
   *  `contactMatch.kind === 'fuzzy_high_confidence'` — voir contactMatching.ts, non modifié). `null`/
   *  absent ailleurs (PenseeDetailScreen n'a pas cette notion). */
  suggestedContactId?: string | null;
  onConfirmSuggestion?: (contactId: string) => void;
  clearLabel?: string;
  associateLabel?: string;
  changeLabel?: string;
  /** CHANTIER "Polish PenseeDetail — FIN manquant + présentation contact" (2026-09-20) — `'default'`
   *  (implicite, jamais passé par CaptureScreen.tsx — voir audit dédié avant cet ajout) = rendu
   *  EXACTEMENT inchangé (pastille contour accent + "Aucun"/"Changer"), utilisé par Capture Review.
   *  `'compact'` = rendu dédié à PenseeDetailScreen UNIQUEMENT (avatar/initiale + nom + coche verte,
   *  sans contour ni "Aucun" à côté d'un contact déjà sélectionné) — une variante de présentation,
   *  jamais une réécriture du composant partagé, pour ne risquer AUCUNE régression sur Capture Review
   *  (déjà validé physiquement). Seul l'état `'selected'` diffère entre les deux variantes ; les
   *  états `'orphaned'`/`'suggested'`/absence de contact restent le même rendu quel que soit `variant`
   *  (aucun besoin identifié pour ces cas dans cette passe). */
  variant?: 'default' | 'compact';
}) {
  const state = resolveContactAssociationState(contacts, selectedContactId, suggestedContactId);

  if (state.kind === 'selected') {
    if (variant === 'compact') {
      return (
        <View style={styles.compactRow}>
          <View style={styles.compactIdentity}>
            <Avatar initials={state.contact.initials} colorKey={state.contact.color} theme={theme} size={28} />
            <Text style={[styles.compactName, { color: theme.ink }]} numberOfLines={1}>
              {state.contact.prenom}
            </Text>
            {/* Vert (theme.sage) — même couleur que "Enregistrée"/validations positives ailleurs dans
                l'app (HomeScreen/CaptureScreen) — jamais l'accent violet ici : un contact sélectionné
                est une confirmation, pas une action interactive en attente. */}
            <Ionicons name="checkmark-circle" size={16} color={theme.sage} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {/* "Retirer" (jamais le mot "Aucun") — le mot "Aucun" ne doit jamais apparaître à côté
                d'un nom déjà sélectionné (consigne explicite). Même handler `onClear` qu'avant,
                aucun changement de comportement/donnée — uniquement le libellé et le style. */}
            <Pressable disabled={disabled} onPress={onClear} style={styles.actionBtn} hitSlop={8}>
              <Text style={[styles.actionText, { color: theme.inkSoft }]}>Retirer</Text>
            </Pressable>
            <Pressable disabled={disabled} onPress={onOpenPicker} style={styles.actionBtn} hitSlop={8}>
              <Text style={[styles.actionText, { color: theme.accent }]}>{changeLabel}</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.row}>
        <View style={[styles.pill, { borderColor: theme.accent, backgroundColor: theme.accentTint }]}>
          <Text style={[styles.pillText, { color: theme.accent }]} numberOfLines={1}>
            {state.contact.prenom}
          </Text>
          <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
        </View>
        <Pressable disabled={disabled} onPress={onClear} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.inkSoft }]}>{clearLabel}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={onOpenPicker} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.accent }]}>{changeLabel}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.kind === 'orphaned') {
    // §10 — contact supprimé entre-temps (référence orpheline) : jamais de crash, jamais
    // "undefined undefined", jamais de recréation automatique — juste un état visuel neutre.
    return (
      <View style={styles.row}>
        <Text style={[styles.mutedText, { color: theme.inkSoft }]}>Proche introuvable</Text>
        <Pressable disabled={disabled} onPress={onClear} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.inkSoft }]}>{clearLabel}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={onOpenPicker} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.accent }]}>{changeLabel}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.kind === 'suggested') {
    // Suggestion IA affichée directement (§3) — l'utilisateur confirme ou corrige, jamais besoin de
    // retrouver le contact dans une liste. `onConfirmSuggestion` rejoue EXACTEMENT le même chemin
    // qu'une sélection manuelle de ce contact (voir points d'usage) — aucune logique dupliquée.
    return (
      <View style={styles.row}>
        <View style={[styles.pill, { borderColor: theme.line, backgroundColor: theme.paperDim }]}>
          <Text style={[styles.pillText, { color: theme.ink }]} numberOfLines={1}>
            {state.contact.prenom}
          </Text>
        </View>
        <Pressable disabled={disabled} onPress={() => onConfirmSuggestion?.(state.contact.id)} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.accent, fontWeight: '700' }]}>Confirmer</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={onClear} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.inkSoft }]}>{clearLabel}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={onOpenPicker} style={styles.actionBtn} hitSlop={8}>
          <Text style={[styles.actionText, { color: theme.accent }]}>{changeLabel}</Text>
        </Pressable>
      </View>
    );
  }

  // §4 — aucun contact associé, aucune suggestion : jamais la liste complète par défaut.
  return (
    <View style={styles.row}>
      <Text style={[styles.mutedText, { color: theme.inkSoft }]}>{clearLabel}</Text>
      <Pressable disabled={disabled} onPress={onOpenPicker} style={styles.actionBtn} hitSlop={8}>
        <Text style={[styles.actionText, { color: theme.accent, fontWeight: '700' }]}>+ {associateLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 36 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 180 },
  pillText: { fontWeight: '700', fontSize: 13, flexShrink: 1 },
  mutedText: { fontSize: 13 },
  actionBtn: { paddingVertical: 6 },
  actionText: { fontWeight: '700', fontSize: 13 },
  // CHANTIER "Polish PenseeDetail — FIN manquant + présentation contact" (2026-09-20) — variante
  // 'compact', PenseeDetailScreen uniquement (voir prop `variant`).
  compactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  compactIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  compactName: { fontWeight: '700', fontSize: 14, flexShrink: 1 },
});
