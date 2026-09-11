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
import { ageTurning, daysUntilNext } from '../data/calendar';
import { isQuizComplete } from '../data/quiz';
import { RootStackParamList } from '../navigation/types';

// "Ça arrive" ne montre que les 2 prochains mois — au-delà, c'est le rôle de l'onglet Contacts
// (qui liste tout le monde) ; sans cette limite, les deux pages finissaient par se ressembler.
const UPCOMING_WINDOW_DAYS = 60;

const weekdayFull = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const monthFull = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** null si l'année saisie n'est manifestement pas une vraie année de naissance (peu fiable). */
function plausibleAge(dateStr: string, today: Date): number | null {
  const age = ageTurning(dateStr, today);
  return age > 0 && age < 130 ? age : null;
}

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
  // Fenêtre volontairement courte (2 mois) : l'accueil doit rester un "ça arrive bientôt", pas un
  // second annuaire complet qui redouble l'onglet Contacts.
  const upcoming = sorted.filter((x) => x.daysUntil > 0 && x.daysUntil <= UPCOMING_WINDOW_DAYS);

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
          {todays.map(({ contact }) => {
            const age = plausibleAge(contact.date, today);
            return (
              <Pressable
                key={contact.id}
                onPress={() => navigation.navigate('Message', { contactId: contact.id })}
                style={[styles.todayCard, { backgroundColor: theme.plumTint, borderColor: theme.plum }]}
              >
                <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} size={50} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.ink }]}>{contact.prenom}</Text>
                  <Text style={[styles.meta, { color: theme.inkSoft }]}>
                    {age ? `Fête ses ${age} ans aujourd'hui 🎂` : "C'est le grand jour 🎂"}
                  </Text>
                </View>
                <Pill label="Aujourd'hui" tone="plum" theme={theme} />
              </Pressable>
            );
          })}
        </>
      )}

      <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>ÇA ARRIVE</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {upcoming.length === 0 && (
          <Text style={[styles.empty, { color: theme.inkSoft }]}>Aucun anniversaire dans les prochains mois.</Text>
        )}
        {upcoming.map(({ contact, daysUntil }, idx) => {
          const hasQuiz = isQuizComplete(contact.quiz);
          const age = plausibleAge(contact.date, today);
          return (
            <Pressable
              key={contact.id}
              onPress={() => {
                // Toucher un contact déclenche la prochaine action à faire pour lui plutôt que
                // toujours ouvrir sa fiche : le quizz s'il manque, sinon les idées (cadeau/message)
                // s'il n'a rien reçu, sinon sa fiche pour régler l'alerte ou vérifier les infos.
                if (!hasQuiz) navigation.navigate('Quiz', { contactId: contact.id });
                else if (!contact.giftSent) navigation.navigate('Tabs', { screen: 'Cadeaux', params: { contactId: contact.id } });
                else navigation.navigate('Fiche', { contactId: contact.id });
              }}
              style={[styles.row, idx < upcoming.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}
            >
              <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.ink, fontSize: 14 }]}>{`${contact.prenom} ${contact.nom}`.trim()}</Text>
                <Text style={[styles.meta, { color: theme.inkSoft }]}>
                  {age ? `Fête ses ${age} ans dans ${daysUntil} j` : `${contact.familyRole ?? contact.relation} · J-${daysUntil}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                {contact.favorite && <Ionicons name="star" size={14} color={theme.plum} />}
                {!hasQuiz ? (
                  <Pill label="Quizz à faire" tone="muted" theme={theme} />
                ) : !contact.giftSent ? (
                  <Pill label="Idées dispo" tone="accent" theme={theme} />
                ) : contact.birthdayReminderDays == null ? (
                  <Pill label="Alerte à régler" tone="plum" theme={theme} />
                ) : (
                  <Pill label="Tout est prêt" tone="sage" theme={theme} />
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
  empty: { paddingVertical: 16, fontSize: 13, textAlign: 'center' },
});
