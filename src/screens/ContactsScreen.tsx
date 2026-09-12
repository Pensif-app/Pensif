import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { isQuizComplete } from '../data/quiz';
import { birthdayCountdownLabel, daysUntilNext } from '../data/calendar';
import { Contact } from '../data/types';
import { RootStackParamList } from '../navigation/types';

/**
 * Tri déterministe, sans scoring composite : favoris d'abord, puis à favori égal le prochain
 * anniversaire le plus proche, puis à égalité l'ordre alphabétique — voir CHANTIER PROCHES + FICHE
 * V1 §3. Un proche sans date valide (ne devrait normalement pas arriver, FicheScreen l'exige à la
 * sauvegarde) est relégué en fin de son groupe favori/non-favori plutôt que de faire planter le tri.
 */
function compareContacts(a: Contact, b: Contact, today: Date): number {
  if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
  const aHasDate = Boolean(a.date);
  const bHasDate = Boolean(b.date);
  if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
  if (aHasDate && bHasDate) {
    const diff = daysUntilNext(a.date, today) - daysUntilNext(b.date, today);
    if (diff !== 0) return diff;
  }
  return `${a.prenom} ${a.nom}`.trim().localeCompare(`${b.prenom} ${b.nom}`.trim());
}

export function ContactsScreen() {
  const theme = useTheme();
  const { contacts, today } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const sorted = useMemo(() => [...contacts].sort((a, b) => compareContacts(a, b, today)), [contacts, today]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.h1, { color: theme.ink }]}>Mes proches</Text>
          <Text style={[styles.sub, { color: theme.inkSoft }]}>
            {contacts.length} {contacts.length === 1 ? 'proche suivi' : 'proches suivis'}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Fiche', undefined)}
          accessibilityRole="button"
          accessibilityLabel="Ajouter un proche"
          style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
        >
          <Ionicons name="add" size={20} color={theme.ink} />
        </Pressable>
      </View>

      {contacts.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>Ajoute les personnes qui comptent</Text>
          <Text style={[styles.emptyBody, { color: theme.inkSoft }]}>
            Pensif pourra t’aider à retenir leurs dates et les petites choses importantes.
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <PrimaryButton label="Ajouter un proche" onPress={() => navigation.navigate('Fiche', undefined)} />
          </View>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {sorted.map((c, idx) => {
            const hasQuiz = isQuizComplete(c.quiz);
            return (
              <Pressable
                key={c.id}
                onPress={() => navigation.navigate('Fiche', { contactId: c.id })}
                style={[styles.row, idx < sorted.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}
              >
                <Avatar initials={c.initials} colorKey={c.color} theme={theme} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    {c.favorite && <Ionicons name="star" size={13} color={theme.plum} />}
                    <Text style={[styles.name, { color: theme.ink }]}>{`${c.prenom} ${c.nom}`.trim()}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.inkSoft }]}>
                    {c.familyRole ?? c.relation}
                    {c.date ? ` · ${birthdayCountdownLabel(c.date, today)}` : ''}
                  </Text>
                </View>
                <Pill label={hasQuiz ? 'Quizz ✓' : 'Quizz à faire'} tone={hasQuiz ? 'sage' : 'muted'} theme={theme} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontWeight: '700', fontSize: 15 },
  meta: { fontSize: 12, marginTop: 2 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 8, alignItems: 'center' },
  emptyTitle: { fontWeight: '700', fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
});
