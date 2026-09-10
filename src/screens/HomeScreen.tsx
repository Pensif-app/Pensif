import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { daysUntilNext } from '../data/calendar';
import { isQuizComplete } from '../data/quiz';
import { RootStackParamList } from '../navigation/types';

const weekdayFull = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const monthFull = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function HomeScreen() {
  const theme = useTheme();
  const { contacts, pensees, deletePensee, userName, today } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const sorted = useMemo(() => {
    return contacts
      .map((c) => ({ contact: c, daysUntil: daysUntilNext(c.date, today) }))
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [contacts, today]);

  const todays = sorted.filter((x) => x.daysUntil === 0);
  const upcoming = sorted.filter((x) => x.daysUntil > 0).slice(0, 6);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.h1, { color: theme.ink }]}>Bonjour {userName ?? ''}</Text>
          <Text style={[styles.sub, { color: theme.inkSoft }]}>
            {weekdayFull[today.getDay()]} {today.getDate()} {monthFull[today.getMonth()]}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Reglages')}
          style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
        >
          <Ionicons name="settings-outline" size={18} color={theme.ink} />
        </Pressable>
      </View>

      {todays.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>AUJOURD'HUI</Text>
          {todays.map(({ contact }) => (
            <Pressable
              key={contact.id}
              onPress={() => navigation.navigate('Message', { contactId: contact.id })}
              style={[styles.todayCard, { backgroundColor: theme.plumTint, borderColor: theme.plum }]}
            >
              <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} size={50} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.ink }]}>{contact.prenom}</Text>
                <Text style={[styles.meta, { color: theme.inkSoft }]}>C'est le grand jour 🎂</Text>
              </View>
              <Pill label="Aujourd'hui" tone="plum" theme={theme} />
            </Pressable>
          ))}
        </>
      )}

      <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>ÇA ARRIVE</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {upcoming.length === 0 && (
          <Text style={[styles.empty, { color: theme.inkSoft }]}>Aucun anniversaire dans les prochains mois.</Text>
        )}
        {upcoming.map(({ contact, daysUntil }, idx) => {
          const hasQuiz = isQuizComplete(contact.quiz);
          return (
            <Pressable
              key={contact.id}
              onPress={() => navigation.navigate('Fiche', { contactId: contact.id })}
              style={[styles.row, idx < upcoming.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}
            >
              <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.ink, fontSize: 14 }]}>{`${contact.prenom} ${contact.nom}`.trim()}</Text>
                <Text style={[styles.meta, { color: theme.inkSoft }]}>{contact.relation}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Text style={[styles.countdown, { color: theme.inkSoft }]}>J-{daysUntil}</Text>
                {daysUntil <= 14 && hasQuiz ? (
                  <Pill label="Idées dispo" tone="accent" theme={theme} />
                ) : hasQuiz ? (
                  <Pill label="Pas de cadeau" tone="plum" theme={theme} />
                ) : (
                  <Pill label="Quizz à faire" tone="muted" theme={theme} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {pensees.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>PENSÉES À VENIR</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
            {pensees.slice(0, 3).map((p, idx) => (
              <View
                key={p.id}
                style={[styles.row, idx < 2 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.ink, fontSize: 14 }]}>{p.texte}</Text>
                  <Text style={[styles.meta, { color: theme.inkSoft }]}>{p.date.split('-').reverse().join('/')}</Text>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert('Supprimer cette pensée ?', 'Elle disparaîtra du calendrier et de l’accueil.', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => deletePensee(p.id) },
                    ])
                  }
                  hitSlop={10}
                  style={{ padding: 4 }}
                  accessibilityLabel="Supprimer"
                >
                  <Ionicons name="trash-outline" size={16} color={theme.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  todayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  name: { fontWeight: '700', fontSize: 16 },
  meta: { fontSize: 12, marginTop: 2 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  countdown: { fontSize: 12, fontWeight: '700' },
  empty: { paddingVertical: 16, fontSize: 13, textAlign: 'center' },
});
