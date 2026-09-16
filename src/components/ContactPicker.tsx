import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { Contact } from '../data/types';
import { Palette } from '../theme/colors';
import { matchesSearch } from '../data/searchText';

/**
 * CHANTIER UX — ContactPicker commun (2026-09-16) : UN SEUL composant de sélection de contact,
 * réutilisé par PenseeDetailScreen, CaptureScreen (Review) et MemorizedPenseesScreen (filtre
 * Contact) — voir audit du chantier, aucune deuxième implémentation. Recherche 100% locale
 * (`normalizeSearchText`/`matchesSearch`, déjà utilisés par MemorizedPenseesScreen — CHANTIER
 * PENSÉES V3), aucun appel réseau/LLM. `FlatList` (déjà utilisé pour la même raison sur
 * MemorizedPenseesScreen) : reste fluide avec des centaines de contacts, jamais un `.map()` de
 * boutons rendu d'un coup.
 *
 * Volontairement SIMPLE (voir consigne "pas d'architecture abstraite disproportionnée") :
 * `onSelect` ne reçoit toujours qu'un id de contact réel, jamais `null` — "Aucun"/"Tous les
 * contacts" (leur signification diffère selon l'appelant, voir §9 du chantier) restent des actions
 * PROPRES à chaque écran consommateur, hors de ce composant.
 */
export function ContactPicker({
  visible,
  contacts,
  onSelect,
  onClose,
  theme,
  title = 'Choisir un proche',
}: {
  visible: boolean;
  contacts: Contact[];
  onSelect: (contactId: string) => void;
  onClose: () => void;
  theme: Palette;
  title?: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return contacts;
    // Prénom, nom, ET prénom+nom combinés (ex. "Yohan Martin") — voir §5 du chantier.
    return contacts.filter((c) => matchesSearch(c.prenom, query) || matchesSearch(c.nom, query) || matchesSearch(`${c.prenom} ${c.nom}`, query));
  }, [contacts, query]);

  function handleSelect(contactId: string) {
    setQuery('');
    onSelect(contactId);
  }

  function handleClose() {
    setQuery('');
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.card }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>

          <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.paperDim }]}>
            <Ionicons name="search" size={16} color={theme.inkSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un contact"
              placeholderTextColor={theme.inkSoft}
              style={[styles.searchInput, { color: theme.ink }]}
              // CORRECTIF UX (2026-09-16) — PAS de focus automatique à l'ouverture : sur iPhone, le
              // clavier apparaissait immédiatement et masquait une grande partie de la liste. La
              // liste doit être immédiatement visible/scrollable ; le clavier n'apparaît que si
              // l'utilisateur touche explicitement ce champ.
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={16} color={theme.inkSoft} />
              </Pressable>
            )}
          </View>

          {contacts.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.inkSoft }]}>Aucun proche pour l’instant.</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              // Réglages de virtualisation standards (mêmes valeurs que MemorizedPenseesScreen) —
              // suffisants pour des centaines de contacts, pas de sur-optimisation au-delà.
              initialNumToRender={20}
              windowSize={10}
              removeClippedSubviews
              renderItem={({ item }) => (
                <Pressable onPress={() => handleSelect(item.id)} style={[styles.row, { borderColor: theme.line }]}>
                  <Avatar initials={item.initials} colorKey={item.color} theme={theme} size={36} />
                  <Text style={[styles.rowLabel, { color: theme.ink }]} numberOfLines={1}>
                    {`${item.prenom} ${item.nom}`.trim()}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.inkSoft }]}>Aucun résultat.</Text>}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, maxHeight: '75%' },
  title: { fontWeight: '700', fontSize: 15, marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, height: 44 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1 },
  rowLabel: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 20 },
});
