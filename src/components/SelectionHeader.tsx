import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette } from '../theme/colors';

/**
 * CHANTIER UX — header du mode sélection (2026-09-16), mutualisé entre PenseesScreen,
 * MemorizedPenseesScreen et ContactsScreen (voir §5/§6/§7 du chantier — même langage visuel partout,
 * jamais une deuxième implémentation divergente).
 *
 * Correctif : l'ancien header (PenseesScreen) mettait le compteur et les deux boutons sur UNE seule
 * rangée avec `justifyContent:'space-between'` sans aucune contrainte de largeur — un texte un peu
 * long ("10 pensées sélectionnées") pouvait dépasser et pousser "Supprimer" hors de l'écran. Ici : le
 * compteur est `flexShrink:1` + `numberOfLines={1}` (il s'ellipse plutôt que de pousser les boutons),
 * les actions sont `flexShrink:0` (jamais compressées) et le texte reste volontairement court
 * ("X sélectionnée(s)", sans répéter le nom de l'entité) — toujours tenir même à 3 chiffres.
 */
export function SelectionHeader({
  count,
  singular,
  plural,
  onCancel,
  onDelete,
  theme,
}: {
  count: number;
  /** Accord au singulier, ex. "sélectionnée" (pensée) ou "sélectionné" (proche). */
  singular: string;
  /** Accord au pluriel, ex. "sélectionnées" ou "sélectionnés". */
  plural: string;
  onCancel: () => void;
  onDelete: () => void;
  theme: Palette;
}) {
  const countLabel = count === 0 ? 'Sélection' : `${count} ${count > 1 ? plural : singular}`;
  return (
    <View style={styles.row}>
      <Text style={[styles.count, { color: theme.ink }]} numberOfLines={1}>
        {countLabel}
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={onCancel} style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 13 }}>Annuler</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          disabled={count === 0}
          style={[styles.btn, { backgroundColor: theme.danger, borderColor: theme.danger, opacity: count === 0 ? 0.4 : 1 }]}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Supprimer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  count: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  btn: { paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
