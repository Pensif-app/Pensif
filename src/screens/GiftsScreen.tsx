import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Pill } from '../components/Pill';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { daysUntilNext } from '../data/calendar';
import { amazonUrl } from '../data/giftCatalog';
import { BUDGET_OPTIONS, isQuizComplete, normalizeQuizProfile } from '../data/quiz';
import {
  generateCandidates,
  PRECISION_LABELS,
  precisionLevel,
  REJECT_REASON_LABELS,
  ScoredCandidate,
  topRecommendations,
  whyForContact,
} from '../data/recommendationEngine';
import { Contact, RejectReason } from '../data/types';
import { RootStackParamList, TabParamList } from '../navigation/types';

const MEDALS = ['🥇', '🥈', '🥉'];
const PRECISION_TONES: Record<ReturnType<typeof precisionLevel>, 'muted' | 'accent' | 'sage'> = {
  faible: 'muted',
  bonne: 'accent',
  excellente: 'sage',
};

// Le curseur va de 20€ à 100€ ; en butée haute il représente "100 € et +" (budget non plafonné).
const SLIDER_MIN = 20;
const SLIDER_MAX = 100;
function clampBudget(v: number): number {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(v)));
}

export function GiftsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Cadeaux'>>();
  const { contacts, today, giftSentIds, toggleGiftSent, upsertContact } = useStore();

  const contact = useMemo(() => {
    if (route.params?.contactId) return contacts.find((c) => c.id === route.params?.contactId);
    const withIdeas = contacts
      .filter((c) => isQuizComplete(c.quiz))
      .map((c) => ({ c, days: daysUntilNext(c.date, today) }))
      .sort((a, b) => a.days - b.days);
    return withIdeas[0]?.c;
  }, [route.params?.contactId, contacts, today]);

  const suggestedMax = useMemo(() => BUDGET_OPTIONS.find((o) => o.key === contact?.quiz?.budget)?.max ?? null, [contact]);
  const initialSlider = useMemo(() => clampBudget(suggestedMax ?? SLIDER_MIN), [suggestedMax]);

  // Doivent rester avant tout `return` anticipé : les hooks doivent s'exécuter dans le même ordre
  // à chaque rendu (voir le commentaire équivalent qui existait déjà sur cet écran).
  const [sliderValue, setSliderValue] = useState(initialSlider);
  const [budgetMax, setBudgetMax] = useState(initialSlider === SLIDER_MAX ? Infinity : initialSlider);
  // Accumule tout ce qui a déjà été montré ou rejeté pendant cette visite de l'écran — ne se vide
  // JAMAIS sur un simple changement de budget, sinon des idées déjà écartées ("Pas convaincu")
  // pouvaient réapparaître en boucle à chaque réglage du curseur.
  const [sessionExcluded, setSessionExcluded] = useState<string[]>([]);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [likedAsins, setLikedAsins] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  // Changer de contact repart d'un état propre — le budget/les exclusions n'ont pas de sens d'un
  // contact à l'autre.
  useEffect(() => {
    setSliderValue(initialSlider);
    setBudgetMax(initialSlider === SLIDER_MAX ? Infinity : initialSlider);
    setSessionExcluded([]);
    setLikedAsins([]);
    setShowAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  // Le Top 3 est directement dérivé de candidates (trié par score) plutôt que "figé puis patché" —
  // rejeter un candidat l'ajoute simplement à sessionExcluded, et le 4e de la liste triée prend
  // naturellement sa place. Une seule source de vérité, donc pas de désynchronisation possible.
  const candidates = useMemo<ScoredCandidate[]>(() => {
    if (!contact) return [];
    return generateCandidates(contact, { maxEuros: budgetMax }, sessionExcluded);
  }, [contact, budgetMax, sessionExcluded]);
  const top = topRecommendations(candidates, 3);

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

  const days = daysUntilNext(contact.date, today);
  const sent = giftSentIds.includes(contact.id);
  const candidateByAsin = new Map(candidates.map((c) => [c.gift.asin, c]));
  const precision = precisionLevel(contact);

  function commitSlider(value: number) {
    const v = clampBudget(value);
    setSliderValue(v);
    setBudgetMax(v === SLIDER_MAX ? Infinity : v);
    // Un budget différent ne doit pas faire réapparaître ce qui a déjà été vu/rejeté.
  }

  function handleLike(asin: string) {
    if (!contact?.quiz) return;
    const quiz = normalizeQuizProfile(contact.quiz);
    setLikedAsins((prev) => [...prev, asin]);
    upsertContact({
      ...contact,
      quiz: {
        ...quiz,
        recommendationHistory: [...quiz.recommendationHistory, { at: new Date().toISOString(), shownAsins: top.map((c) => c.gift.asin), likedAsins: [asin] }],
      },
    });
  }

  function handleReject(reason: RejectReason) {
    if (!contact?.quiz || !rejectTarget) return;
    const quiz = normalizeQuizProfile(contact.quiz);
    const asin = rejectTarget;
    const rejectedTheme = candidateByAsin.get(asin)?.gift.theme;
    upsertContact({
      ...contact,
      quiz: { ...quiz, feedback: [...quiz.feedback, { asin, theme: rejectedTheme, reason, at: new Date().toISOString() }] },
    });
    // Ajoute juste ce produit aux exclusions — candidates (dérivé) fait automatiquement remonter
    // le suivant sur la liste triée à cette place, pas besoin de le calculer/patcher à la main.
    setSessionExcluded((prev) => [...prev, asin]);
    setRejectTarget(null);

    // "Trop cher" ne modifie jamais silencieusement un budget permanent — le budget appartient à
    // cette recherche, pas au profil du contact. On propose juste, explicitement, de le baisser
    // pour CETTE session : si accepté, ça ne fait qu'ajuster le curseur déjà affiché à l'écran.
    if (reason === 'too_expensive') {
      const lower = clampBudget(Math.round(sliderValue * 0.75));
      if (lower < sliderValue) {
        Alert.alert('Chercher moins cher ?', `Voir les idées à ${lower}€ et moins ?`, [
          { text: 'Non merci', style: 'cancel' },
          { text: `Oui, ${lower}€`, onPress: () => commitSlider(lower) },
        ]);
      }
    }
  }

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

      {!isQuizComplete(contact.quiz) ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 20 }}>
            Remplis le petit quizz de {contact.prenom} pour débloquer des idées cadeaux personnalisées.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.precisionRow}>
            <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>IDÉES CADEAUX</Text>
            <Pill label={`Précision : ${PRECISION_LABELS[precision]}`} tone={PRECISION_TONES[precision]} theme={theme} />
          </View>

          <View style={[styles.budgetBox, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.budgetRow}>
              <Text style={{ color: theme.inkSoft, fontSize: 12, fontWeight: '700' }}>BUDGET</Text>
              <Text style={{ color: theme.accentStrong, fontWeight: '700', fontSize: 16 }}>
                {sliderValue >= SLIDER_MAX ? '100 € et +' : `jusqu’à ${sliderValue} €`}
              </Text>
            </View>
            <Slider
              minimumValue={SLIDER_MIN}
              maximumValue={SLIDER_MAX}
              step={5}
              value={sliderValue}
              onValueChange={setSliderValue}
              onSlidingComplete={commitSlider}
              minimumTrackTintColor={theme.accentStrong}
              maximumTrackTintColor={theme.line}
              thumbTintColor={theme.accentStrong}
            />
          </View>

          {top.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <Text style={{ color: theme.inkSoft, textAlign: 'center', lineHeight: 20 }}>
                Aucune idée dans ce budget pour l'instant. Essaie un budget un peu plus large.
              </Text>
            </View>
          ) : (
            <>
              {(showAll ? candidates : top).map((c, idx) => (
                <RecommendationCard
                  key={c.gift.asin}
                  candidate={c}
                  medal={MEDALS[idx] ?? null}
                  contact={contact}
                  theme={theme}
                  liked={likedAsins.includes(c.gift.asin)}
                  onLike={() => handleLike(c.gift.asin)}
                  onReject={() => setRejectTarget(c.gift.asin)}
                />
              ))}
              {candidates.length > 3 && (
                <Pressable
                  onPress={() => setShowAll((v) => !v)}
                  style={[styles.seeMoreBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
                >
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>{showAll ? 'Réduire' : 'Tout voir'}</Text>
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      <Pressable
        onPress={() => toggleGiftSent(contact.id)}
        style={[styles.sentToggle, { backgroundColor: theme.card, borderColor: theme.line }]}
      >
        <View style={[styles.checkbox, sent && { backgroundColor: theme.sage, borderColor: theme.sage }]} />
        <Text style={{ color: theme.ink, fontWeight: '600' }}>Cadeau déjà envoyé</Text>
      </Pressable>

      <Modal visible={rejectTarget != null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRejectTarget(null)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>Pourquoi cette idée ne convient pas ?</Text>
            {(Object.keys(REJECT_REASON_LABELS) as RejectReason[]).map((reason) => (
              <Pressable key={reason} onPress={() => handleReject(reason)} style={[styles.modalRow, { borderColor: theme.line }]}>
                <Text style={{ color: theme.ink, fontSize: 14 }}>{REJECT_REASON_LABELS[reason]}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/** Carte de recommandation cliquable vers Amazon, avec explication personnalisée et les actions
 *  ♡ "J'aime cette idée" / ↻ "Pas convaincu". Tente la vraie photo produit, repli sur l'emoji si
 *  l'image ne charge pas (fiche retirée, format d'URL non servi pour cet ASIN…). */
function RecommendationCard({
  candidate,
  medal,
  contact,
  theme,
  liked,
  onLike,
  onReject,
}: {
  candidate: ScoredCandidate;
  medal: string | null;
  contact: Contact;
  theme: any;
  liked: boolean;
  onLike: () => void;
  onReject: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const gift = candidate.gift;
  return (
    <View style={[styles.recoCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Pressable onPress={() => Linking.openURL(amazonUrl(gift.asin))} style={styles.recoTop}>
        <View style={[styles.thumb, { backgroundColor: theme.sageTint }]}>
          {imageFailed ? (
            <Text style={{ fontSize: 22 }}>{gift.emoji}</Text>
          ) : (
            <Image source={{ uri: gift.imageUrl }} style={styles.thumbImage} resizeMode="contain" onError={() => setImageFailed(true)} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {medal && <Text style={{ fontSize: 12 }}>{medal}</Text>}
          <Text style={[styles.giftTitle, { color: theme.ink }]} numberOfLines={2}>
            {gift.title}
          </Text>
          <Text style={[styles.giftPrice, { color: theme.accentStrong }]}>{gift.price} €</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={theme.inkSoft} />
      </Pressable>
      <Text style={[styles.giftWhy, { color: theme.inkSoft }]}>{whyForContact(candidate, contact)}</Text>
      <View style={styles.recoActions}>
        <Pressable onPress={onLike} style={[styles.recoActionBtn, { borderColor: theme.line }]}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? theme.plum : theme.inkSoft} />
          <Text style={{ color: liked ? theme.plum : theme.inkSoft, fontSize: 12, fontWeight: '600' }}>J’aime cette idée</Text>
        </Pressable>
        <Pressable onPress={onReject} style={[styles.recoActionBtn, { borderColor: theme.line }]}>
          <Ionicons name="refresh" size={16} color={theme.inkSoft} />
          <Text style={{ color: theme.inkSoft, fontSize: 12, fontWeight: '600' }}>Pas convaincu</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 12 },
  messageCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 18 },
  messageIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  precisionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  budgetBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  recoCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  recoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  giftTitle: { fontWeight: '700', fontSize: 14, marginTop: 1 },
  giftWhy: { fontSize: 12, marginTop: 10, lineHeight: 16 },
  giftPrice: { fontWeight: '700', fontSize: 14, marginTop: 4 },
  recoActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  recoActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 9 },
  seeMoreBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 2, marginBottom: 6 },
  sentToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 6 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#999' },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 24, marginTop: 8, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  modalTitle: { fontWeight: '700', fontSize: 15, marginBottom: 12 },
  modalRow: { paddingVertical: 13, borderTopWidth: 1 },
});
