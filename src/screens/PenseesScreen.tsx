import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { buildPenseeCards, groupPenseeCards, PenseeCard } from '../data/penseesView';
import { navigateToAttention } from '../data/homeAttention';
import { RootStackParamList, TabParamList } from '../navigation/types';

/**
 * Onglet "Pensées" — ce que l'utilisateur a confié à Pensif (texte + date, éventuellement une
 * période, un proche lié, un rappel), pas une todo-list : aucune action "à faire" n'apparaît ici,
 * seulement ce qui a été noté. La création/l'édition/la suppression restent dans le Calendrier
 * (voir §8 du chantier Accueil V1) — cet écran ne fait que retrouver et donner accès au détail.
 *
 * `contactId` (route param optionnel) filtre sur un seul proche — contexte de navigation ponctuel
 * (ex. Fiche → "Voir les pensées"), JAMAIS un état persistant : un tap direct sur l'onglet Pensées
 * le réinitialise toujours (voir tabNavigationHelpers.ts). Sans paramètre, comportement inchangé.
 */
export function PenseesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Pensées'>>();
  const { pensees, contacts, today } = useStore();
  const [showPast, setShowPast] = useState(false);

  const filterContactId = route.params?.contactId;
  const filterContact = filterContactId ? contacts.find((c) => c.id === filterContactId) : undefined;
  const isFiltered = Boolean(filterContactId);

  const visiblePensees = useMemo(
    () => (filterContactId ? pensees.filter((p) => p.contactId === filterContactId) : pensees),
    [pensees, filterContactId],
  );

  const groups = useMemo(() => groupPenseeCards(buildPenseeCards(visiblePensees, contacts, today)), [visiblePensees, contacts, today]);

  function openInCalendar(focusDate: string) {
    navigateToAttention((name, params) => (navigation as any).navigate(name, params), { kind: 'calendar', focusDate });
  }

  function clearFilter() {
    // setParams (pas navigate) : reste sur cet écran, retire juste le contexte de filtrage — voir
    // §9 du chantier, le filtre ne doit jamais devenir un état global.
    (navigation as any).setParams({ contactId: undefined });
  }

  const isEmpty = visiblePensees.length === 0;

  return (
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>{isFiltered ? `Pensées de ${filterContact?.prenom ?? 'ce proche'}` : 'Pensées'}</Text>
      {isFiltered ? (
        <Pressable onPress={clearFilter} style={styles.clearFilterBtn}>
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Toutes les pensées</Text>
        </Pressable>
      ) : (
        <Text style={[styles.sub, { color: theme.inkSoft }]}>Ce que tu as confié à Pensif.</Text>
      )}

      {isEmpty ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>
            {isFiltered ? 'Rien de noté pour ce proche' : 'Rien à retenir pour le moment'}
          </Text>
          <Text style={[styles.emptyBody, { color: theme.inkSoft }]}>
            {isFiltered
              ? `Tu n’as pas encore confié de pensée liée à ${filterContact?.prenom ?? 'ce proche'}.`
              : 'Note une petite chose que tu aimerais que Pensif te rappelle au bon moment.'}
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <PrimaryButton label="Aller au calendrier" onPress={() => (navigation as any).navigate('Tabs', { screen: 'Calendrier' })} />
          </View>
        </View>
      ) : (
        <>
          {groups.today.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>AUJOURD'HUI</Text>
              {groups.today.map((c) => (
                <PenseeRow key={c.id} card={c} theme={theme} onPress={() => openInCalendar(c.pensee.date)} />
              ))}
            </>
          )}

          {groups.upcoming.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>À VENIR</Text>
              {groups.upcoming.map((c) => (
                <PenseeRow key={c.id} card={c} theme={theme} onPress={() => openInCalendar(c.pensee.date)} />
              ))}
            </>
          )}

          {groups.today.length === 0 && groups.upcoming.length === 0 && groups.past.length > 0 && (
            <Text style={[styles.emptyInline, { color: theme.inkSoft }]}>Rien d’actif ou à venir pour l’instant.</Text>
          )}

          {groups.past.length > 0 && (
            <>
              <Pressable onPress={() => setShowPast((v) => !v)} style={styles.pastToggle}>
                <Text style={[styles.sectionLabel, { color: theme.inkSoft, marginBottom: 0 }]}>
                  PASSÉES ({groups.past.length})
                </Text>
                <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={16} color={theme.inkSoft} />
              </Pressable>
              {showPast && groups.past.map((c) => <PenseeRow key={c.id} card={c} theme={theme} onPress={() => openInCalendar(c.pensee.date)} muted />)}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function PenseeRow({ card, theme, onPress, muted }: { card: PenseeCard; theme: any; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line, opacity: muted ? 0.75 : 1 }]}>
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
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 8 },
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
