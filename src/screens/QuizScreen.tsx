import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PrimaryButton } from '../components/PrimaryButton';
import { ANSWER_FILL_MS, ChoiceCard } from '../components/quiz/ChoiceCard';
import { ThemeAffinageQuiz } from '../components/quiz/ThemeAffinage';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import {
  archetypeFor,
  computeTraits,
  formatQuizText,
  INTEREST_OPTIONS,
  VISIBLE_INTEREST_OPTIONS,
  QUIZ_QUESTIONS,
  sortedTraits,
  TRAIT_LABELS,
} from '../data/quiz';
import { getThemeQuiz } from '../data/themeQuizzes';
import { inferAvoidFromText } from '../data/textSignals';
import { Contact, InterestTag, QuizAnswer } from '../data/types';
import { RootStackParamList } from '../navigation/types';

// Doit correspondre au paddingHorizontal de styles.progressTrackWrap.
const TRACK_PADDING_H = 20;
const STEP_QUESTIONS = QUIZ_QUESTIONS.length; // 0..6
const STEP_INTERESTS = STEP_QUESTIONS; // 7
const STEP_AFFINAGE = STEP_QUESTIONS + 1; // 8
const STEP_AVOID = STEP_QUESTIONS + 2; // 9
const STEP_WISH = STEP_QUESTIONS + 3; // 10
const STEP_RESULTS = STEP_QUESTIONS + 4; // 11
const TOTAL_STEPS = STEP_QUESTIONS + 4;

