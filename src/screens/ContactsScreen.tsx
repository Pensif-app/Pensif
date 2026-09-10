import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { isQuizComplete } from '../data/quiz';
import { RootStackParamList } from '../navigation/types';

export function ContactsScreen() {
  const theme = useTheme();
  const { contacts } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Favoris en tête de liste ; l'ordre relatif entre eux (et entre les autres) reste stable.
  const sorted = useMemo(
    () => [...contacts].sort((a, b) => Number(b.favorite) - Number(a.favorite)),
    [contacts],
  );

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.h1, { color: theme.ink }]}>Mes contacts</Text>
          <Text style={[styles.sub, { color: theme.inkSoft }]}>
            {contacts.length} {contacts.length === 1 ? 'personne suivie' : 'personnes suivies'}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Fiche', undefined)}
          style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
        >
          <Ionicons name="add" size={20} color={theme.ink} />
        </Pressable>
      </View>

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
                  {c.familyRole ?? c.relation} · {c.date.split('-').reverse().join('/')}
                </Text>
              </View>
              <Pill label={hasQuiz ? 'Quizz ✓' : 'Quizz à faire'} tone={hasQuiz ? 'sage' : 'muted'} theme={theme} />
            </Pressable>
          );
        })}
      </View>
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
});
