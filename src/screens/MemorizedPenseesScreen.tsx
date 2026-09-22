import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { ContactPicker } from '../components/ContactPicker';
import { SelectionHeader } from '../components/SelectionHeader';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { buildPenseeCards, PenseeCard } from '../data/penseesView';
import { matchesSearch } from '../data/searchText';
import { RootStackParamList } from '../navigation/types';
import { PenseeRow } from './PenseesScreen';

type SortOrder = 'recent' | 'ancien';

/**
 * CHANTIER PENSÉES V3 §2/§3/§4 — bibliothèque de TOUTES les pensées sans date (l'écran Pensées
 * n'en affiche que les 3 plus récentes, voir PenseesScreen.tsx). Recherche + filtres 100% locaux
 * (aucun réseau, aucun LLM) sur les données déjà en mémoire dans le store — même principe que le
 * reste de l'app (pas de logique de pensées parallèle : `buildPenseeCards`/`PenseeRow` réutilisés
 * tels quels). `FlatList` (primitive RN native, déjà virtualisée) plutôt qu'un `.map()` — nécessaire
 * pour rester fluide avec potentiellement des centaines/milliers de pensées mémorisées, sans
 * pagination artificielle puisque toutes les données sont déjà disponibles localement.
 */
export function MemorizedPenseesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { pensees, contacts, today, deletePensee } = useStore();

  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [contactFilter, setContactFilter] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  // CHANTIER UX — ContactPicker commun (2026-09-16) : le filtre Contact n'affiche plus jamais tous
  // les contacts en chips (voir §8/§9 du chantier — "Tous les contacts" ici signifie "aucun filtre
  // actif", sémantique différente de "Aucun" sur PenseeDetailScreen, jamais confondue).
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  // CHANTIER UX §7 (2026-09-16) — même principe de sélection multiple que PenseesScreen (mutualisé
  // via SelectionHeader/PenseeRow, jamais une deuxième implémentation). La sélection ne porte que
  // sur `filtered` (ce qui est réellement affiché sur cette page à cet instant) — voir §7 du chantier.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bucket 'memo' == pensées sans aucune ancre calendrier (voir penseeAnchor, calendar.ts) —
  // exactement la même notion que la section "MÉMORISÉES" de PenseesScreen, calculée par la MÊME
  // fonction pure, jamais réimplémentée. Pas de filtre par proche ici (contrairement à
  // PenseesScreen) : cet écran montre toujours TOUTES les pensées mémorisées, filtrées ensuite via
  // le menu §4 si besoin.
  const memoCards = useMemo(() => buildPenseeCards(pensees, contacts, today).filter((c) => c.bucket === 'memo'), [pensees, contacts, today]);

  const availableContacts = useMemo(() => {
    const ids = new Set(memoCards.map((c) => c.pensee.contactId).filter((id): id is string => Boolean(id)));
    return contacts.filter((c) => ids.has(c.id));
  }, [memoCards, contacts]);

  const filtered = useMemo(() => {
    let list = memoCards;
    if (contactFilter) list = list.filter((c) => c.pensee.contactId === contactFilter);
    if (pinnedOnly) list = list.filter((c) => c.pensee.pinned);
    if (query.trim()) {
      list = list.filter((c) => {
        if (matchesSearch(c.pensee.texte, query)) return true;
        const contact = c.pensee.contactId ? contacts.find((x) => x.id === c.pensee.contactId) : null;
        return contact ? matchesSearch(`${contact.prenom} ${contact.nom}`, query) : false;
      });
    }
    // Même comparateur que groupPenseeCards (penseesView.ts) pour 'recent' — jamais une deuxième
    // logique de tri inventée ici, juste sa variante inversée pour 'ancien'.
    return [...list].sort((a, b) =>
      sortOrder === 'recent' ? b.pensee.createdAt.localeCompare(a.pensee.createdAt) : a.pensee.createdAt.localeCompare(b.pensee.createdAt),
    );
  }, [memoCards, contactFilter, pinnedOnly, query, sortOrder, contacts]);

  const hasActiveFilters = contactFilter !== null || pinnedOnly || sortOrder !== 'recent';

  function resetFilters() {
    setContactFilter(null);
    setSortOrder('recent');
    setPinnedOnly(false);
  }

  function openDetail(penseeId: string) {
    navigation.navigate('PenseeDetail', { penseeId });
  }

  // Hors mode sélection : appui long entre en mode sélection avec CETTE carte immédiatement
  // sélectionnée — même comportement que PenseesScreen (§3 du chantier précédent).
  function handleCardLongPress(penseeId: string) {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds(new Set([penseeId]));
  }

  function handleCardPress(penseeId: string) {
    if (!selectionMode) {
      openDetail(penseeId);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(penseeId)) next.delete(penseeId);
      else next.add(penseeId);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function confirmDeleteSelected() {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      count === 1 ? 'Supprimer cette pensée ?' : `Supprimer ${count} pensées ?`,
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            // `deletePensee` existant, UN appel par pensée — même chemin que PenseesScreen, jamais
            // de suppression parallèle inventée ici.
            selectedIds.forEach((id) => deletePensee(id));
            exitSelectionMode();
          },
        },
      ],
    );
  }

  const filterContactLabel = contactFilter ? contacts.find((c) => c.id === contactFilter)?.prenom ?? null : null;

  return (
    <Screen scroll={false} topInset={false}>
      {selectionMode ? (
        <View style={styles.selectionHeaderWrap}>
          <SelectionHeader
            count={selectedIds.size}
            singular="sélectionnée"
            plural="sélectionnées"
            onCancel={exitSelectionMode}
            onDelete={confirmDeleteSelected}
            theme={theme}
          />
        </View>
      ) : (
        <>
          <View style={styles.searchRow}>
            <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.card }]}>
              <Ionicons name="search" size={16} color={theme.inkSoft} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Rechercher dans mes pensées"
                placeholderTextColor={theme.inkSoft}
                style={[styles.searchInput, { color: theme.ink }]}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer la recherche">
                  <Ionicons name="close-circle" size={16} color={theme.inkSoft} />
                </Pressable>
              )}
            </View>
            {/* UN SEUL bouton filtre discret (§4) — jamais plusieurs boutons/chips permanents à côté de
                la recherche. Le point coloré signale juste "des filtres sont actifs", sans les détailler. */}
            <Pressable
              onPress={() => setFilterOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Filtrer"
              style={[styles.filterBtn, { borderColor: hasActiveFilters ? theme.accent : theme.line, backgroundColor: theme.card }]}
            >
              <Ionicons name="options-outline" size={18} color={hasActiveFilters ? theme.accent : theme.inkSoft} />
              {hasActiveFilters && <View style={[styles.filterDot, { backgroundColor: theme.accent }]} />}
            </Pressable>
          </View>

          {filterContactLabel && (
            <Text style={[styles.activeFilterHint, { color: theme.inkSoft }]}>Filtré sur {filterContactLabel}</Text>
          )}
        </>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: PenseeCard }) => (
          <PenseeRow
            card={item}
            theme={theme}
            onPress={() => handleCardPress(item.pensee.id)}
            onLongPress={() => handleCardLongPress(item.pensee.id)}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.pensee.id)}
            // CHANTIER "Pré-TestFlight Phase 4D — UI Pensées mémorisées" (2026-09-22) — bibliothèque
            // dédiée : rendu memo plus riche (avatar/prénom/date en tête, texte en contenu
            // principal) que la vue compacte de PenseesScreen. Toutes les cartes ici sont bucket
            // 'memo' (voir memoCards plus haut) — contact résolu directement à partir de contacts,
            // déjà en scope.
            contact={item.pensee.contactId ? contacts.find((c) => c.id === item.pensee.contactId) ?? null : null}
            memoVariant="rich"
          />
        )}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        // Virtualisation par défaut de FlatList — suffisante ici (données déjà en mémoire, pas de
        // pagination serveur à inventer, voir consigne du chantier) : pas de sur-optimisation au-delà
        // de ces réglages standards.
        initialNumToRender={20}
        windowSize={10}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.inkSoft }]}>
            {query.trim() || contactFilter || pinnedOnly ? 'Aucune pensée ne correspond.' : 'Aucune pensée mémorisée.'}
          </Text>
        }
      />

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFilterOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>Filtrer</Text>

            <Text style={[styles.modalSectionLabel, { color: theme.inkSoft }]}>CONTACT</Text>
            {/* CHANTIER UX — ContactPicker commun (2026-09-16) : jamais tous les contacts affichés
                directement en chips ici (voir §8 du chantier) — un seul état compact, qui ouvre le
                même ContactPicker que PenseeDetailScreen/Capture Review sur tap. */}
            {contactFilter ? (
              <Pressable
                onPress={() => setContactPickerOpen(true)}
                style={[styles.contactFilterChip, { borderColor: theme.accent, backgroundColor: theme.accentTint, marginBottom: 12 }]}
              >
                <Text style={[styles.contactFilterChipLabel, { color: theme.accent }]} numberOfLines={1}>
                  {filterContactLabel}
                </Text>
                <Pressable onPress={() => setContactFilter(null)} hitSlop={8} accessibilityLabel="Retirer le filtre proche">
                  <Ionicons name="close" size={15} color={theme.accent} />
                </Pressable>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setContactPickerOpen(true)}
                style={[styles.contactFilterRow, { borderColor: theme.line, backgroundColor: theme.paperDim, marginBottom: 12 }]}
              >
                <Text style={{ color: theme.ink, fontSize: 13 }}>Tous les contacts</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.inkSoft} />
              </Pressable>
            )}

            <Text style={[styles.modalSectionLabel, { color: theme.inkSoft }]}>TRI</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Pressable
                onPress={() => setSortOrder('recent')}
                style={[styles.chip, { borderColor: theme.line, backgroundColor: sortOrder === 'recent' ? theme.accent : theme.paperDim }]}
              >
                <Text style={{ color: sortOrder === 'recent' ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Plus récentes</Text>
              </Pressable>
              <Pressable
                onPress={() => setSortOrder('ancien')}
                style={[styles.chip, { borderColor: theme.line, backgroundColor: sortOrder === 'ancien' ? theme.accent : theme.paperDim }]}
              >
                <Text style={{ color: sortOrder === 'ancien' ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Plus anciennes</Text>
              </Pressable>
            </View>

            <Text style={[styles.modalSectionLabel, { color: theme.inkSoft }]}>ÉPINGLÉES</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <Pressable
                onPress={() => setPinnedOnly(false)}
                style={[styles.chip, { borderColor: theme.line, backgroundColor: !pinnedOnly ? theme.accent : theme.paperDim }]}
              >
                <Text style={{ color: !pinnedOnly ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Toutes</Text>
              </Pressable>
              <Pressable
                onPress={() => setPinnedOnly(true)}
                style={[styles.chip, { borderColor: theme.line, backgroundColor: pinnedOnly ? theme.accent : theme.paperDim }]}
              >
                <Text style={{ color: pinnedOnly ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Épinglées uniquement</Text>
              </Pressable>
            </View>

            {hasActiveFilters && (
              <Pressable onPress={resetFilters} style={styles.modalRow}>
                <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 13 }}>Réinitialiser les filtres</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ContactPicker
        visible={contactPickerOpen}
        contacts={availableContacts}
        theme={theme}
        title="Choisir un proche"
        onSelect={(id) => {
          setContactFilter(id);
          setContactPickerOpen(false);
        }}
        onClose={() => setContactPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  selectionHeaderWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 14, height: 44 },
  filterBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4 },
  activeFilterHint: { fontSize: 12, paddingHorizontal: 20, marginTop: 8 },
  listContent: { padding: 20, paddingBottom: 40 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  modalTitle: { fontWeight: '700', fontSize: 15, marginBottom: 16 },
  modalSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  modalRow: { paddingVertical: 13, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
  contactFilterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  contactFilterChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start', maxWidth: '100%' },
  contactFilterChipLabel: { fontWeight: '700', fontSize: 13, flexShrink: 1 },
});
