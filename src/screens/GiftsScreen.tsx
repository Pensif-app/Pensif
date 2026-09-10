import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { daysUntilNext } from '../data/calendar';
import { generateGiftIdeas } from '../data/giftEngine';
import { INTEREST_OPTIONS } from '../data/quiz';
import { isQuizComplete } from '../data/quiz';
import { RootStackParamList, TabParamList } from '../navigation/types';

export function GiftsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Cadeaux'>>();
  const { contacts, today, giftSentIds, toggleGiftSent } = useStore();
  const [maxBudget, setMaxBudget] = useState(60);

  const contact = useMemo(() => {
    if (route.params?.contactId) return contacts.find((c) => c.id === route.params?.contactId);
    const withIdeas = contacts
      .filter((c) => isQuizComplete(c.quiz))
      .map((c) => ({ c, days: daysUntilNext(c.date, today) }))
      .sort((a, b) => a.days - b.days);
    return withIdeas[0]?.c;
  }, [route.params?.contactId, contacts, today]);

  // Doit rester avant tout `return` anticipé : les hooks doivent s'exécuter dans le même ordre
  // à chaque rendu, sinon React perd le fil (ex. dès que le dernier contact éligible est supprimé).
  const allIdeas = useMemo(() => (contact ? generateGiftIdeas(contact) : []), [contact]);

  if (!contact) {
    return (
      <Screen>
        <Text style={[styles.h1, { color: theme.ink }]}>Pensée</Text>
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 20 }}>
            Aucune suggestion pour l'instant. Remplis le petit quizz d'un contact pour voir apparaître des idées
            cadeaux et des messages ici à l'approche de son anniversaire.
          </Text>
        </View>
      </Screen>
    );
  }

  const ideas = allIdeas.filter((g) => g.price <= maxBudget);
  const days = daysUntilNext(contact.date, today);
  const sent = giftSentIds.includes(contact.id);

  return (
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>Pensée pour {contact.prenom}</Text>
      <Text style={[styles.sub, { color: theme.inkSoft }]}>
        Anniversaire le {contact.date.split('-').reverse().join('/')} · J-{days}
      </Text>

      <Pressable
        onPress={() => navigation.navigate('Message', { contactId: contact.id })}
        style={[styles.messageCard, { backgroundColor: theme.accentTint, borderColor: theme.accent }]}
      >
        <View style={[styles.messageIcon, { backgroundColor: theme.accent }]}>
          <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14 }}>Écrire un message</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 12, marginTop: 2 }}>3 messages prêts à envoyer, personnalisés pour {contact.prenom}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.accent} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>IDÉES CADEAUX</Text>
      <View style={styles.tagRow}>
        {contact.quiz?.interests.map((tag) => {
          const opt = INTEREST_OPTIONS.find((o) => o.key === tag);
          return (
            <View key={tag} style={[styles.tag, { backgroundColor: theme.plumTint }]}>
              <Text style={{ color: theme.plum, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                {opt?.emoji} {opt?.label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.budgetBox, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={styles.budgetRow}>
          <Text style={{ color: theme.inkSoft, fontSize: 12, fontWeight: '700' }}>BUDGET MAX</Text>
          <Text style={{ color: theme.accentStrong, fontWeight: '700', fontSize: 16 }}>{maxBudget} €</Text>
        </View>
        <Slider
          minimumValue={15}
          maximumValue={100}
          step={1}
          value={maxBudget}
          onValueChange={setMaxBudget}
          minimumTrackTintColor={theme.accentStrong}
          maximumTrackTintColor={theme.line}
          thumbTintColor={theme.accentStrong}
        />
        <Text style={{ color: theme.inkSoft, fontSize: 12 }}>
          {ideas.length} {ideas.length === 1 ? 'idée jusqu’à' : 'idées jusqu’à'} {maxBudget} €
        </Text>
      </View>

      {ideas.map((g) => (
        <View key={g.id} style={[styles.giftCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={[styles.thumb, { backgroundColor: theme.sageTint }]}>
            <Text style={{ fontSize: 22 }}>{g.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.giftTitle, { color: theme.ink }]}>{g.title}</Text>
            <Text style={[styles.giftWhy, { color: theme.inkSoft }]}>{g.why}</Text>
            <Text style={[styles.giftPrice, { color: theme.accentStrong }]}>{g.price} €</Text>
          </View>
        </View>
      ))}

      <Pressable
        onPress={() => toggleGiftSent(contact.id)}
        style={[styles.sentToggle, { backgroundColor: theme.card, borderColor: theme.line }]}
      >
        <View style={[styles.checkbox, sent && { backgroundColor: theme.sage, borderColor: theme.sage }]} />
        <Text style={{ color: theme.ink, fontWeight: '600' }}>Cadeau déjà envoyé</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 12 },
  messageCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 18 },
  messageIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, maxWidth: 260 },
  budgetBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  giftCard: { flexDirection: 'row', gap: 12, padding: 12, borderWidth: 1, borderRadius: 16, marginBottom: 10 },
  thumb: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  giftTitle: { fontWeight: '700', fontSize: 14 },
  giftWhy: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  giftPrice: { fontWeight: '700', fontSize: 14, marginTop: 6 },
  sentToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 6 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#999' },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 24, marginTop: 16 },
});