export function QuizScreen() {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  const isDark = (themePref === 'system' ? systemScheme : themePref) === 'dark';
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Quiz'>>();
  const { contacts, upsertContact } = useStore();
  const contact = contacts.find((c) => c.id === route.params.contactId);
  // Mode explicite de réédition (BUG "Refaire le quiz" revient immédiatement sur Profil terminé) :
  // demandé depuis l'écran résultat (ResultsStep) et depuis la fiche pour un quiz déjà complété.
  // `step` démarre déjà à 0 dans tous les cas (voir useState ci-dessous) — le seul risque venait du
  // brouillon auto-enregistré (voir plus bas), qui pouvait contenir un `step` figé sur les résultats
  // d'une session précédente ; en mode edit, on ignore délibérément tout brouillon existant pour
  // repartir de `contact.quiz` uniquement, jamais d'un état résiduel.
  const mode = route.params.mode ?? 'default';

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>(contact?.quiz?.answers ?? []);
  const [interests, setInterests] = useState<InterestTag[]>(contact?.quiz?.interests ?? []);
  const [avoid, setAvoid] = useState<InterestTag[]>(contact?.quiz?.avoid ?? []);
  const [wish, setWish] = useState(contact?.quiz?.wish ?? '');
  const [themeAnswers, setThemeAnswers] = useState<Partial<Record<InterestTag, Record<string, string>>>>(
    contact?.quiz?.themeAnswers ?? {},
  );
  const [activeAffinageTheme, setActiveAffinageTheme] = useState<InterestTag | null>(null);
  // `flash` = réponse actuellement mise en surbrillance (tap en cours OU réponse déjà enregistrée
  // restaurée en arrivant sur la question, voir l'effet plus bas) — purement visuel.
  // `isTransitioning` = anti-double-tap DÉDIÉ, vrai uniquement pendant la fenêtre d'animation d'un
  // tap (ANSWER_FILL_MS). Les deux étaient confondus dans `flash` (BUG MODE EDIT : une réponse déjà
  // affichée en surbrillance était à tort interprétée comme "transition en cours", bloquant tout
  // nouveau tap sur une question déjà répondue).
  const [flash, setFlash] = useState<'A' | 'B' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Brouillon auto-enregistré pour ne pas perdre les réponses si le quiz est fermé avant la fin
  // (ex : swipe pour revenir en arrière) — indépendant de contact.quiz, qui lui n'est écrit qu'à
  // la fin (finish()) pour ne pas déclencher isQuizComplete() prématurément.
  const draftKey = contact ? `quiz-draft-${contact.id}` : null;
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    // Mode edit : ignore délibérément tout brouillon existant — CAUSE RÉELLE du bug "Refaire le
    // quiz revient immédiatement sur Profil terminé" (voir aussi le fix symétrique de l'effet de
    // sauvegarde du brouillon ci-dessous). `step`/`answers` restent ceux du montage initial
    // (0 / contact.quiz.answers), jamais un `step` figé sur les résultats d'une session précédente.
    if (!draftKey || mode === 'edit') {
      setDraftLoaded(true);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const draft = JSON.parse(raw);
          if (typeof draft.step === 'number') setStep(draft.step);
          if (Array.isArray(draft.answers)) setAnswers(draft.answers);
          if (Array.isArray(draft.interests)) setInterests(draft.interests);
          if (Array.isArray(draft.avoid)) setAvoid(draft.avoid);
          if (typeof draft.wish === 'string') setWish(draft.wish);
          if (draft.themeAnswers && typeof draft.themeAnswers === 'object') setThemeAnswers(draft.themeAnswers);
        } catch {
          // brouillon corrompu, ignoré
        }
      })
      .finally(() => {
        if (!cancelled) setDraftLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    const isEmpty =
      step === 0 && answers.length === 0 && interests.length === 0 && avoid.length === 0 && !wish && Object.keys(themeAnswers).length === 0;
    // CAUSE RÉELLE du bug "Refaire le quiz revient immédiatement sur Profil terminé" : `finish()`
    // fait avancer `step` jusqu'à STEP_RESULTS, ce qui redéclenchait CET effet (il dépend de `step`)
    // et persistait un brouillon `{ step: STEP_RESULTS, answers: [...] }` — brouillon que la
    // prochaine ouverture (même en mode normal) rechargeait aussitôt, ramenant tout droit aux
    // résultats. Une fois les résultats atteints, `contact.quiz` fait déjà foi (voir finish()) :
    // plus aucun brouillon de progression n'a de sens, jamais le sauvegarder.
    if (isEmpty || step >= STEP_RESULTS) {
      AsyncStorage.removeItem(draftKey).catch(() => {});
      return;
    }
    AsyncStorage.setItem(draftKey, JSON.stringify({ step, answers, interests, avoid, wish, themeAnswers })).catch(() => {});
  }, [draftKey, draftLoaded, step, answers, interests, avoid, wish, themeAnswers]);

  if (!contact) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.paper }]}>
        <Text style={{ color: theme.inkSoft }}>Contact introuvable.</Text>
      </SafeAreaView>
    );
  }

  function goNext() {
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }
  function goBack() {
    if (step === 0) navigation.goBack();
    else setStep((s) => s - 1);
  }

  function answerQuestion(choice: QuizAnswer) {
    // BUG MODE EDIT : `flash` sert AUSSI à afficher la réponse déjà enregistrée en arrivant sur une
    // question (voir l'effet juste en dessous) — il est donc déjà non-null pour toute question
    // déjà répondue, pas seulement pendant une transition. Le garder ici bloquait alors
    // silencieusement tout nouveau tap sur une question déjà répondue (mode edit). `isTransitioning`
    // est un état dédié, uniquement vrai pendant la fenêtre d'animation (ANSWER_FILL_MS) d'un tap
    // en cours — jamais vrai simplement parce qu'une réponse existante est affichée.
    if (isTransitioning) return; // déjà en cours de transition, ignore un second tap
    setIsTransitioning(true);
    setFlash(choice);
    const answeredStep = step;
    // Remplace UNIQUEMENT la réponse de cette question précise, sans jamais tronquer celles qui
    // suivent — nécessaire pour rouvrir/modifier un quiz déjà complété (CHANTIER QUIZ MODIFIABLE) :
    // avec un `answers` déjà entièrement rempli, un `slice(0, step)` effacerait silencieusement
    // toutes les réponses après la question modifiée. Le remplissage séquentiel initial (quiz
    // jamais fait) reste identique : `next[step]` complète simplement le tableau au bon index.
    // Laisse le temps à ChoiceCard de finir son animation de remplissage (voir ANSWER_FILL_MS)
    // avant de basculer sur la question suivante.
    setTimeout(() => {
      setIsTransitioning(false);
      setAnswers((prev) => {
        const next = [...prev];
        next[answeredStep] = choice;
        return next;
      });
      goNext();
    }, ANSWER_FILL_MS);
  }

  // Restaure la réponse déjà enregistrée pour la question affichée (surbrillance) quand on y
  // revient — que ce soit en reculant pendant la même session, ou en rouvrant un quiz déjà
  // complété où `answers` est prérempli d'entrée (CHANTIER QUIZ MODIFIABLE). Sans ça, revenir sur
  // une question déjà répondue ne montrait aucun choix sélectionné, laissant croire qu'il fallait
  // répondre à nouveau. N'affecte pas l'animation de sélection elle-même (voir answerQuestion),
  // qui pose `flash` avant que `step` ne change.
  useEffect(() => {
    if (step < STEP_QUESTIONS) {
      setFlash((answers[step] as 'A' | 'B' | undefined) ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function toggleTag(list: InterestTag[], setList: (v: InterestTag[]) => void, tag: InterestTag) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  const finish = () => {
    // Filet de sécurité en plus des tags "à éviter" : si {prenom} n'aime explicitement pas un
    // thème d'après le texte libre du souhait ("il n'aime pas la cuisine"), on l'ajoute aussi aux
    // exclusions — le sélecteur de tags reste la source la plus fiable, ceci couvre ce qui a été
    // écrit à la main plutôt que coché.
    const inferredAvoid = inferAvoidFromText(wish);
    const mergedAvoid = Array.from(new Set([...avoid, ...inferredAvoid]));
    upsertContact({
      ...contact,
      quiz: {
        answers,
        interests,
        avoid: mergedAvoid,
        wish: wish.trim(),
        themeAnswers,
        completedAt: new Date().toISOString(),
        // Le budget appartient désormais à la recherche de recommandations (voir GiftsScreen), plus
        // au profil — on conserve juste l'ancien "budget habituel" s'il existe déjà, sans le redemander.
        budget: contact.quiz?.budget ?? null,
        feedback: contact.quiz?.feedback ?? [],
        recommendationHistory: contact.quiz?.recommendationHistory ?? [],
      },
    });
    if (draftKey) AsyncStorage.removeItem(draftKey).catch(() => {});
    goNext();
  };

  const progress = Math.min(step, TOTAL_STEPS) / TOTAL_STEPS;

  // Glisser le doigt sur la barre de progression change directement de question — utile pour
  // revenir vite en arrière (ou avancer) sans réappuyer plusieurs fois sur la flèche retour.
  const [trackWidth, setTrackWidth] = useState(0);
  const lastScrubStep = useSharedValue(-1);
  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          'worklet';
          if (trackWidth === 0) return;
          // e.x est relatif au conteneur (plus grand que la barre visuelle) — TRACK_PADDING_H
          // compense son padding horizontal pour retrouver la position sur la barre elle-même.
          const ratio = Math.max(0, Math.min(1, (e.x - TRACK_PADDING_H) / trackWidth));
          const target = Math.min(TOTAL_STEPS - 1, Math.round(ratio * TOTAL_STEPS));
          if (target !== lastScrubStep.value) {
            lastScrubStep.value = target;
            runOnJS(setStep)(target);
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (trackWidth === 0) return;
          const ratio = Math.max(0, Math.min(1, (e.x - TRACK_PADDING_H) / trackWidth));
          const target = Math.min(TOTAL_STEPS - 1, Math.round(ratio * TOTAL_STEPS));
          if (target !== lastScrubStep.value) {
            lastScrubStep.value = target;
            runOnJS(setStep)(target);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackWidth],
  );

  return (
    <View style={styles.flexFull}>
      <QuizAura theme={theme} isDark={isDark} />
      <SafeAreaView style={styles.flexFull}>
        {activeAffinageTheme ? (
          <KeyboardAvoidingView
            style={styles.flexFull}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          >
            <ThemeAffinageQuiz
              quizConfig={getThemeQuiz(activeAffinageTheme)}
              contact={contact}
              theme={theme}
              answers={themeAnswers[activeAffinageTheme] ?? {}}
              onAnswer={(questionId, value) =>
                setThemeAnswers((prev) => ({
                  ...prev,
                  [activeAffinageTheme]: { ...(prev[activeAffinageTheme] ?? {}), [questionId]: value },
                }))
              }
              // CHANTIER "P0 Quiz Phase 1" (2026-09-22) — "Passer cette question" retire RÉELLEMENT
              // la clé plutôt que d'y laisser une ancienne valeur (voir audit "réponse historique
              // conservée silencieusement") : "absence de réponse = absence de clé", jamais
              // `questionId: ''`. Si la question n'avait aucune réponse existante, ce retrait est un
              // no-op strict (destructuration + suppression d'une clé déjà absente).
              onSkip={(questionId) =>
                setThemeAnswers((prev) => {
                  const currentTheme = { ...(prev[activeAffinageTheme] ?? {}) };
                  delete currentTheme[questionId];
                  return { ...prev, [activeAffinageTheme]: currentTheme };
                })
              }
              onFinish={() => setActiveAffinageTheme(null)}
              onExit={() => setActiveAffinageTheme(null)}
            />
          </KeyboardAvoidingView>
        ) : step < STEP_RESULTS ? (
          <KeyboardAvoidingView
            style={styles.flexFull}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          >
            <View style={styles.header}>
              <Pressable onPress={goBack} hitSlop={10} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <Ionicons name="chevron-back" size={18} color={theme.ink} />
              </Pressable>
              <Text style={[styles.headerLabel, { color: theme.inkSoft }]}>
                LE PETIT QUIZ · {step + 1}/{TOTAL_STEPS}
              </Text>
              <View style={{ width: 34 }} />
            </View>
            <GestureDetector gesture={scrubGesture}>
              {/* Zone tactile plus haute que la barre visuelle elle-même (4px, trop fin pour un
                  doigt) — le geste est sur ce conteneur plus grand, mais mesure la largeur de la
                  barre elle-même (onLayout ci-dessous) pour convertir la position du doigt en
                  numéro de question. */}
              <View style={styles.progressTrackWrap}>
                <View
                  style={[styles.progressTrack, { backgroundColor: theme.paperDim }]}
                  onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                >
                  <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${progress * 100}%` }]} />
                </View>
              </View>
            </GestureDetector>

            {/* Tap en dehors du champ de texte = ferme le clavier, comme sur la plupart des apps
                (pas de bouton dédié sur le clavier iOS pour ça sinon). */}
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <StepFade step={step} style={styles.body}>
              {step < STEP_QUESTIONS && (
                <QuestionStep question={QUIZ_QUESTIONS[step]} contact={contact} theme={theme} flash={flash} onAnswer={answerQuestion} onSkip={goNext} />
              )}
              {step === STEP_INTERESTS && (
                <TagStep
                  title={formatQuizText('Qu’est-ce qui intéresse le plus {prenom} ?', contact)}
                  subtitle="Choisis-en autant que tu veux."
                  theme={theme}
                  selected={interests}
                  onToggle={(t) => toggleTag(interests, setInterests, t)}
                  onContinue={goNext}
                />
              )}
              {step === STEP_AFFINAGE && (
                <AffinageOverview
                  interests={interests}
                  themeAnswers={themeAnswers}
                  contact={contact}
                  theme={theme}
                  onOpenTheme={setActiveAffinageTheme}
                  onContinue={goNext}
                />
              )}
              {step === STEP_AVOID && (
                <TagStep
                  title={formatQuizText('Et ce qu’{il} apprécie moins ?', contact)}
                  subtitle="Facultatif — pour éviter les impairs."
                  theme={theme}
                  selected={avoid}
                  onToggle={(t) => toggleTag(avoid, setAvoid, t)}
                  onContinue={goNext}
                />
              )}
              {step === STEP_WISH && (
                <View style={styles.centeredBlock}>
                  <Text style={[styles.prompt, { color: theme.ink }]}>
                    {formatQuizText('Une chose que {prenom} aimerait avoir en ce moment ?', contact)}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Facultatif.</Text>
                  <TextInput
                    value={wish}
                    onChangeText={setWish}
                    multiline
                    style={[styles.wishInput, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
                  />
                  <View style={{ marginTop: 20, width: '100%' }}>
                    <PrimaryButton label="Voir le profil" onPress={finish} />
                  </View>
                </View>
              )}
              </StepFade>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <ResultsStep contact={contact} answers={answers} interests={interests} theme={theme} navigation={navigation} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Fond animé "qui respire" pendant le quiz : dégradé calme + deux halos flous en violet/corail qui
 * pulsent lentement, pour un rendu apaisant plutôt qu'un simple fond uni. */
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function QuizAura({ theme, isDark }: { theme: any; isDark: boolean }) {
  // Chaque halo respire (échelle/opacité) ET dérive lentement dans l'espace (translation), pour un
  // vrai mouvement organique plutôt qu'un simple pulse sur place.
  const pulseA = useSharedValue(0);
  const pulseB = useSharedValue(0);
  const driftA = useSharedValue(0);
  const driftB = useSharedValue(0);
  useEffect(() => {
    pulseA.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
    pulseB.value = withDelay(600, withRepeat(withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }), -1, true));
    driftA.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
    driftB.value = withDelay(
      1200,
      withRepeat(withTiming(1, { duration: 11000, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orbAStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftA.value, [0, 1], [-40, 50]) },
      { translateY: interpolate(driftA.value, [0, 1], [-20, 60]) },
      { scale: 1 + pulseA.value * 0.3 },
    ],
    opacity: 0.4 + pulseA.value * 0.3,
  }));
  const orbBStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(driftB.value, [0, 1], [40, -50]) },
      { translateY: interpolate(driftB.value, [0, 1], [30, -50]) },
      { scale: 1.15 - pulseB.value * 0.25 },
    ],
    opacity: 0.32 + pulseB.value * 0.26,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[theme.paper, theme.paperDim]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.orb, styles.orbA, { backgroundColor: theme.accent }, orbAStyle]} />
      <Animated.View style={[styles.orb, styles.orbB, { backgroundColor: theme.plum }, orbBStyle]} />
      <BlurView intensity={85} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      {/* Un flou aussi fort que celui des halos "efface" carrément des points aussi petits —
          elles restent donc au-dessus, mais adoucies directement via une lueur (shadow), pas de
          BlurView dessus. */}
      <Particles theme={theme} />
    </View>
  );
}

const PARTICLE_COUNT = 16;

function Particles({ theme }: { theme: any }) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        x: Math.random() * SCREEN_W,
        size: 3 + Math.random() * 5,
        delay: Math.random() * 8000,
        duration: 18000 + Math.random() * 14000,
        drift: 12 + Math.random() * 20,
        color: i % 3 === 0 ? theme.plum : theme.accent,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <>
      {particles.map((p) => (
        <Particle key={p.id} {...p} />
      ))}
    </>
  );
}

function Particle({
  x,
  size,
  delay,
  duration,
  drift,
  color,
}: {
  x: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  color: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [SCREEN_H + 20, -20]) },
      { translateX: Math.sin(t.value * Math.PI * 2) * drift },
    ],
    opacity: interpolate(t.value, [0, 0.15, 0.85, 1], [0, 0.55, 0.55, 0]),
  }));
  // Pas de BlurView ici (un flou assez fort pour les halos effacerait un point de quelques
  // pixels) — la lueur douce vient d'une ombre large et diffuse autour d'un cœur minuscule.
  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: size * 3,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

/** Fondu + léger glissement vers le haut à chaque changement d'étape du quiz. */
function StepFade({ step, style, children }: { step: number; style?: any; children: React.ReactNode }) {
  const entry = useSharedValue(0);
  useEffect(() => {
    entry.value = 0;
    entry.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [step, entry]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [{ translateY: (1 - entry.value) * 14 }],
  }));
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

function QuestionStep({
  question,
  contact,
  theme,
  flash,
  onAnswer,
  onSkip,
}: {
  question: (typeof QUIZ_QUESTIONS)[number];
  contact: Pick<Contact, 'prenom' | 'genre'>;
  theme: any;
  flash: 'A' | 'B' | null;
  onAnswer: (choice: QuizAnswer) => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.centeredBlock}>
      <Text style={[styles.prompt, { color: theme.ink }]}>{formatQuizText(question.prompt, contact)}</Text>
      <View style={{ gap: 14, marginTop: 24, width: '100%' }}>
        <ChoiceCard label={formatQuizText(question.a.label, contact)} theme={theme} active={flash === 'A'} onPress={() => onAnswer('A')} />
        <Text style={[styles.or, { color: theme.inkSoft }]}>OU</Text>
        <ChoiceCard label={formatQuizText(question.b.label, contact)} theme={theme} active={flash === 'B'} onPress={() => onAnswer('B')} />
      </View>
      <Pressable onPress={onSkip} style={{ marginTop: 24, alignItems: 'center' }}>
        <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Passer cette question</Text>
      </Pressable>
    </View>
  );
}

function TagStep({
  title,
  subtitle,
  theme,
  selected,
  onToggle,
  onContinue,
}: {
  title: string;
  subtitle: string;
  theme: any;
  selected: InterestTag[];
  onToggle: (tag: InterestTag) => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.centeredBlock}>
      <Text style={[styles.prompt, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: theme.inkSoft }]}>{subtitle}</Text>
      <View style={[styles.tagGrid, { justifyContent: 'center' }]}>
        {/* CHANTIER "Phase 5G" (2026-09-21) : sélecteur limité aux thèmes réellement couverts par
            le catalogue (voir VISIBLE_INTEREST_OPTIONS, quiz.ts) — un thème sans produit
            (jeux_societe/beaute/science tant qu'ils ne sont pas sourcés) reste préparé côté
            config mais n'apparaît pas ici. */}
        {VISIBLE_INTEREST_OPTIONS.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <Pressable
              key={opt.key}
              onPress={() => onToggle(opt.key)}
              style={[
                styles.tagChip,
                { borderColor: active ? theme.accent : theme.line, backgroundColor: active ? theme.accentTint : theme.card },
              ]}
            >
              <Text style={{ fontSize: 13 }}>{opt.emoji}</Text>
              <Text style={{ color: active ? theme.accent : theme.ink, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 20, width: '100%' }}>
        <PrimaryButton label="Continuer" onPress={onContinue} />
      </View>
    </View>
  );
}

/** Récapitulatif après le choix des centres d'intérêt : propose d'affiner chaque thème
 *  individuellement (facultatif, ~30s chacun) plutôt que d'imposer un long parcours — voir le
 *  principe "rester rapide" du plan de refonte. */
function AffinageOverview({
  interests,
  themeAnswers,
  contact,
  theme,
  onOpenTheme,
  onContinue,
}: {
  interests: InterestTag[];
  themeAnswers: Partial<Record<InterestTag, Record<string, string>>>;
  contact: Contact;
  theme: any;
  onOpenTheme: (t: InterestTag) => void;
  onContinue: () => void;
}) {
  if (interests.length === 0) {
    return (
      <View style={styles.centeredBlock}>
        <Text style={[styles.prompt, { color: theme.ink }]}>Pas de centre d’intérêt sélectionné pour l’instant.</Text>
        <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Tu pourras préciser ça plus tard depuis sa fiche.</Text>
        <View style={{ marginTop: 20, width: '100%' }}>
          <PrimaryButton label="Continuer" onPress={onContinue} />
        </View>
      </View>
    );
  }
  // flex:1 (pas centeredBlock) + ScrollView pour la liste : avec beaucoup de centres d'intérêt
  // choisis, la liste dépasse facilement la hauteur de l'écran — elle doit défiler plutôt que
  // rester figée hors champ. Le titre et le bouton "Continuer", eux, restent fixes en haut/bas.
  return (
    <View style={{ flex: 1, width: '100%' }}>
      <Text style={[styles.prompt, { color: theme.ink }]}>
        {formatQuizText('On peut préciser ce que {prenom} aime précisément', contact)}
      </Text>
      <Text style={[styles.subtitle, { color: theme.inkSoft }]}>
        ~30 secondes par thème, entièrement facultatif — ça rend les idées cadeaux bien plus justes.
      </Text>
      <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        {interests.map((t) => {
          const opt = INTEREST_OPTIONS.find((o) => o.key === t);
          const done = Object.keys(themeAnswers[t] ?? {}).length > 0;
          return (
            <Pressable
              key={t}
              onPress={() => onOpenTheme(t)}
              style={[styles.budgetRow, { borderColor: done ? theme.sage : theme.line, backgroundColor: theme.card }]}
            >
              <Text style={{ color: theme.ink, fontWeight: '600' }}>
                {opt?.emoji} {opt?.label}
              </Text>
              {done ? (
                <Ionicons name="checkmark-circle" size={20} color={theme.sage} />
              ) : (
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Affiner</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ marginTop: 12, width: '100%' }}>
        <PrimaryButton label="Continuer" onPress={onContinue} />
      </View>
    </View>
  );
}

function ResultsStep({
  contact,
  answers,
  interests,
  theme,
  navigation,
}: {
  contact: Contact;
  answers: QuizAnswer[];
  interests: InterestTag[];
  theme: any;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const traits = computeTraits(answers);
  const archetype = archetypeFor(traits, contact);
  const ranked = sortedTraits(traits).slice(0, 4);

  return (
    <View style={styles.resultsWrap}>
      <Ionicons name="heart" size={32} color={theme.plum} style={{ marginBottom: 10 }} />
      <Text style={[styles.resultsTitle, { color: theme.ink }]}>Profil terminé</Text>
      <Text style={[styles.resultsSub, { color: theme.inkSoft }]}>Pensif connaît maintenant un peu mieux {contact.prenom}.</Text>

      <Text style={[styles.archetype, { color: theme.accent }]}>{archetype.title.toUpperCase()}</Text>
      <Text style={[styles.archetypeDesc, { color: theme.inkSoft }]}>{archetype.description}</Text>

      <View style={{ width: '100%', marginTop: 24, gap: 12 }}>
        {ranked.map(({ key, value }) => (
          <View key={key}>
            <View style={styles.traitLabelRow}>
              <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>{TRAIT_LABELS[key]}</Text>
              <Text style={{ color: theme.inkSoft, fontSize: 12 }}>{Math.round(value * 100)}%</Text>
            </View>
            <View style={[styles.traitTrack, { backgroundColor: theme.paperDim }]}>
              <View style={[styles.traitFill, { backgroundColor: theme.accent, width: `${Math.round(value * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>

      {interests.length > 0 && (
        <View style={{ width: '100%', marginTop: 24 }}>
          <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>SES UNIVERS</Text>
          <View style={styles.tagGrid}>
            {interests.map((tag) => {
              const opt = INTEREST_OPTIONS.find((o) => o.key === tag)!;
              return (
                <View key={tag} style={[styles.tagChip, { borderColor: theme.line, backgroundColor: theme.card }]}>
                  <Text style={{ fontSize: 13 }}>{opt.emoji}</Text>
                  <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>{opt.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ width: '100%', marginTop: 28 }}>
        <PrimaryButton
          label="Voir ses idées cadeaux"
          onPress={() => navigation.navigate('Cadeaux', { contactId: contact.id })}
        />
        {/* push + mode: 'edit' (BUG "Refaire le quiz revient immédiatement sur Profil terminé") :
            push seul ne suffisait pas — un brouillon auto-enregistré pouvait persister un `step`
            figé sur les résultats (voir l'effet de sauvegarde du brouillon plus haut, désormais
            corrigé aussi), rechargé aussitôt par la nouvelle instance. `mode: 'edit'` fait en plus
            ignorer explicitement tout brouillon résiduel : question 1, réponses de contact.quiz
            préremplies, jamais l'instance résultat actuelle réutilisée. */}
        <Pressable
          onPress={() => navigation.push('Quiz', { contactId: contact.id, mode: 'edit' })}
          style={[styles.secondaryBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14 }}>Refaire le quiz</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 12, alignItems: 'center' }}>
          <Text style={{ color: theme.inkSoft }}>Retour à la fiche</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 20 },
  flexFull: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6 },
  backBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  progressTrackWrap: { paddingHorizontal: 20, paddingVertical: 12, marginTop: 6 },
  progressTrack: { height: 4, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 999 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  centeredBlock: { alignItems: 'center' },
  prompt: { fontSize: 21, fontWeight: '700', lineHeight: 28, textAlign: 'center' },
  subtitle: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  or: { textAlign: 'center', fontSize: 12, fontWeight: '700' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  wishInput: { borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 90, textAlignVertical: 'top', fontSize: 14, marginTop: 20, width: '100%' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 14, padding: 16 },
  resultsWrap: { alignItems: 'center', paddingTop: 30 },
  secondaryBtn: { marginTop: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', width: '100%' },
  resultsTitle: { fontSize: 20, fontWeight: '700' },
  resultsSub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  archetype: { fontSize: 15, fontWeight: '800', letterSpacing: 0.6, marginTop: 24 },
  archetypeDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
  traitLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  traitTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  traitFill: { height: 8, borderRadius: 999 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 4 },
  orb: { position: 'absolute', width: 420, height: 420, borderRadius: 210 },
  orbA: { top: -140, left: -100 },
  orbB: { bottom: -160, right: -120 },
  particle: { position: 'absolute', top: 0 },
});
