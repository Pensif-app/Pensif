import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { buildPenseeCards, groupPenseeCards, PenseeCard } from '../data/penseesView';
import { RootStackParamList, TabParamList } from '../navigation/types';

/**
 * Onglet "Pensées" — ce que l'utilisateur a confié à Pensif (texte, éventuellement un jour/une
 * période, un proche lié, un rappel), pas une todo-list : aucune action "à faire" n'apparaît ici,
 * seulement ce qui a été noté. Depuis CHANTIER PENSÉES V2, une pensée n'a plus besoin d'aucune date
 * ni d'aucun rappel — création/édition/suppression se font désormais directement depuis cet écran
 * (PenseeDetailScreen, ouvert par le "+" ou par un tap sur une carte), en plus du Calendrier qui
 * reste un point d'entrée valide pour une pensée liée à un jour précis (surlignage de période
 * compris).
 *
 * `contactId` (route param optionnel) filtre sur un seul proche — contexte de navigation ponctuel
 * (ex. Fiche → "Voir les pensées"), JAMAIS un état persistant : un tap direct sur l'onglet Pensées
 * le réinitialise toujours (voir tabNavigationHelpers.ts). Sans paramètre, comportement inchangé.
 */
export function PenseesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Pensées'>>();
  const { pensees, contacts, today, deletePensee } = useStore();
  const [showPast, setShowPast] = useState(false);
  // CHANTIER UX §3 (2026-09-15) — sélection multiple déclenchée par appui long. `selectedIds` n'a
  // de sens QUE pendant `selectionMode` (voir exitSelectionMode, toujours appelé ensemble) — pas de
  // Set qui survivrait silencieusement à une sortie de mode.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filterContactId = route.params?.contactId;
  const filterContact = filterContactId ? contacts.find((c) => c.id === filterContactId) : undefined;
  const isFiltered = Boolean(filterContactId);

  const visiblePensees = useMemo(
    () => (filterContactId ? pensees.filter((p) => p.contactId === filterContactId) : pensees),
    [pensees, filterContactId],
  );

  const groups = useMemo(() => groupPenseeCards(buildPenseeCards(visiblePensees, contacts, today)), [visiblePensees, contacts, today]);

  function openDetail(penseeId: string) {
    navigation.navigate('PenseeDetail', { penseeId });
  }

  function openCreate() {
    navigation.navigate('PenseeDetail', { contactId: filterContactId });
  }

  // Hors mode sélection : appui long entre en mode sélection avec CETTE carte immédiatement
  // sélectionnée. Déjà en mode sélection : un appui long ne fait rien de spécial (le tap normal sur
  // la même carte, voir handleCardPress, fait déjà sélectionner/désélectionner).
  function handleCardLongPress(penseeId: string) {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds(new Set([penseeId]));
  }

  // Hors mode sélection : tap normal → ouvre PenseeDetail, comportement inchangé. En mode
  // sélection : tap → bascule la sélection de cette carte, jamais de navigation.
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
            // `deletePensee` existant, UN appel par pensée — même chemin optimiste local + outbox
            // que la suppression individuelle (CalendarScreen/PenseeDetailScreen) : jamais contourné,
            // fonctionne offline à l'identique (chaque suppression s'enqueue indépendamment).
            selectedIds.forEach((id) => deletePensee(id));
            exitSelectionMode();
          },
        },
      ],
    );
  }

  function clearFilter() {
    // setParams (pas navigate) : reste sur cet écran, retire juste le contexte de filtrage — voir
    // §9 du chantier, le filtre ne doit jamais devenir un état global.
    (navigation as any).setParams({ contactId: undefined });
  }

  const isEmpty = visiblePensees.length === 0;

  return (
    <Screen>
      {selectionMode ? (
        // Remplace ENTIÈREMENT le header normal pendant la sélection — pas de bouton Capture/Ajouter
        // accessible dans cet état, uniquement Annuler/Supprimer (voir §3 du chantier).
        <View style={styles.headerRow}>
          <Text style={[styles.h1, { color: theme.ink }]}>
            {selectedIds.size === 0 ? 'Sélectionner des pensées' : `${selectedIds.size} pensée${selectedIds.size > 1 ? 's' : ''} sélectionnée${selectedIds.size > 1 ? 's' : ''}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={exitSelectionMode} style={[styles.iconBtn, { width: 'auto', paddingHorizontal: 12, backgroundColor: theme.card, borderColor: theme.line }]}>
              <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 13 }}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={confirmDeleteSelected}
              disabled={selectedIds.size === 0}
              style={[
                styles.iconBtn,
                { width: 'auto', paddingHorizontal: 12, backgroundColor: theme.danger, borderColor: theme.danger, opacity: selectedIds.size === 0 ? 0.4 : 1 },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Supprimer</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: theme.ink }]}>{isFiltered ? `Pensées de ${filterContact?.prenom ?? 'ce proche'}` : 'Pensées'}</Text>
            {isFiltered ? (
              <Pressable onPress={clearFilter} style={styles.clearFilterBtn}>
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Toutes les pensées</Text>
              </Pressable>
            ) : (
              <Text style={[styles.sub, { color: theme.inkSoft }]}>Ce que tu as confié à Pensif.</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Point d'entrée secondaire de la capture intelligente — plus discret que sur Accueil
                (même fond neutre que "Ajouter"), même action (voir architecture Capture Intelligente).
                Taille agrandie (§3 chantier UX icônes headers) — styles.micIconBtn DÉDIÉ (48x48, icône
                28px), le bouton "Ajouter" juste à côté garde sa taille (styles.iconBtn, 36x36) : seul le
                micro grossit. alignItems:'center' sur la rangée pour l'alignement malgré la différence
                de hauteur. */}
            <Pressable
              onPress={() => navigation.navigate('Capture')}
              accessibilityRole="button"
              accessibilityLabel="Capture intelligente"
              style={[styles.micIconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            >
              <Ionicons name="mic-outline" size={28} color={theme.inkSoft} />
            </Pressable>
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une pensée"
              style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            >
              <Ionicons name="add" size={20} color={theme.ink} />
            </Pressable>
          </View>
        </View>
      )}

      {isEmpty ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>
            {isFiltered ? 'Rien de noté pour ce proche' : 'Rien à retenir pour le moment'}
          </Text>
          <Text style={[styles.emptyBody, { color: theme.inkSoft }]}>
            {isFiltered
              ? `Tu n’as pas encore confié de pensée liée à ${filterContact?.prenom ?? 'ce proche'}.`
              : 'Note une petite chose que tu aimerais que Pensif retienne — une date n’est pas obligatoire.'}
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <PrimaryButton label="Ajouter une pensée" onPress={openCreate} />
          </View>
        </View>
      ) : (
        <>
          {groups.today.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>AUJOURD'HUI</Text>
              {groups.today.map((c) => (
                <PenseeRow
                  key={c.id}
                  card={c}
                  theme={theme}
                  onPress={() => handleCardPress(c.pensee.id)}
                  onLongPress={() => handleCardLongPress(c.pensee.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(c.pensee.id)}
                />
              ))}
            </>
          )}

          {groups.upcoming.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>À VENIR</Text>
              {groups.upcoming.map((c) => (
                <PenseeRow
                  key={c.id}
                  card={c}
                  theme={theme}
                  onPress={() => handleCardPress(c.pensee.id)}
                  onLongPress={() => handleCardLongPress(c.pensee.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(c.pensee.id)}
                />
              ))}
            </>
          )}

          {groups.today.length === 0 && groups.upcoming.length === 0 && groups.memo.length === 0 && groups.past.length > 0 && (
            <Text style={[styles.emptyInline, { color: theme.inkSoft }]}>Rien d’actif ou à venir pour l’instant.</Text>
          )}

          {groups.memo.length > 0 && (
            <>
              {/* Pensées sans aucune date ni rappel — jamais reléguées en "passées" simplement
                  parce qu'elles vieillissent (CHANTIER PENSÉES V2). */}
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>MÉMORISÉES</Text>
              {groups.memo.map((c) => (
                <PenseeRow
                  key={c.id}
                  card={c}
                  theme={theme}
                  onPress={() => handleCardPress(c.pensee.id)}
                  onLongPress={() => handleCardLongPress(c.pensee.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(c.pensee.id)}
                />
              ))}
            </>
          )}

          {groups.past.length > 0 && (
            <>
              <Pressable onPress={() => setShowPast((v) => !v)} style={styles.pastToggle}>
                <Text style={[styles.sectionLabel, { color: theme.inkSoft, marginBottom: 0 }]}>
                  PASSÉES ({groups.past.length})
                </Text>
                <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={16} color={theme.inkSoft} />
              </Pressable>
              {showPast &&
                groups.past.map((c) => (
                  <PenseeRow
                    key={c.id}
                    card={c}
                    theme={theme}
                    onPress={() => handleCardPress(c.pensee.id)}
                    onLongPress={() => handleCardLongPress(c.pensee.id)}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(c.pensee.id)}
                    muted
                  />
                ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function PenseeRow({
  card,
  theme,
  onPress,
  onLongPress,
  muted,
  selectionMode,
  selected,
}: {
  card: PenseeCard;
  theme: any;
  onPress: () => void;
  onLongPress?: () => void;
  muted?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.line, opacity: muted ? 0.75 : 1 },
        selected && { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accentTint },
      ]}
    >
      {/* Coche visible UNIQUEMENT en mode sélection (voir §3 chantier UX) — jamais en usage normal. */}
      {selectionMode && (
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.accent : theme.inkSoft} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, { color: theme.ink }]} numberOfLines={3}>
          {card.pensee.texte}
        </Text>
        <Text style={[styles.subtitle, { color: theme.inkSoft }]}>{card.subtitle}</Text>
      </View>
      {card.reminderLabel && <Pill label={card.reminderLabel} tone="muted" theme={theme} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Cible tactile 48x48 (minimum recommandé) — voir point d'usage : dédié au micro uniquement.
  micIconBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clearFilterBtn: { marginTop: 4, marginBottom: 8, alignSelf: 'flex-start' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  text: { fontWeight: '700', fontSize: 14, lineHeight: 19 },
  subtitle: { fontSize: 12, marginTop: 4 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8, paddingVertical: 4 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 24, alignItems: 'center' },
  emptyTitle: { fontWeight: '700', fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
  emptyInline: { fontSize: 13, marginTop: 16, textAlign: 'center' },
});
