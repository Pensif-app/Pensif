import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { buildHomeAttentions, HomeAttention, HomeAttentionAction, navigateToAttention } from '../data/homeAttention';
import { Contact } from '../data/types';
import { RootStackParamList } from '../navigation/types';

const weekdayFull = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const monthFull = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Nombre de cartes affichées d'emblée dans "Cette semaine"/"À anticiper" avant "Voir tout" — les
// données au-delà ne sont jamais supprimées, seulement pas rendues tant qu'on n'a pas déplié (voir
// §8 du chantier Accueil V1).
const WEEK_VISIBLE = 5;
const LATER_VISIBLE = 5;

export function HomeScreen() {
  const theme = useTheme();
  const { contacts, pensees, userName, today } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [showAllWeek, setShowAllWeek] = useState(false);
  const [showAllLater, setShowAllLater] = useState(false);

  // Source unique : toute la logique métier (fenêtres temporelles, filtres HARD, tri) vit dans
  // homeAttention.ts — cet écran ne fait plus que répartir par horizon et afficher.
  const attentions = useMemo(() => buildHomeAttentions(contacts, pensees, today), [contacts, pensees, today]);
  const todayItems = useMemo(() => attentions.filter((a) => a.horizon === 'today'), [attentions]);
  const weekItems = useMemo(() => attentions.filter((a) => a.horizon === 'week'), [attentions]);
  const laterItems = useMemo(() => attentions.filter((a) => a.horizon === 'later'), [attentions]);

  const visibleWeek = showAllWeek ? weekItems : weekItems.slice(0, WEEK_VISIBLE);
  const visibleLater = showAllLater ? laterItems : laterItems.slice(0, LATER_VISIBLE);

  function contactFor(a: HomeAttention): Contact | undefined {
    return a.contactId ? contacts.find((c) => c.id === a.contactId) : undefined;
  }

  function runAction(action: HomeAttentionAction) {
    // Mapping partagé avec notifications.ts (voir navigateToAttention) — un seul endroit pour
    // traduire une décision en navigation réelle, jamais dupliqué.
    navigateToAttention((name, params) => (navigation as any).navigate(name, params), action);
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.h1, { color: theme.ink }]}>Bonjour {userName ?? ''}</Text>
          <Text style={[styles.sub, { color: theme.inkSoft }]}>
            {weekdayFull[today.getDay()]} {today.getDate()} {monthFull[today.getMonth()]}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* CHANTIER CAPTURE INTELLIGENTE V1 — point d'entrée principal (Accueil), visible et
              rapide d'accès, comme décidé dans l'architecture. Voir aussi Pensées pour le point
              d'entrée secondaire, plus discret. */}
          <Pressable
            onPress={() => navigation.navigate('Capture')}
            accessibilityRole="button"
            accessibilityLabel="Capture intelligente"
            style={[styles.iconBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}
          >
            <Ionicons name="mic" size={18} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Reglages')}
            style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
          >
            <Ionicons name="settings-outline" size={18} color={theme.ink} />
          </Pressable>
        </View>
      </View>

      {contacts.length === 0 ? (
        // Sans aucun proche, les trois sections n'auraient rien d'autre à montrer que trois
        // messages "rien de prévu" à la suite — un seul état vide avec un CTA direct est plus clair
        // (voir CHANTIER PRÉ-BÊTA 1 §4). Volontairement minimal : pas de carrousel ni de tutoriel.
        <View style={[styles.card, styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>Ajouter un proche</Text>
          <Text style={[styles.emptyBody, { color: theme.inkSoft }]}>
            Pour commencer, ajoute une première personne qui compte pour toi. Pensif pourra ensuite t’aider à
            retenir les petites choses importantes au bon moment.
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <PrimaryButton label="Commencer" onPress={() => navigation.navigate('Fiche', undefined)} />
          </View>
        </View>
      ) : (
        <>
          {todayItems.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>AUJOURD'HUI</Text>
              {todayItems.map((a) => (
                <AttentionCard key={a.id} attention={a} contact={contactFor(a)} theme={theme} emphasis onPress={() => runAction(a.action)} />
              ))}
            </>
          )}

          <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>CETTE SEMAINE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
            {weekItems.length === 0 && <Text style={[styles.empty, { color: theme.inkSoft }]}>Rien de particulier cette semaine.</Text>}
            {visibleWeek.map((a, idx) => (
              <AttentionCard
                key={a.id}
                attention={a}
                contact={contactFor(a)}
                theme={theme}
                onPress={() => runAction(a.action)}
                withBorder={idx < visibleWeek.length - 1}
              />
            ))}
          </View>
          {weekItems.length > WEEK_VISIBLE && (
            <Pressable onPress={() => setShowAllWeek((v) => !v)} style={styles.seeMoreBtn}>
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>
                {showAllWeek ? 'Réduire' : `Voir tout (${weekItems.length})`}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>À ANTICIPER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
            {laterItems.length === 0 && <Text style={[styles.empty, { color: theme.inkSoft }]}>Rien à anticiper pour l’instant.</Text>}
            {visibleLater.map((a, idx) => (
              <AttentionCard
                key={a.id}
                attention={a}
                contact={contactFor(a)}
                theme={theme}
                onPress={() => runAction(a.action)}
                withBorder={idx < visibleLater.length - 1}
              />
            ))}
          </View>
          {laterItems.length > LATER_VISIBLE && (
            <Pressable onPress={() => setShowAllLater((v) => !v)} style={styles.seeMoreBtn}>
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>
                {showAllLater ? 'Réduire' : `Voir tout (${laterItems.length})`}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </Screen>
  );
}

function AttentionCard({
  attention,
  contact,
  theme,
  onPress,
  emphasis,
  withBorder,
}: {
  attention: HomeAttention;
  contact: Contact | undefined;
  theme: any;
  onPress: () => void;
  emphasis?: boolean;
  withBorder?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        emphasis ? [styles.todayCard, { backgroundColor: theme.plumTint, borderColor: theme.plum }] : styles.row,
        !emphasis && withBorder && { borderBottomColor: theme.line, borderBottomWidth: 1 },
      ]}
    >
      {contact && <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} size={emphasis ? 50 : undefined} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: theme.ink, fontSize: emphasis ? 16 : 14 }]}>{attention.title}</Text>
        <Text style={[styles.meta, { color: theme.inkSoft }]}>{attention.subtitle}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 5 }}>
        {attention.favorite && <Ionicons name="star" size={14} color={theme.plum} />}
        {attention.badge && <Pill label={attention.badge.label} tone={attention.badge.tone} theme={theme} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  todayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  name: { fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  empty: { paddingVertical: 16, fontSize: 13, textAlign: 'center' },
  seeMoreBtn: { alignItems: 'center', paddingVertical: 10 },
  emptyCard: { padding: 24, alignItems: 'center', marginTop: 8 },
  emptyTitle: { fontWeight: '700', fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
});
