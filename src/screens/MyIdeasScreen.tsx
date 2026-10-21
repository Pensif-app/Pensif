import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { amazonUrl } from '../data/giftCatalog';
import { isAmazonAffiliateEnabled } from '../lib/amazonAffiliate';
import { chosenGiftFor, savedIdeasFor, withChosenGift, withIdeaRemoved, withoutChosenGift } from '../data/myIdeas';
import { RootStackParamList } from '../navigation/types';

/** Build 9, lot B : les idées aimées pour un proche, avec « Offrir celle-ci » et retrait. */
export function MyIdeasScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'MesIdees'>>();
  const { contacts, today, upsertContact } = useStore();
  const contact = useMemo(() => contacts.find((c) => c.id === route.params.contactId), [contacts, route.params.contactId]);
  const ideas = useMemo(() => (contact ? savedIdeasFor(contact) : []), [contact]);
  const chosen = contact ? chosenGiftFor(contact, today) : null;
  const amazonEnabled = isAmazonAffiliateEnabled();

  if (!contact) {
    return (
      <Screen>
        <Text style={[styles.h1, { color: theme.ink }]}>Ce proche n’est plus disponible</Text>
        <Text style={[styles.sub, { color: theme.inkSoft }]}>Il a peut-être été supprimé.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>Mes idées pour {contact.prenom}</Text>
      <Text style={[styles.sub, { color: theme.inkSoft }]}>Les idées que tu as aimées, à garder sous la main.</Text>

      {ideas.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 20 }}>
            Les idées que tu aimes apparaîtront ici.
          </Text>
        </View>
      ) : (
        ideas.map((gift) => {
          const isChosen = chosen?.id === gift.id;
          const hasAmazonLink = amazonEnabled && !!gift.asin;
          return (
            <View key={gift.id} style={[styles.card, { backgroundColor: theme.card, borderColor: isChosen ? theme.accent : theme.line }]}>
              <View style={styles.top}>
                <View style={[styles.thumb, { backgroundColor: theme.sageTint }]}>
                  <Text style={{ fontSize: 28 }}>{gift.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {isChosen && <Text style={[styles.chosenTag, { color: theme.accent }]}>Cadeau prévu</Text>}
                  <Text style={[styles.title, { color: theme.ink }]} numberOfLines={2}>
                    {gift.title}
                  </Text>
                </View>
              </View>
              <Text style={[styles.pitch, { color: theme.inkSoft }]}>{gift.pitch}</Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => upsertContact(isChosen ? withoutChosenGift(contact) : withChosenGift(contact, gift.id, today))}
                  style={[styles.actionBtn, { borderColor: isChosen ? theme.accent : theme.line, backgroundColor: isChosen ? theme.accentTint : 'transparent' }]}
                >
                  <Ionicons name={isChosen ? 'checkmark-circle' : 'gift-outline'} size={16} color={isChosen ? theme.accent : theme.inkSoft} />
                  <Text style={{ color: isChosen ? theme.accent : theme.inkSoft, fontSize: 12, fontWeight: '700' }}>
                    {isChosen ? 'Cadeau prévu' : 'Offrir celle-ci'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => upsertContact(withIdeaRemoved(contact, gift.id))} style={[styles.actionBtn, { borderColor: theme.line }]}>
                  <Ionicons name="heart-dislike-outline" size={16} color={theme.inkSoft} />
                  <Text style={{ color: theme.inkSoft, fontSize: 12, fontWeight: '600' }}>Retirer</Text>
                </Pressable>
              </View>
              {hasAmazonLink && (
                <Pressable
                  onPress={() => Linking.openURL(amazonUrl(gift.asin!))}
                  accessibilityRole="link"
                  accessibilityLabel={`Voir ${gift.title} sur Amazon`}
                  style={[styles.amazonBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Voir sur Amazon</Text>
                  <Ionicons name="open-outline" size={16} color="#fff" />
                </Pressable>
              )}
            </View>
          );
        })
      )}

      {amazonEnabled && ideas.some((g) => !!g.asin) && (
        <Text style={[styles.affiliateLine, { color: theme.inkSoft }]}>
          Liens affiliés Amazon. En tant que Partenaire Amazon, Pensif réalise un bénéfice sur les achats remplissant les conditions requises.
        </Text>
      )}

      <Pressable
        onPress={() => navigation.navigate('Cadeaux', { contactId: contact.id })}
        style={[styles.moreBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
      >
        <Text style={{ color: theme.accent, fontWeight: '700' }}>Voir de nouvelles idées</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 14 },
  card: { borderWidth: 1.5, borderRadius: 16, padding: 12, marginBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chosenTag: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  title: { fontWeight: '700', fontSize: 14, marginTop: 1 },
  pitch: { fontSize: 12, marginTop: 10, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 9 },
  amazonBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 10 },
  affiliateLine: { fontSize: 12, lineHeight: 17, marginBottom: 14, paddingHorizontal: 4 },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 24, marginTop: 8, marginBottom: 14 },
  moreBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 2, marginBottom: 6 },
});
