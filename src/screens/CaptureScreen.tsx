import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { canScheduleExactAlarms, openExactAlarmSettings } from 'expo-exact-alarm';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { Pill } from '../components/Pill';
import { ContactAssociationField } from '../components/ContactAssociationField';
import { ContactPicker } from '../components/ContactPicker';
import { RecurrenceEditorMode, RecurrenceEditorSheet } from '../components/RecurrenceEditorSheet';
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { RootStackParamList } from '../navigation/types';
import { uploadAudioForCapture, CaptureApiError } from '../lib/captureApi';
import { matchContactByHeardName } from '../data/contactMatching';
import { toLocalDateTimeParts } from '../data/reminderDate';
import { isPressTooShort } from '../data/pushToTalk';
import { isCaptureExploitable } from '../data/captureExploitability';
import { VoiceActivityAccumulator, STRONG_PEAK_THRESHOLD_DB } from '../data/voiceActivity';
import {
  CaptureCard,
  LocalDate,
  OpenPicker,
  RecurrenceDraftFrequency,
  applyEventChange,
  applyEventDateChange,
  applyEventTimeChange,
  applyReminderDateTimeChange,
  buildInitialCards,
  buildPenseeFromCard,
  canSaveAll,
  clearEventTime,
  confirmContactForCard,
  finalizeCardTextForSave,
  discardCard,
  isCardValid,
  markFailed,
  markSaved,
  markSaving,
  needsReview,
  recurrenceEndLabel,
  recurrenceFrequencyLabel,
  recurrenceStartDateLabel,
  recurrenceTimeLabel,
  setRecurrenceFrequency,
  setRecurrenceOccurrenceCount,
  setRecurrenceUntilDate,
  toggleEventPicker,
  toggleRecurrence,
  toggleRecurrenceDay,
  toggleReminderDateTimePicker,
} from '../data/captureReview';

type Phase = 'idle' | 'listening' | 'processing' | 'review' | 'error' | 'unclear' | 'silence';

// CHANTIER POLISH PICKER ÉVÉNEMENT (2026-09-18) — locale explicite pour les pickers iOS inline de cet
// écran (`@react-native-community/datetimepicker` 9.1.0, prop `locale` IOSNativeProps UNIQUEMENT,
// ignorée sur Android — voir index.d.ts du package : `RCT_EXPORT_VIEW_PROPERTY(locale, NSLocale)`
// côté natif, qui accepte un identifiant BCP-47 standard comme "fr-FR"). Ne change AUCUNE logique de
// résolution de date/heure — uniquement la LANGUE d'affichage native du picker (ex. "dim. 7 mars" au
// lieu de "Sun 7 Mar"). Jamais un picker custom : on continue d'utiliser exactement le rendu
// typographique d'iOS, seulement dans la langue attendue.
const IOS_PICKER_LOCALE = 'fr-FR';

// Bouton principal ~3-4x plus grand que l'ancien micro (84px) — voir mockup validé.
const BUTTON_SIZE = 280;

// "Concentric listening ripples" (principe d'interaction générique — bouton stable + ondes
// concentriques successives pendant l'écoute — jamais un asset/design propriétaire copié) : 4
// ondes indépendantes, décalées dans le temps, chacune naît au contour du bouton et grandit vers
// l'extérieur en se dissipant. Cycle purement TEMPOREL — voir §IMPORTANT AUDIO : ne dépend plus du
// metering, continue même sur du silence pour signaler "le micro écoute".
const RIPPLE_COUNT = 4;
const RIPPLE_STAGGER_MS = 300;
const RIPPLE_DURATION_MS = 1400;
// Relatif au diamètre du bouton (scale 1 = contour du bouton). Les valeurs 1.8-2.3x suggérées
// resteraient très larges à ce BUTTON_SIZE (280px, déjà 3-4x un bouton micro classique) — mais
// l'opacité retombe à 0 bien avant d'atteindre ce rayon maximal (voir RIPPLE_OPACITY_START), donc
// le débordement visuel réel au bord de l'écran est négligeable (quasi invisible à ce stade).
const RIPPLE_MAX_SCALE = 2.0;
const RIPPLE_OPACITY_START = 0.5; // "relativement visible" à la naissance, près du bouton
const RIPPLE_MASTER_FADE_MS = 200; // disparition propre au relâchement (dans la fourchette 150-250ms)

// Dégradé du bouton inspiré du mockup validé : survol lavande clair en haut à gauche → violet →
// bleu-violet profond en bas à droite, plus riche qu'un dégradé à deux teintes plates. Le premier
// ton est une teinte fixe (pas issue de la palette theme — purement décorative, propre à ce bouton),
// le milieu/la fin restent `theme.accent`/`theme.accentStrong` pour rester cohérents clair/sombre.
const BUTTON_GRADIENT_HIGHLIGHT = '#C9A9FF';

// Dimensions RÉELLES de assets/logo-mark.png (554x648) et bbox EXACTE de la découpe transparente
// du cœur à l'intérieur du "P" — mesurées par flood-fill du canal alpha (pngjs), pas estimées à
// l'œil : le trou intérieur (donc entouré de blanc opaque, jamais le fond transparent extérieur)
// va de x:144→422, y:133→354 dans l'image source. C'est cette précision qui permet au rouge de
// n'apparaître QUE dans le cœur, sans avoir besoin d'un second asset "cœur" à aligner à la main —
// voir LogoWithHeart plus bas.
const LOGO_NATIVE_WIDTH = 554;
const LOGO_NATIVE_HEIGHT = 648;
const HEART_HOLE_NATIVE = { left: 144, top: 133, right: 422, bottom: 354 };

const LOGO_WIDTH = BUTTON_SIZE * 0.4;
const LOGO_SCALE = LOGO_WIDTH / LOGO_NATIVE_WIDTH;
const LOGO_HEIGHT = LOGO_NATIVE_HEIGHT * LOGO_SCALE;
const HEART_HOLE = {
  left: HEART_HOLE_NATIVE.left * LOGO_SCALE,
  top: HEART_HOLE_NATIVE.top * LOGO_SCALE,
  width: (HEART_HOLE_NATIVE.right - HEART_HOLE_NATIVE.left) * LOGO_SCALE,
  height: (HEART_HOLE_NATIVE.bottom - HEART_HOLE_NATIVE.top) * LOGO_SCALE,
};

// Durée à partir de laquelle le cœur est considéré "plein" — plafonné puis reste plein tant que
// l'utilisateur parle (jamais de boucle, jamais de reset), plutôt qu'une durée maximale
// d'enregistrement imposée par le code.
const HEART_FILL_CAP_MS = 8000;

// Normalisation du metering RÉEL (dBFS, expo-audio isMeteringEnabled) en 0..1, + noise gate +
// lissage exponentiel — voir l'effet dédié dans le composant, qui applique EXACTEMENT :
//   target = rawNormalized < NOISE_GATE_NORMALIZED ? 0 : rawNormalized
//   displayLevel = displayLevel*(1-SMOOTHING_ALPHA) + target*SMOOTHING_ALPHA
const METERING_FLOOR_DB = -50; // → niveau visuel 0
const METERING_CEIL_DB = -8; // → niveau visuel 1 (voix forte)
const NOISE_GATE_DB = -45; // en dessous : silence, niveau forcé à 0 (pas de tremblement résiduel)
const SMOOTHING_ALPHA = 0.3;

function normalizeMetering(db: number | undefined): number {
  if (db === undefined) return 0;
  const clamped = Math.max(METERING_FLOOR_DB, Math.min(METERING_CEIL_DB, db));
  return (clamped - METERING_FLOOR_DB) / (METERING_CEIL_DB - METERING_FLOOR_DB);
}
const NOISE_GATE_NORMALIZED = normalizeMetering(NOISE_GATE_DB);

// Intervalle de poll du metering — partagé entre `useAudioRecorderState` et l'accumulateur de voix
// (voir VoiceActivityAccumulator) pour que le temps cumulé ajouté par échantillon reflète le vrai
// intervalle entre deux mesures, pas une valeur arbitraire indépendante.
const METERING_POLL_MS = 100;


function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateFR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function localDateToJsDate(date: LocalDate): Date {
  return new Date(date.year, date.month, date.day);
}

/** CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18) : pilote UNIQUEMENT la couleur de la ligne
 *  "Répétition" (accent = interactif, jamais un warning) — la validité réelle reste needsReview/
 *  isCardValid (captureReview.ts), jamais recalculée ici. */
function needsRecurrenceFrequency(card: CaptureCard): boolean {
  return card.recurrenceDraft.frequency === null || (card.recurrenceDraft.frequency === 'weekly' && card.recurrenceDraft.daysOfWeek.length === 0);
}

/** Même principe que `reminderPickerSeed` ci-dessous, pour la roulette de date d'événement iOS
 *  (2026-09-18) : valeur purement visuelle, jamais écrite tant que l'utilisateur n'interagit pas. */
function eventDatePickerSeed(card: CaptureCard): Date {
  if (!card.eventHint?.date) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(card.eventHint.date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

/** CHANTIER CAPTURE — EVENT TIME, incrément 4 (2026-09-18) : même principe que `eventDatePickerSeed`
 *  ci-dessus pour la roulette d'HEURE d'événement — valeur purement visuelle. Défaut 12:00 (jamais
 *  9h, pour ne jamais laisser croire à un lien avec le défaut du rappel `reminderPickerSeed`, deux
 *  notions strictement indépendantes) quand aucune heure n'est encore connue. La base (jour) reprend
 *  `eventDatePickerSeed` — cette fonction n'est appelée que si `card.eventHint?.date` existe déjà
 *  (voir JSX : le bloc ÉVÉNEMENT entier est conditionné à cette date). */
function eventTimePickerSeed(card: CaptureCard): Date {
  const base = eventDatePickerSeed(card);
  const hour = card.eventHint?.time ? Number(card.eventHint.time.slice(0, 2)) : 12;
  const minute = card.eventHint?.time ? Number(card.eventHint.time.slice(3, 5)) : 0;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}

/** Valeur purement visuelle pour positionner la roulette d'un picker natif quand rien n'est encore
 *  choisi — n'est JAMAIS écrite dans une carte tant que l'utilisateur n'interagit pas réellement
 *  avec le picker (voir onChange des pickers plus bas) : aucune heure/date n'est donc "inventée"
 *  par le code, seulement par un choix explicite de l'utilisateur via le composant natif. */
function reminderPickerSeed(card: CaptureCard): Date {
  const base = card.reminderDate ? localDateToJsDate(card.reminderDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  })();
  const hour = card.reminderTime?.hour ?? 9;
  const minute = card.reminderTime?.minute ?? 0;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}

/**
 * CHANTIER CAPTURE INTELLIGENTE V1 — écran réel (remplace CaptureDebugScreen comme point d'entrée) :
 * Micro → Écoute → Analyse → Validation des pensées → addPensee(). Toujours le chemin normal de
 * sauvegarde (local + outbox), jamais d'écriture Supabase directe ni de logique de matching/LLM
 * dupliquée ici — cet écran ne fait qu'orchestrer captureReview.ts/contactMatching.ts déjà testés.
 */
export function CaptureScreen() {
  const theme = useTheme();
  // `Screen` n'insère la zone de sécurité qu'en haut (`edges:['top']`) — sans ça, le bas de cet
  // écran touche le bord physique (barre d'accueil comprise), collant le texte de confidentialité
  // trop près du bord (voir retour utilisateur).
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contacts, addPensee } = useStore();

  // `isMeteringEnabled: true` — sans ce réglage explicite, `RecorderState.metering` reste toujours
  // `undefined` (voir expo-audio/utils/options.ts, défaut false). Avec, expo-audio expose un niveau
  // RÉEL (AVAudioRecorder.averagePower sur iOS, MediaRecorder.getMaxAmplitude→dBFS sur Android) — ni
  // simulé ni approximé côté JS, voir normalizeMetering ci-dessus pour la mise à l'échelle 0..1.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);

  const [phase, setPhase] = useState<Phase>('idle');
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [cards, setCards] = useState<CaptureCard[]>([]);
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  // CHANTIER UX — ContactPicker commun (2026-09-16). Un seul picker partagé pour toutes les cartes
  // de Review (jamais un par carte) — `contactPickerCardId` retient à quelle carte l'appliquer.
  // Modification UI UNIQUEMENT : ne touche ni contactMatch/contactId (contactMatching.ts inchangé),
  // ni la sauvegarde, ni l'outbox, ni STT/LLM.
  const [contactPickerCardId, setContactPickerCardId] = useState<string | null>(null);
  // CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18) : UN SEUL éditeur partagé (même principe que
  // contactPickerCardId/openPicker) — jamais un state par carte.
  const [recurrenceEditor, setRecurrenceEditor] = useState<{ cardId: string; mode: RecurrenceEditorMode } | null>(null);
  // CHANTIER ROBUSTESSE PRÉ-BÊTA — doublons (2026-09-16) : mêmes garde-fous anti-double-tap que
  // PenseeDetailScreen/FicheScreen (`savingRef`), jamais appliqués ici. `saveOne`/`handleSaveAll`
  // sont entièrement synchrones (aucun `await` avant `addPensee`) — un double-tap physique peut
  // livrer 2 événements `onPress` avant que React n'ait re-rendu pour désactiver/masquer le bouton,
  // les deux lisant alors la MÊME fermeture `cards` (status encore "pending" dans les deux cas) →
  // `addPensee` appelé deux fois → 2 pensées dupliquées pour une seule intention utilisateur. Une
  // simple `ref` (mutation synchrone, visible immédiatement, contrairement à un `useState`) ferme
  // cette fenêtre. `savingCardIdsRef` par carte (plusieurs cartes peuvent légitimement être en cours
  // de sauvegarde indépendamment) ; retiré du Set UNIQUEMENT en cas d'échec réel (pour permettre un
  // nouveau tap de retry) — jamais après un succès, où le bouton disparaît de toute façon
  // (`card.status !== 'saved'`).
  const savingCardIdsRef = useRef<Set<string>>(new Set());
  const savingAllRef = useRef(false);

  // Respiration douce du bouton — active pendant le traitement (animation "douce de processing"
  // demandée). Complètement DISTINCTE de `pressScale` ci-dessous (feedback immédiat du geste) : ce
  // sont deux animations séparées, jamais combinées sur la même transition d'état.
  const pulse = useRef(new Animated.Value(1)).current;
  // Feedback tactile immédiat du press-and-hold — scale idle 1.0 → ~0.96 → ~1.01 → retour 1.0,
  // ~150-200ms au total. Piloté DIRECTEMENT par onPanResponderGrant/Release/Terminate (voir
  // animateButtonPressIn/Out plus bas) — jamais une boucle autonome, se déclenche uniquement sur le
  // geste utilisateur, avant même que l'audio soit démarré.
  const pressScale = useRef(new Animated.Value(1)).current;
  // Niveau audio normalisé (0..1), piloté par le vrai metering expo-audio — voir l'effet dédié plus
  // bas. NE PILOTE PLUS les grandes ondes (désormais purement temporelles, voir `ripples`
  // ci-dessous) : sert uniquement à une variation TRÈS SUBTILE du halo proche du bouton (§IMPORTANT
  // AUDIO — si une réaction au son est conservée, elle doit être séparée et minime).
  const level = useRef(new Animated.Value(0)).current;
  // "Concentric listening ripples" — RIPPLE_COUNT progressions indépendantes (0..1 chacune),
  // rejouées en boucle avec un décalage de départ (voir startRipples/stopRipples). Purement
  // décoratif, jamais lu par la logique métier. `ripplesMasterOpacity` permet une disparition
  // rapide et propre de TOUTES les ondes en cours au relâchement, sans dépendre de l'état
  // individuel (souvent différent) de chacune.
  const ripples = useRef(Array.from({ length: RIPPLE_COUNT }, () => new Animated.Value(0))).current;
  const ripplesMasterOpacity = useRef(new Animated.Value(0)).current;
  const ripplesActiveRef = useRef(false);
  const rippleAnimRef = useRef<(Animated.CompositeAnimation | null)[]>(Array(RIPPLE_COUNT).fill(null));
  const rippleTimerRef = useRef<(ReturnType<typeof setTimeout> | null)[]>(Array(RIPPLE_COUNT).fill(null));
  // Progression du remplissage du cœur (0..1), pilotée par la durée d'enregistrement — purement
  // visuel, aucune lecture de cette valeur par la logique métier.
  const heartFill = useRef(new Animated.Value(0)).current;
  // Entrée de l'écran Review (fade + léger slide vertical, Animated natif uniquement) — jamais de
  // flash brutal quand le backend répond.
  const reviewEntrance = useRef(new Animated.Value(0)).current;
  // "Pop" d'ENTRÉE en PROCESSING — un seul aller-retour joué UNE FOIS au moment exact de la
  // transition (pas une boucle), pour que le changement d'état soit perçu INSTANTANÉMENT, avant même
  // que la respiration continue (`pulse`) ou la rotation (`processingRotate`) n'aient le temps de se
  // remarquer. Combiné à `pulse` par multiplication (voir JSX) : le bouton "réagit" au relâchement,
  // puis continue de respirer plus fort tant que PROCESSING dure.
  const processingPop = useRef(new Animated.Value(1)).current;
  // Anneau qui tourne en continu pendant PROCESSING — signal de "travail en cours" immédiatement
  // reconnaissable (contrairement à une simple variation d'opacité, une rotation ne peut jamais être
  // confondue avec un état figé), tout en restant un style Pensif (anneau coloré, pas un
  // ActivityIndicator générique gris). Boucle indéfiniment tant que phase === 'processing'.
  const processingRotate = useRef(new Animated.Value(0)).current;

  // Refs (pas de state) pour le geste press-and-hold : lues/écrites en dehors du cycle de rendu,
  // sans provoquer ni attendre de re-rendu — indispensable pour départager correctement un
  // relâchement survenu PENDANT la séquence asynchrone de démarrage (permission/prepare).
  const pressStartRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const busyRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Respiration du bouton/halo pendant PROCESSING — amplitude délibérément MARQUÉE (12%, pas 5%) et
  // rythme plus vif (700ms) après retour utilisateur réel : la version précédente (5%/900ms) restait
  // perceptible mais trop discrète, contribuant à l'impression que l'app pouvait être bloquée.
  // Jamais pendant l'écoute (où seuls les anneaux pilotés par le vrai niveau audio bougent) ni au repos.
  useEffect(() => {
    if (phase !== 'processing') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  // "Pop" joué UNE SEULE FOIS exactement à l'entrée en PROCESSING (voir déclaration plus haut) —
  // parfaitement synchronisé avec l'arrêt des ripples et le changement de texte, pour un changement
  // d'état perçu en moins d'une seconde plutôt qu'un simple fondu progressif.
  useEffect(() => {
    if (phase !== 'processing') return;
    processingPop.setValue(0.88);
    Animated.spring(processingPop, { toValue: 1, speed: 10, bounciness: 10, useNativeDriver: true }).start();
  }, [phase, processingPop]);

  // Rotation continue de l'anneau "réflexion" (voir JSX du bloc PROCESSING) — signal de travail en
  // cours immédiatement lisible, indépendant de tout metering/audio.
  useEffect(() => {
    if (phase !== 'processing') {
      processingRotate.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(processingRotate, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, processingRotate]);

  // Anneaux réactifs au niveau audio RÉEL (voir normalizeMetering) — noise gate + lissage
  // exponentiel pour éviter tout tremblement dans le silence ("displayLevel" conservé entre les
  // polls via une ref, pas juste une interpolation Animated ponctuelle). Remis à 0 dès qu'on quitte
  // l'écoute — en dehors de 'listening', aucune de ces valeurs ne bouge (idle calme, processing sans
  // réaction audio).
  const displayLevelRef = useRef(0);
  // Garde-fou NIVEAU 1 (voir voiceActivity.ts) — accumule, sur le MÊME flux de mesures que les
  // anneaux, le temps cumulé de vraie voix détectée pendant l'enregistrement en cours. Consulté
  // dans handlePressOut avant tout appel à uploadAudioForCapture (donc avant tout appel STT).
  const voiceActivityRef = useRef(new VoiceActivityAccumulator());
  useEffect(() => {
    if (phase !== 'listening') {
      displayLevelRef.current = 0;
      level.setValue(0);
      return;
    }
    const rawNormalized = normalizeMetering(recorderState.metering);
    const target = rawNormalized < NOISE_GATE_NORMALIZED ? 0 : rawNormalized;
    displayLevelRef.current = displayLevelRef.current * (1 - SMOOTHING_ALPHA) + target * SMOOTHING_ALPHA;
    Animated.timing(level, { toValue: displayLevelRef.current, duration: 100, useNativeDriver: true }).start();
    voiceActivityRef.current.addSample(recorderState.metering, METERING_POLL_MS);
  }, [phase, recorderState.metering, level]);

  // Remplissage du cœur basé sur la durée d'enregistrement — plafonné élégamment à
  // HEART_FILL_CAP_MS plutôt que d'imposer une durée maximale de capture.
  useEffect(() => {
    if (phase !== 'listening') {
      heartFill.setValue(0);
      return;
    }
    const progress = Math.min(1, recorderState.durationMillis / HEART_FILL_CAP_MS);
    Animated.timing(heartFill, { toValue: progress, duration: 150, useNativeDriver: false }).start();
  }, [phase, recorderState.durationMillis, heartFill]);

  useEffect(() => {
    if (phase !== 'review') return;
    reviewEntrance.setValue(0);
    // 180ms (borne basse de la fourchette 200-300ms initialement demandée) : cette animation
    // s'ajoute au délai déjà réel de STT/LLM avant que Review n'apparaisse — la raccourcir légèrement
    // réduit le délai perçu total sans sacrifier la douceur de la transition.
    Animated.timing(reviewEntrance, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [phase, reviewEntrance]);

  useEffect(() => {
    // Nettoyage à la fermeture de l'écran (retour arrière pendant l'enregistrement, etc.) — jamais
    // laisser un enregistrement ou la session audio iOS actifs derrière soi, jamais de recorder
    // laissé "bloqué" pour la prochaine ouverture de l'écran.
    return () => {
      if (isRecordingRef.current) {
        recorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      // Ripples : aucune animation/timer ne doit continuer à tourner après le démontage de l'écran
      // (§PERFORMANCE — nettoyer toutes les animations au release/unmount).
      ripplesActiveRef.current = false;
      rippleTimerRef.current.forEach((t) => t && clearTimeout(t));
      rippleAnimRef.current.forEach((a) => a?.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirmation de sortie PENDANT PROCESSING uniquement (§1) — ni idle/listening (rien à perdre,
  // le tap trop court ou le relâchement normal doivent rester silencieux) ni review (résultat déjà
  // là, quitter est sans risque). `beforeRemove` intercepte aussi bien le geste de retour, le bouton
  // "back" du header que le bouton matériel Android sur ce stack natif — un seul point d'interception
  // suffit, pas besoin d'un BackHandler séparé.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (phase !== 'processing') return;
      e.preventDefault();
      Alert.alert('L’analyse est toujours en cours. Quitter ?', undefined, [
        { text: 'Continuer d’attendre', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, phase]);

  function resetToIdle() {
    setErrorMessage(null);
    setPermissionMessage(null);
    setPhase('idle');
  }

  // 1) démarrer l'enregistrement — appelé au press-in (maintien du bouton micro). Idempotent/gardé
  // par busyRef : un second press-in pendant la séquence async (permission, etc.) est ignoré.
  async function handlePressIn() {
    if (phase !== 'idle' || busyRef.current) return;
    busyRef.current = true;
    cancelledRef.current = false;
    pressStartRef.current = Date.now();
    setErrorMessage(null);
    setPermissionMessage(null);

    // V1 online-only (voir architecture Capture Intelligente) : inutile de faire parler
    // l'utilisateur pour échouer ensuite à l'envoi.
    const net = await NetInfo.fetch();
    if (cancelledRef.current) {
      busyRef.current = false;
      return;
    }
    if (!(net.isConnected && net.isInternetReachable !== false)) {
      busyRef.current = false;
      setErrorMessage('La capture intelligente nécessite une connexion Internet.');
      setPhase('error');
      return;
    }

    let status = await getRecordingPermissionsAsync();
    if (status.status !== 'granted') {
      status = await requestRecordingPermissionsAsync();
    }
    if (cancelledRef.current) {
      // Relâché pendant la demande de permission (ex. dialogue système) — on n'enregistre rien,
      // retour silencieux à l'état repos, comme un tap trop court.
      busyRef.current = false;
      return;
    }
    if (status.status !== 'granted') {
      busyRef.current = false;
      setPermissionMessage(
        status.canAskAgain
          ? 'Permission micro refusée. Tu peux réessayer.'
          : 'Permission micro refusée définitivement. Ouvre les réglages du téléphone pour l’autoriser.',
      );
      setPhase('error');
      return;
    }

    try {
      // 2) activer la session audio iOS si nécessaire — sans effet sur Android (champ iOS-only).
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (cancelledRef.current) {
        // Relâché pendant la préparation — on annule sans jamais avoir démarré recorder.record().
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        busyRef.current = false;
        return;
      }
      await recorder.prepareToRecordAsync();
      if (cancelledRef.current) {
        await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        busyRef.current = false;
        return;
      }
      recorder.record();
      isRecordingRef.current = true;
      voiceActivityRef.current.reset();
      // 3) + 4) animation et timer démarrent via l'effet ci-dessus / recorderState (voir rendu).
      setPhase('listening');
    } catch (e) {
      busyRef.current = false;
      setErrorMessage(`Erreur micro : ${e instanceof Error ? e.message : String(e)}`);
      setPhase('error');
      return;
    }
    busyRef.current = false;
  }

  // Relâchement du bouton micro : si l'enregistrement n'a pas encore réellement démarré (toujours
  // dans la séquence async de handlePressIn), on se contente de signaler l'annulation via
  // cancelledRef — rien d'autre à faire ici tant que `isRecordingRef` n'est pas vrai.
  async function handlePressOut() {
    if (!isRecordingRef.current) {
      cancelledRef.current = true;
      return;
    }
    const heldMs = Date.now() - (pressStartRef.current ?? Date.now());
    // PROCESSING doit s'afficher DÈS le relâchement, AVANT tout appel réseau (§1 état PROCESSING
    // explicite) — sinon l'écran reste sur "J'écoute…" pendant recorder.stop()/les gardes-fous qui
    // suivent, donnant l'impression que Pensif écoute encore. isPressTooShort est une fonction pure
    // (aucun effet de bord) : l'appeler ici en plus de sa vérification plus bas ne change rien au
    // pipeline, ça avance juste le changement d'écran pour un maintien qui compte réellement comme
    // une capture (le cas "tap trop court" ne montre donc jamais PROCESSING, comme avant).
    if (!isPressTooShort(heldMs)) {
      setPhase('processing');
    }

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (e) {
      isRecordingRef.current = false;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setErrorMessage(`Erreur à l’arrêt de l’enregistrement : ${e instanceof Error ? e.message : String(e)}`);
      setPhase('error');
      return;
    }
    isRecordingRef.current = false;
    // 4) restaurer allowsRecording:false sur iOS après l'arrêt, dans tous les cas (tap trop court
    // inclus) — jamais laisser le téléphone configuré inutilement en mode enregistrement. Volontairement
    // PAS attendu ici (fire-and-forget) : cette réinitialisation de session iOS est indépendante de
    // la lecture du fichier/upload qui suit, l'attendre ne ferait qu'ajouter un aller-retour natif
    // inutile avant même de commencer l'envoi — réduit le délai perçu avant PROCESSING/REVIEW.
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});

    if (isPressTooShort(heldMs)) {
      // Tap trop court : annulation propre, retour à l'état repos, AUCUN envoi au backend — le
      // fichier produit (s'il existe) est simplement abandonné, jamais uploadé.
      setPhase('idle');
      return;
    }

    if (!uri) {
      setErrorMessage('Aucun fichier audio n’a été produit.');
      setPhase('error');
      return;
    }

    // GARDE-FOU NIVEAU 1 (avant STT) — voir voiceActivity.ts. Un maintien assez long pour passer le
    // seuil anti-tap (>=400ms) mais sans voix probable détectée (silence, bruit lointain) ne doit
    // JAMAIS être envoyé au backend : ni uploadAudioForCapture, ni donc Groq — cas réel corrigé,
    // le STT "hallucinait" une phrase sur du silence maintenu plusieurs secondes. Volontairement
    // permissif (voir voiceActivity.ts) : le but est d'éviter les faux négatifs (rejeter une vraie
    // voix), le filtre post-STT (captureExploitability.ts) reste la seconde sécurité.
    if (__DEV__) {
      // Logs DEBUG temporaires (dev uniquement) — pour calibrer les seuils avec de vrais tests
      // iPhone. Ne journalise aucune donnée audio elle-même, uniquement les métriques dérivées.
      console.log('[Pensif][voice-guard]', voiceActivityRef.current.debugSnapshot());
    }
    if (!voiceActivityRef.current.hasLikelySpeech()) {
      setPhase('silence');
      return;
    }

    const filename = uri.split('/').pop() || `capture-${Date.now()}.m4a`;
    const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'm4a';
    const mimeType = extension === 'm4a' ? 'audio/m4a' : extension === 'wav' ? 'audio/wav' : `audio/${extension}`;

    // 5) passer directement à PROCESSING (pas de bouton "Terminer" dans ce comportement).
    setPhase('processing');
    try {
      // 6) envoyer le fichier au backend comme aujourd'hui — chemin STT/LLM/matching inchangé.
      const result = await uploadAudioForCapture({ uri, filename, mimeType });
      // RÈGLE DE SÉCURITÉ (combine les deux niveaux) : si l'audio local n'a montré aucun pic franc
      // (ou si le metering n'était pas assez fiable pour trancher), le filtre texte devient plus
      // strict sur la langue — un unique marqueur français isolé ne suffit plus. Avec une vraie
      // voix détectée (pic franc), on reste aussi permissif qu'avant.
      const voiceSnapshot = voiceActivityRef.current.debugSnapshot();
      const weakAudioEvidence =
        voiceSnapshot.meteringUnreliable || voiceSnapshot.peakDb === null || voiceSnapshot.peakDb < STRONG_PEAK_THRESHOLD_DB;
      if (__DEV__) {
        console.log('[Pensif][exploitability-guard]', { weakAudioEvidence, transcript: result.transcript });
      }
      // Garde-fou "aucune parole exploitable" — AVANT toute carte/sauvegarde : du bruit transcrit
      // en texte incohérent (ou une capture vide/hors-français) ne doit jamais atteindre Review.
      if (!isCaptureExploitable(result, { weakAudioEvidence })) {
        setPhase('unclear');
        return;
      }
      setTranscript(result.transcript);
      setCards(buildInitialCards(result, (heard) => matchContactByHeardName(heard, contacts), contacts));
      setPhase('review');
    } catch (e) {
      setErrorMessage(
        e instanceof CaptureApiError ? `${e.message}${e.status ? ` (HTTP ${e.status})` : ''}` : e instanceof Error ? e.message : String(e),
      );
      setPhase('error');
    }
  }

  // Geste push-to-talk robuste : Gesture Responder System natif de React Native (PanResponder), pas
  // react-native-reanimated (voir consigne — éviter de rouvrir les problèmes Worklets) ni
  // react-native-gesture-handler (pas installé, éviterait une nouvelle dépendance native).
  //
  // BUG CORRIGÉ (retour réel : appuyer sur le fond violet ne démarrait pas l'enregistrement) :
  // la version précédente gatait le démarrage via un rectangle mesuré manuellement
  // (`measureInWindow` + comparaison à `pageX/pageY`) — fragile (mesure asynchrone, risque de
  // rectangle périmé/pas encore stabilisé). On s'appuie maintenant sur le hit-testing NATIF de RN :
  // `panResponder.panHandlers` est attaché DIRECTEMENT sur `buttonWrap` (le bouton + son halo, voir
  // JSX) au lieu du conteneur plein écran — RN n'appelle `onStartShouldSetPanResponder` QUE pour un
  // toucher dont les coordonnées natives tombent réellement dans les bounds rendus de cette vue :
  // donc `() => true` suffit, aucun calcul de géométrie à notre charge, aucune zone ratée possible.
  // Une fois le responder accordé (`onPanResponderGrant`), le système envoie ensuite TOUS les
  // évènements de déplacement/relâchement de ce doigt à ce même responder quelle que soit sa
  // position sur l'écran — comportement natif du Gesture Responder System, aucune logique de suivi
  // supplémentaire à ajouter : seul un relâchement RÉEL (`onPanResponderRelease`) ou une
  // interruption système (`onPanResponderTerminate`, ex. appel entrant) arrête l'enregistrement.
  // `onPanResponderTerminationRequest: () => false` : on garde la main tant qu'on enregistre, pour
  // ne jamais perdre le relâchement au profit d'un autre responder.
  // Feedback tactile immédiat (voir `pressScale` plus haut) — 3 temps très courts (~150-200ms au
  // total) : enfoncement rapide, léger rebond au-dessus de 1, retour à 1.0 — se déclenche AVANT
  // tout, dès `onPanResponderGrant`, indépendant du démarrage réel de l'enregistrement
  // (permission/prepare asynchrones), donc perçu instantanément par l'utilisateur même si l'audio
  // met encore quelques dizaines de ms à démarrer. L'identité "écoute" est désormais portée par les
  // ripples (voir startRipples), pas par un maintien du scale du bouton.
  function animateButtonPressIn() {
    Animated.sequence([
      Animated.timing(pressScale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(pressScale, { toValue: 1.01, duration: 70, useNativeDriver: true }),
      Animated.timing(pressScale, { toValue: 1, duration: 60, useNativeDriver: true }),
    ]).start();
  }
  // Retour fluide si le relâchement interrompt la séquence en cours — léger spring, sans rebond
  // excessif (bounciness faible).
  function animateButtonPressOut() {
    Animated.spring(pressScale, { toValue: 1, speed: 14, bounciness: 4, useNativeDriver: true }).start();
  }

  /** Démarre le cycle d'une onde à l'index `i` : grandit/se dissipe une fois, puis se relance
   *  immédiatement depuis le centre (valeur remise à 0, jamais une animation retour visible) tant
   *  que `ripplesActiveRef` reste vrai — c'est ce qui donne un FLUX d'ondes successives indépendantes
   *  plutôt que N anneaux qui respirent ensemble. */
  function runRippleCycle(i: number) {
    if (!ripplesActiveRef.current) return;
    ripples[i].setValue(0);
    const anim = Animated.timing(ripples[i], {
      toValue: 1,
      duration: RIPPLE_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    rippleAnimRef.current[i] = anim;
    anim.start(({ finished }) => {
      if (finished && ripplesActiveRef.current) runRippleCycle(i);
    });
  }

  /** Démarre les 4 ondes, chacune avec son propre délai de départ (0/300/600/900ms) — voir
   *  RIPPLE_STAGGER_MS. Purement temporel, jamais piloté par le metering (§IMPORTANT AUDIO). */
  function startRipples() {
    ripplesActiveRef.current = true;
    Animated.timing(ripplesMasterOpacity, { toValue: 1, duration: 80, useNativeDriver: true }).start();
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      ripples[i].setValue(0);
      rippleTimerRef.current[i] = setTimeout(() => runRippleCycle(i), i * RIPPLE_STAGGER_MS);
    }
  }

  /** Arrête net toute nouvelle onde, fait disparaître proprement celles en cours (fondu commun
   *  ~200ms, plutôt qu'une coupure brutale) et nettoie toutes les animations/timers en vol — voir
   *  §PERFORMANCE. Appelée au relâchement ET au démontage de l'écran. */
  function stopRipples() {
    ripplesActiveRef.current = false;
    rippleTimerRef.current.forEach((t) => t && clearTimeout(t));
    rippleTimerRef.current = Array(RIPPLE_COUNT).fill(null);
    rippleAnimRef.current.forEach((a) => a?.stop());
    rippleAnimRef.current = Array(RIPPLE_COUNT).fill(null);
    Animated.timing(ripplesMasterOpacity, { toValue: 0, duration: RIPPLE_MASTER_FADE_MS, useNativeDriver: true }).start(() => {
      ripples.forEach((v) => v.setValue(0));
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        animateButtonPressIn();
        startRipples();
        handlePressIn();
      },
      onPanResponderMove: () => {},
      onPanResponderRelease: () => {
        animateButtonPressOut();
        stopRipples();
        handlePressOut();
      },
      onPanResponderTerminate: () => {
        // Interruption système (appel entrant, alerte, etc.) — traité comme un relâchement réel,
        // jamais un recorder laissé actif silencieusement.
        animateButtonPressOut();
        stopRipples();
        handlePressOut();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  function patchCard(cardId: string, patch: Partial<CaptureCard>) {
    setCards((prev) => prev.map((c) => (c.cardId === cardId ? { ...c, ...patch } : c)));
  }

  function selectContact(cardId: string, contactId: string | null) {
    // Toute sélection explicite (y compris re-confirmer le proche déjà présélectionné par un match
    // fuzzy) devient une confirmation utilisateur — le hint de matching n'est plus jamais revalidé
    // après cette intervention manuelle (voir contactMatching.ts / captureReview.ts).
    // confirmContactForCard centralise aussi la cohérence texte/contact (§RÈGLES) : ne corrige le
    // texte que pour un match originellement exact/fuzzy_high_confidence, jamais pour un cas
    // ambigu/non résolu — voir captureReview.ts.
    setCards((prev) => prev.map((c) => (c.cardId === cardId ? confirmContactForCard(c, contactId, contacts) : c)));
  }

  function clearEventDate(cardId: string) {
    patchCard(cardId, { eventHint: null });
  }

  function setEventDate(cardId: string, date: Date) {
    const card = cards.find((c) => c.cardId === cardId);
    // CHANTIER CAPTURE — EVENT TIME, incrément 3 (2026-09-18) : ce picker (Android) ne modifie QUE la
    // date — `time`/`heardExpression` déjà présents sont conservés tels quels, jamais réinterprétés.
    patchCard(cardId, {
      eventHint: { date: formatDateISO(date), time: card?.eventHint?.time ?? null, heardExpression: card?.eventHint?.heardExpression ?? null },
    });
  }

  /**
   * CORRECTIF picker iOS — seed non confirmée (2026-09-18). Symptôme diagnostiqué : `display="spinner"`
   * ne déclenche `onChange` que lorsque l'utilisateur fait RÉELLEMENT tourner une roulette — jamais au
   * simple montage. La carte affichait donc une valeur crédible (`reminderPickerSeed`) sans qu'elle
   * n'existe encore dans `card.reminderDate`/`reminderTime`, obligeant à bouger la roulette puis
   * revenir pour que la valeur affichée devienne réelle.
   *
   * Correction : au moment précis où l'utilisateur OUVRE explicitement le picker (jamais à la
   * fermeture, jamais au montage de l'écran, jamais dans buildInitialCards), on écrit immédiatement
   * la valeur actuellement affichée (`reminderPickerSeed`, la même fonction que le rendu utilise déjà)
   * dans la carte. Si une composante existe déjà, `reminderPickerSeed` renvoie déjà cette valeur
   * réelle telle quelle (voir sa définition : `card.reminderDate ?? demain`, `card.reminderTime ?? 9h`)
   * — réécrire la seed est donc un no-op strict dans ce cas, jamais une valeur qui change ce qui
   * existait déjà. Le comportement `onChange` existant (`applyReminderDateTimeChange`) n'est pas
   * touché : cette confirmation ne fait qu'amorcer l'état, la roulette continue de fonctionner
   * normalement par-dessus. Appelée uniquement pour le picker COMBINÉ iOS (reminderDateTime) — les
   * dialogs natifs Android (`DateTimePickerHost`) confirment déjà correctement sur leur propre bouton
   * OK, qui déclenche systématiquement `onChange`, seed ou non.
   */
  function confirmReminderSeed(cardId: string) {
    const card = cards.find((c) => c.cardId === cardId);
    if (!card) return;
    const parts = toLocalDateTimeParts(reminderPickerSeed(card));
    patchCard(cardId, {
      reminderDate: { year: parts.year, month: parts.month, day: parts.day },
      reminderTime: { hour: parts.hour, minute: parts.minute },
    });
  }

  /** Toggle explicite du picker combiné iOS (voir toggleReminderDateTimePicker, captureReview.ts) —
   *  confirme la seed UNIQUEMENT à l'ouverture (`next !== null`), jamais à la fermeture. Centralisé
   *  ici pour être réutilisé identiquement par les 3 points d'entrée (rappel ponctuel, et les deux
   *  lignes "Date de début"/"Heure" du bloc récurrent). */
  function openReminderDateTimePicker(cardId: string) {
    const next = toggleReminderDateTimePicker(openPicker, cardId);
    if (next) confirmReminderSeed(cardId);
    setOpenPicker(next);
  }

  function toggleReminder(cardId: string, enabled: boolean) {
    patchCard(cardId, { reminderEnabled: enabled });
    if (enabled && Platform.OS === 'android' && !canScheduleExactAlarms()) {
      Alert.alert(
        'Autoriser les rappels à l’heure exacte',
        'Pensif a besoin de cette autorisation pour vous prévenir à l’heure choisie.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Autoriser', onPress: () => openExactAlarmSettings() },
        ],
      );
    }
  }

  // --- CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18) : de simples relais vers les fonctions
  // PURES de captureReview.ts (déjà testées, incrément 3) — AUCUNE décision de validité ici,
  // needsReview/isCardValid restent l'unique source de vérité. ------------------------------------

  function handleToggleRecurrence(cardId: string, enabled: boolean) {
    setCards((prev) => toggleRecurrence(prev, cardId, enabled));
    if (!enabled) setRecurrenceEditor((prev) => (prev?.cardId === cardId ? null : prev));
  }

  function handleChooseRecurrenceFrequency(cardId: string, frequency: RecurrenceDraftFrequency) {
    setCards((prev) => setRecurrenceFrequency(prev, cardId, frequency));
  }

  function handleToggleRecurrenceDay(cardId: string, day: number) {
    setCards((prev) => toggleRecurrenceDay(prev, cardId, day));
  }

  // "Une seule borne éditable à la fois" (consigne explicite) — chaque choix nettoie EXPLICITEMENT
  // l'autre borne via les fonctions pures existantes, jamais une coexistence résiduelle.
  function handleChooseRecurrenceNever(cardId: string) {
    setCards((prev) => setRecurrenceUntilDate(setRecurrenceOccurrenceCount(prev, cardId, null), cardId, null));
  }

  function handleChooseRecurrenceCount(cardId: string, count: number) {
    setCards((prev) => setRecurrenceUntilDate(setRecurrenceOccurrenceCount(prev, cardId, count), cardId, null));
  }

  function handleChooseRecurrenceUntilDate(cardId: string, date: LocalDate) {
    setCards((prev) => setRecurrenceOccurrenceCount(setRecurrenceUntilDate(prev, cardId, date), cardId, null));
  }

  function setReminderDateTime(cardId: string, date: Date) {
    const parts = toLocalDateTimeParts(date);
    patchCard(cardId, {
      reminderDate: { year: parts.year, month: parts.month, day: parts.day },
      reminderTime: { hour: parts.hour, minute: parts.minute },
    });
  }

  function setReminderDatePart(cardId: string, date: Date) {
    const parts = toLocalDateTimeParts(date);
    patchCard(cardId, { reminderDate: { year: parts.year, month: parts.month, day: parts.day } });
  }

  function setReminderTimePart(cardId: string, date: Date) {
    const parts = toLocalDateTimeParts(date);
    patchCard(cardId, { reminderTime: { hour: parts.hour, minute: parts.minute } });
  }

  /** Android — dispatché par `DateTimePickerHost` (dialog natif, confirme toujours réellement sur son
   *  propre bouton OK, aucun préremplissage nécessaire avant ouverture, contrairement au contrôle
   *  unique iOS — voir le bloc ÉVÉNEMENT du JSX). */
  function setEventTimePart(cardId: string, date: Date) {
    setCards((prev) => applyEventTimeChange(prev, cardId, date));
  }

  function handleDiscard(cardId: string) {
    const next = discardCard(cards, cardId);
    setCards(next);
    if (next.length === 0) navigation.goBack();
  }

  function saveOne(card: CaptureCard): CaptureCard[] {
    let next = markSaving(cards, card.cardId);
    try {
      // CORRECTIF UX (2026-09-16) — filet de sécurité : si un contact fuzzy reste associé sans
      // confirmation explicite ("Confirmer" jamais tapé), corrige le texte AVANT sauvegarde plutôt
      // que de persister texte="Johan"/contact=Yohan incohérents (voir captureReview.ts).
      const finalized = finalizeCardTextForSave(card, contacts);
      addPensee(buildPenseeFromCard(finalized));
      next = markSaved(next, card.cardId);
    } catch (e) {
      next = markFailed(next, card.cardId, e instanceof Error ? e.message : String(e));
    }
    return next;
  }

  function handleSaveCard(cardId: string) {
    if (savingCardIdsRef.current.has(cardId)) return; // double-tap : 2e appel ignoré
    const card = cards.find((c) => c.cardId === cardId);
    if (!card || !isCardValid(card)) return;
    savingCardIdsRef.current.add(cardId);
    const next = saveOne(card);
    // Échec réel : on relâche la garde pour autoriser un nouveau tap de retry (voir markFailed dans
    // saveOne). Succès : jamais relâché ici, mais sans conséquence — le bouton disparaît (voir
    // `card.status !== 'saved'` plus bas).
    if (next.find((c) => c.cardId === cardId)?.status === 'failed') savingCardIdsRef.current.delete(cardId);
    setCards(next);
  }

  function handleSaveAll() {
    if (savingAllRef.current) return; // double-tap : 2e appel ignoré
    if (!canSaveAll(cards)) return;
    savingAllRef.current = true;
    let next = cards;
    let allOk = true;
    for (const card of cards.filter((c) => c.status === 'pending')) {
      let step = markSaving(next, card.cardId);
      try {
        const finalized = finalizeCardTextForSave(card, contacts);
        addPensee(buildPenseeFromCard(finalized));
        step = markSaved(step, card.cardId);
      } catch (e) {
        step = markFailed(step, card.cardId, e instanceof Error ? e.message : String(e));
        allOk = false;
      }
      next = step;
    }
    setCards(next);
    if (allOk) {
      navigation.goBack();
    } else {
      savingAllRef.current = false; // au moins un échec réel : autorise un nouveau tap pour retenter
    }
  }

  // "Nouvelle capture" (§2 chantier UX) — repart IMMÉDIATEMENT vers idle sur ce même écran (jamais
  // navigation.goBack() + re-navigate : ce serait un aller-retour visible et perdrait tout état déjà
  // en mémoire pour rien). Reset propre de tout l'état Capture visible/pertinent avant de rouvrir le
  // micro — aucune donnée résiduelle de la capture précédente ne doit réapparaître dans la suivante.
  function resetCaptureState() {
    setTranscript('');
    setCards([]);
    setErrorMessage(null);
    setPermissionMessage(null);
    setOpenPicker(null);
    voiceActivityRef.current.reset();
    setPhase('idle');
  }

  function handleNewCapture() {
    // Une carte "pending" (jamais enregistrée) ou "failed" (échec de sauvegarde, erreur encore
    // visible) serait perdue silencieusement sans cette confirmation — "saved" ne l'est jamais
    // puisque déjà en sécurité dans le store (addPensee), donc jamais bloquant.
    const hasUnsaved = cards.some((c) => c.status === 'pending' || c.status === 'failed');
    if (!hasUnsaved) {
      resetCaptureState();
      return;
    }
    Alert.alert(
      'Pensées non enregistrées',
      'Certaines pensées n’ont pas encore été enregistrées. Les abandonner et démarrer une nouvelle capture ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Abandonner et continuer', style: 'destructive', onPress: resetCaptureState },
      ],
    );
  }

  // ────────────────────────────────────── IDLE / LISTENING (push-to-talk) ──────────────────────────────────────
  // Le geste vit sur le conteneur plein-écran (panResponder.panHandlers), pas sur le bouton
  // lui-même — voir panResponder plus haut : seul le DÉMARRAGE du toucher doit être dans le bouton,
  // le suivi/relâchement doit rester actif où que le doigt aille ensuite.
  if (phase === 'idle' || phase === 'listening') {
    const isListening = phase === 'listening';
    return (
      <Screen scroll={false}>
        <View style={[styles.pushToTalkContainer, { paddingBottom: insets.bottom + 14 }]}>
          {/* Textes interactifs en HAUT de l'écran (voir mockup) — plus le centre géométrique. */}
          <Text style={[styles.title, { color: theme.ink, marginTop: 18 }]}>{isListening ? 'J’écoute…' : 'Maintenez pour parler'}</Text>
          <Text style={[styles.subtitle, { color: theme.inkSoft }]}>
            {isListening ? 'Parlez naturellement.' : 'Relâchez quand vous avez terminé.'}
          </Text>

          {/* Spacer flexible RESPONSIVE (ratio, pas de coordonnée fixe) qui positionne le bouton
              dans l'espace restant sous les textes. */}
          <View style={{ flex: 1 }} />
          {/* panHandlers ICI (pas sur le conteneur plein écran) : seule cette zone — le bouton et son
              halo, 358px, nettement plus large que les 280px du cercle visuel — doit démarrer le
              geste ; le hit-testing natif de RN garantit qu'AUCUN point à l'intérieur de ces bounds
              n'est raté (voir panResponder plus haut). */}
          <View style={styles.buttonWrap} {...panResponder.panHandlers}>
            {/* Halo à deux couches (glow dégradé plus doux, façon mockup) — une simple teinte plate
                rendait le contour trop net ; deux cercles superposés d'opacité décroissante
                approchent un flou radial sans dépendance supplémentaire. Réaction audio TRÈS
                SUBTILE conservée ici uniquement (§IMPORTANT AUDIO) — jamais sur les grandes ondes,
                voir plus bas — parfaitement immobile au repos (`level` reste à 0 hors écoute). */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.haloOuter,
                { backgroundColor: theme.accent, transform: [{ scale: isListening ? level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) : pulse }] },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.haloInner,
                { backgroundColor: theme.accent, transform: [{ scale: isListening ? level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) : pulse }] },
              ]}
            />
            {/* "Concentric listening ripples" — 4 ondes indépendantes, purement temporelles (voir
                startRipples/RIPPLE_* plus haut) : chacune naît au contour du bouton (scale 1,
                opacity RIPPLE_OPACITY_START) et grandit en se dissipant jusqu'à disparition
                complète (scale RIPPLE_MAX_SCALE, opacity 0). `ripplesMasterOpacity` (0 au repos, 1
                pendant l'écoute) garantit qu'aucune onde n'est jamais visible en idle, et permet une
                disparition commune propre au relâchement plutôt qu'une coupure brutale. */}
            {ripples.map((progress, i) => {
              const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, RIPPLE_MAX_SCALE] });
              const opacity = Animated.multiply(
                progress.interpolate({ inputRange: [0, 1], outputRange: [RIPPLE_OPACITY_START, 0] }),
                ripplesMasterOpacity,
              );
              return (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={[
                    styles.ripple,
                    {
                      width: BUTTON_SIZE,
                      height: BUTTON_SIZE,
                      borderRadius: BUTTON_SIZE / 2,
                      backgroundColor: theme.accent,
                      transform: [{ scale }],
                      opacity,
                    },
                  ]}
                />
              );
            })}
            <Animated.View style={[styles.buttonHitArea, { transform: [{ scale: pressScale }] }]}>
              <LinearGradient
                colors={[BUTTON_GRADIENT_HIGHLIGHT, theme.accent, theme.accentStrong]}
                start={{ x: 0.12, y: 0.05 }}
                end={{ x: 0.95, y: 1 }}
                style={styles.gradientCircle}
              >
                <LogoWithHeart progress={heartFill} fillColor={theme.plum} />
              </LinearGradient>
            </Animated.View>
          </View>
          {isListening ? (
            <Text style={[styles.duration, { color: theme.inkSoft }]}>{(recorderState.durationMillis / 1000).toFixed(0)}s</Text>
          ) : (
            <View style={{ height: 13 + 18 }} />
          )}
          {/* BUG CORRIGÉ : un ratio différent du spacer du dessus ne rapprochait PAS la
              confidentialité du bord (sa position dépend seulement des hauteurs fixes + de
              paddingBottom, pas de ce ratio) — ça ne faisait que pousser le bouton vers le bas de
              façon non désirée. Même flex que le spacer du dessus : bouton vraiment centré dans
              l'espace disponible. */}
          <View style={{ flex: 1 }} />

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={13} color={theme.inkSoft} />
            <Text style={[styles.privacyText, { color: theme.inkSoft }]}>
              Votre voix est en sécurité.{'\n'}Elle n’est utilisée que pour créer vos pensées.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  // ─────────────────────────────────────────── PROCESSING ───────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <Screen scroll={false}>
        <View style={[styles.pushToTalkContainer, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={[styles.title, { color: theme.ink, marginTop: 18 }]}>Pensif réfléchit…</Text>
          <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Votre pensée est en cours de préparation.</Text>
          <View style={{ flex: 1 }} />
          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: Animated.multiply(pulse, processingPop) }] }]}>
            <Animated.View pointerEvents="none" style={[styles.haloOuter, { backgroundColor: theme.accent }]} />
            <Animated.View pointerEvents="none" style={[styles.haloInner, { backgroundColor: theme.accent }]} />
            {/* Animation "réflexion" — DISTINCTE des ripples d'écoute (celles-ci sont des disques
                PLEINS qui grandissent vers l'extérieur en boucle décalée) et du halo (opacité fixe) :
                un anneau dont deux bords sont colorés et qui TOURNE en continu — signal de travail en
                cours immédiatement lisible (jamais confondu avec un état figé), tout en restant un
                style Pensif (anneau coloré, PAS un ActivityIndicator générique). Jamais rendue hors de
                ce bloc PROCESSING — donc jamais visible pendant l'écoute ni au repos. Animated pur. */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.thinkingRing,
                {
                  borderTopColor: theme.accent,
                  borderRightColor: theme.accent,
                  transform: [{ rotate: processingRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
                },
              ]}
            />
            <View style={styles.buttonHitArea}>
              <LinearGradient
                colors={[BUTTON_GRADIENT_HIGHLIGHT, theme.accent, theme.accentStrong]}
                start={{ x: 0.12, y: 0.05 }}
                end={{ x: 0.95, y: 1 }}
                style={styles.gradientCircle}
              >
                <LogoWithHeart progress={heartFill} fillColor={theme.plum} />
              </LinearGradient>
            </View>
          </Animated.View>
          <View style={{ flex: 1 }} />

          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={13} color={theme.inkSoft} />
            <Text style={[styles.privacyText, { color: theme.inkSoft }]}>
              Votre voix est en sécurité.{'\n'}Elle n’est utilisée que pour créer vos pensées.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  // ─────────────────────────────────────────── SILENCE (garde-fou NIVEAU 1, avant STT) ───────────────────────────────────────────
  if (phase === 'silence') {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <Ionicons name="ear-outline" size={36} color={theme.inkSoft} />
          <Text style={[styles.title, { color: theme.ink, marginTop: 12 }]}>Je n’ai rien entendu</Text>
          <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Parlez un peu plus près du téléphone et réessayez.</Text>
          <View style={{ marginTop: 24, width: '100%', gap: 10 }}>
            <PrimaryButton label="Réessayer" onPress={resetToIdle} />
            <PrimaryButton label="Annuler" onPress={() => navigation.goBack()} variant="secondary" />
          </View>
        </View>
      </Screen>
    );
  }

  // ─────────────────────────────────────────── UNCLEAR (garde-fou NIVEAU 2, après STT) ───────────────────────────────────────────
  if (phase === 'unclear') {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <Ionicons name="ear-outline" size={36} color={theme.inkSoft} />
          <Text style={[styles.title, { color: theme.ink, marginTop: 12 }]}>Je n’ai pas bien entendu</Text>
          <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Parlez un peu plus près du téléphone et réessayez.</Text>
          <View style={{ marginTop: 24, width: '100%', gap: 10 }}>
            <PrimaryButton label="Réessayer" onPress={resetToIdle} />
            <PrimaryButton label="Annuler" onPress={() => navigation.goBack()} variant="secondary" />
          </View>
        </View>
      </Screen>
    );
  }

  // ─────────────────────────────────────────── ERROR ───────────────────────────────────────────
  if (phase === 'error') {
    const message = permissionMessage ?? errorMessage ?? 'Une erreur est survenue.';
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={theme.danger} />
          <Text style={[styles.title, { color: theme.ink, marginTop: 12 }]}>Ça n’a pas fonctionné</Text>
          <Text style={[styles.subtitle, { color: theme.inkSoft }]}>{message}</Text>
          {permissionMessage && !permissionMessage.includes('réessayer') ? (
            <Pressable onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: 12 }}>
              <Text style={{ color: theme.accent, fontWeight: '700' }}>Ouvrir les réglages du téléphone</Text>
            </Pressable>
          ) : null}
          <View style={{ marginTop: 24, width: '100%', gap: 10 }}>
            <PrimaryButton label="Réessayer" onPress={resetToIdle} />
            {/* CHANTIER UX §2 (2026-09-15) — alternative locale quand l'IA (qui nécessite Internet)
                a échoué : ouvre directement la création manuelle d'une pensée, sans transcript ni
                texte pré-rempli, sans aucun nouvel appel STT/LLM. `replace` (pas `navigate`) pour
                quitter proprement le flow Capture — un retour depuis l'écran de création manuelle ne
                doit jamais retomber sur cet écran d'erreur Capture. */}
            <PrimaryButton
              label="Ajouter une pensée manuellement"
              onPress={() => navigation.replace('PenseeDetail', undefined)}
              variant="secondary"
            />
            <PrimaryButton label="Retour" onPress={() => navigation.goBack()} variant="secondary" />
          </View>
        </View>
      </Screen>
    );
  }

  // ─────────────────────────────────────────── REVIEW ───────────────────────────────────────────
  const canSubmitAll = canSaveAll(cards);
  // CTA global inutile si plus aucune carte n'est en attente (tout a déjà été sauvegardé
  // individuellement, ou supprimé) — voir §17.
  const hasPendingCards = cards.some((c) => c.status === 'pending');
  return (
    <Screen>
      <Animated.View
        style={{
          opacity: reviewEntrance,
          transform: [{ translateY: reviewEntrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        }}
      >
      <Text style={[styles.reviewTranscriptLabel, { color: theme.inkSoft }]}>CE QUE PENSIF A ENTENDU</Text>
      <Text style={[styles.reviewTranscript, { color: theme.inkSoft }]} numberOfLines={3}>
        {transcript}
      </Text>

      {cards.map((card) => {
        const matchedContact = card.contactId ? contacts.find((c) => c.id === card.contactId) : undefined;
        const isFuzzy = card.contactMatch.kind === 'fuzzy_high_confidence';
        const isAmbiguous = card.contactMatch.kind === 'ambiguous' || card.contactMatch.kind === 'exact_ambiguous';
        const cardValid = isCardValid(card);
        const cardNeedsReview = needsReview(card);
        const disabled = card.status === 'saving' || card.status === 'saved';

        return (
          <View key={card.cardId} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.cardTopRow}>
              {card.status === 'saved' ? (
                <View style={styles.savedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.sage} />
                  <Text style={{ color: theme.sage, fontWeight: '700', fontSize: 12 }}>Enregistrée</Text>
                </View>
              ) : (
                <View />
              )}
              {/* Accent discret — jamais une grosse bordure rouge : le fuzzy matching n'est pas une
                  erreur, seulement une confirmation à donner (voir §13/§14). */}
              {cardNeedsReview && card.status === 'pending' ? <Pill label="À vérifier" tone="plum" theme={theme} /> : null}
            </View>

            <TextInput
              value={card.texte}
              onChangeText={(t) => patchCard(card.cardId, { texte: t })}
              editable={!disabled}
              multiline
              placeholder="Texte de la pensée"
              placeholderTextColor={theme.inkSoft}
              style={[styles.textarea, { color: theme.ink, borderColor: theme.line }]}
            />

            {/* Proche lié */}
            <Text style={[styles.fieldLabel, { color: theme.inkSoft }]}>PROCHE LIÉ</Text>
            {isFuzzy ? (
              <View style={styles.fuzzyRow}>
                <Ionicons name="sparkles-outline" size={12} color={theme.accent} />
                <Text style={[styles.fuzzyHint, { color: theme.accent }]}>
                  Pensif pense que vous parlez de {matchedContact?.prenom ?? '…'}.
                </Text>
              </View>
            ) : null}
            {isAmbiguous ? (
              <View style={styles.fuzzyRow}>
                <Ionicons name="help-circle-outline" size={12} color={theme.plum} />
                <Text style={[styles.fuzzyHint, { color: theme.plum }]}>Plusieurs proches possibles — choisis lequel.</Text>
              </View>
            ) : null}
            {/* CHANTIER UX — ContactPicker commun (2026-09-16) : remplace la liste de TOUS les
                contacts en boutons (ne passait pas à l'échelle, voir consigne du chantier) par le
                contact déjà reconnu/sélectionné, mis en avant. `suggestedContactId` réutilise
                STRICTEMENT `card.contactMatch` déjà produit par contactMatching.ts (aucune deuxième
                reconnaissance, aucun appel LLM supplémentaire) — la confirmation rejoue exactement
                `selectContact`, comme un tap sur le chip du contact suggéré le faisait avant.
                CORRECTIF (2026-09-16) — `card.contactId` est déjà PRÉ-REMPLI par
                buildCardFromExtracted même pour `fuzzy_high_confidence` (voir captureReview.ts,
                §RÈGLES) : l'afficher tel quel montrerait à tort "[Yohan ✓]" comme déjà confirmé,
                sans jamais proposer "Confirmer" — `isFuzzy` (déjà calculé plus haut) bascule donc
                explicitement vers l'état "suggestion" tant que ce match précis n'a pas été
                confirmé/changé/écarté par l'utilisateur. */}
            <ContactAssociationField
              theme={theme}
              contacts={contacts}
              selectedContactId={isFuzzy ? null : card.contactId}
              disabled={disabled}
              suggestedContactId={isFuzzy ? card.contactId : null}
              onConfirmSuggestion={(id) => selectContact(card.cardId, id)}
              onClear={() => selectContact(card.cardId, null)}
              onOpenPicker={() => setContactPickerCardId(card.cardId)}
            />

            {/* Événement (informatif, purement daté — indépendant du rappel). CHANTIER UNIFICATION UX
                PICKERS iOS, incrément 5 (2026-09-18) : UN SEUL contrôle principal date+heure sur iOS
                (remplace les deux chips séparées de l'incrément précédent) — mode "datetime" si une
                heure existe déjà, "date" sinon, décidé par `card.eventHint.time` : ouvrir ce contrôle
                n'invente donc JAMAIS une heure silencieusement. "Date sans heure" reste un état
                pleinement valide (voir action secondaire "+ Ajouter une heure"/"Retirer l'heure"
                ci-dessous, qui seule peut créer/retirer une heure). */}
            {card.eventHint?.date ? (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.fieldLabel, { color: theme.inkSoft }]}>ÉVÉNEMENT</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    disabled={disabled}
                    // iOS : toggle explicite du contrôle UNIQUE (voir toggleEventPicker) — ouvre/
                    // referme, un retap sur le même champ referme. Android inchangé : `setOpenPicker`
                    // direct, géré par le DateTimePickerHost partagé plus bas (dialog natif de date
                    // SEULE — Android n'a pas de mode "datetime" combiné dans ce composant).
                    onPress={() =>
                      setOpenPicker(
                        Platform.OS === 'ios'
                          ? toggleEventPicker(openPicker, card.cardId)
                          : { cardId: card.cardId, kind: 'eventDate' },
                      )
                    }
                    style={[styles.dateChip, { borderColor: theme.line, backgroundColor: theme.paperDim }]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={theme.ink} />
                    <Text style={{ color: theme.ink, fontSize: 12, fontWeight: '600' }}>
                      {formatDateFR(card.eventHint.date)}
                      {card.eventHint.time ? ` à ${card.eventHint.time}` : ''}
                    </Text>
                  </Pressable>
                  <Pressable disabled={disabled} onPress={() => clearEventDate(card.cardId)} hitSlop={8} accessibilityLabel="Retirer l’événement">
                    <Ionicons name="close-circle-outline" size={18} color={theme.inkSoft} />
                  </Pressable>
                </View>

                {/* Action secondaire — ajoute/retire UNIQUEMENT l'heure, jamais la date. "+ Ajouter
                    une heure" écrit une valeur par défaut RÉELLEMENT (12:00, via applyEventTimeChange)
                    AVANT d'ouvrir le picker iOS — même correctif "seed confirmée" que les pickers
                    existants (jamais un cadran affiché sans valeur déjà enregistrée derrière). Sur
                    Android, ne préremplit RIEN avant ouverture : le dialog natif ne commet que sur son
                    propre bouton OK — préremplir avant risquerait de laisser une heure fantôme si
                    l'utilisateur annule le dialog. */}
                <Pressable
                  disabled={disabled}
                  onPress={() => {
                    if (card.eventHint?.time) {
                      setCards((prev) => clearEventTime(prev, card.cardId));
                      if (openPicker?.cardId === card.cardId && (openPicker.kind === 'event' || openPicker.kind === 'eventTime')) {
                        setOpenPicker(null);
                      }
                    } else if (Platform.OS === 'ios') {
                      setCards((prev) => applyEventTimeChange(prev, card.cardId, eventTimePickerSeed(card)));
                      setOpenPicker({ cardId: card.cardId, kind: 'event' });
                    } else {
                      setOpenPicker({ cardId: card.cardId, kind: 'eventTime' });
                    }
                  }}
                  style={{ marginTop: 6 }}
                  hitSlop={6}
                >
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
                    {card.eventHint.time ? 'Retirer l’heure' : '+ Ajouter une heure'}
                  </Text>
                </Pressable>

                {/* Contrôle UNIQUE iOS — rendu INLINE dans la carte, comme le rappel (voir le bloc
                    reminderDateTime plus bas). `onChange` n'appelle jamais `setOpenPicker` : ne ferme
                    jamais la roulette, seul le tap sur le champ ou "Terminé" le fait (EXCLUSIVITÉ :
                    openPicker est une valeur UNIQUE pour tout l'écran — en ouvrir un referme
                    automatiquement tout autre picker précédemment ouvert, quelle que soit sa carte). */}
                {Platform.OS === 'ios' && openPicker?.cardId === card.cardId && openPicker.kind === 'event' ? (
                  <>
                    <DateTimePicker
                      value={card.eventHint.time ? eventTimePickerSeed(card) : eventDatePickerSeed(card)}
                      mode={card.eventHint.time ? 'datetime' : 'date'}
                      display="spinner"
                      locale={IOS_PICKER_LOCALE}
                      is24Hour
                      onChange={(_, selected) => {
                        if (selected) setCards((prev) => applyEventChange(prev, card.cardId, selected));
                      }}
                      style={{ marginTop: 8 }}
                    />
                    <Pressable onPress={() => setOpenPicker(null)} style={styles.pickerDoneBtn} hitSlop={8}>
                      <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Terminé</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Rappel */}
            <View style={[styles.reminderRow, { marginTop: 12 }]}>
              <Text style={[styles.fieldLabel, { color: theme.inkSoft, marginBottom: 0 }]}>ME LE RAPPELER</Text>
              <Switch
                value={card.reminderEnabled}
                onValueChange={(v) => toggleReminder(card.cardId, v)}
                disabled={disabled}
                trackColor={{ false: theme.paperDim, true: theme.accent }}
                thumbColor="#fff"
              />
            </View>
            {card.reminderEnabled ? (
              // CHANTIER POLISH — hiérarchie/zones tactiles (2026-09-18) : marge légèrement accrue
              // (8 → 12) sous le toggle "ME LE RAPPELER" — éloigne la première zone tactile (Date de
              // début, désormais une ligne entière avec minHeight:44) du Switch au-dessus.
              <View style={{ marginTop: 12 }}>
                {card.recurrenceDraft.enabled ? (
                  // CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18) : état compact, 4 lignes au
                  // plus (Date de début / Heure / Répétition / Fin — cette dernière SEULEMENT si une
                  // borne existe déjà, voir recurrenceEndLabel). "Date de début"/"Heure" RÉUTILISENT
                  // exactement les pickers existants (même chip iOS combiné, mêmes kinds Android
                  // 'reminderDate'/'reminderTime') — seul l'affichage devient deux lignes indépendantes
                  // (nécessaire pour le cas critique "date manquante, heure connue", qu'un chip combiné
                  // unique ne peut pas représenter séparément). Aucune valeur "À définir"/"À préciser"
                  // n'est un warning : couleur accent (le violet Pensif, jamais le corail d'alerte),
                  // simplement plus interactive.
                  <View style={{ marginTop: 4 }}>
                    <Pressable
                      disabled={disabled}
                      onPress={() => (Platform.OS === 'ios' ? openReminderDateTimePicker(card.cardId) : setOpenPicker({ cardId: card.cardId, kind: 'reminderDate' }))}
                      style={styles.recurrenceFieldRow}
                    >
                      <Text style={[styles.fieldLabel, { color: theme.inkSoft, marginTop: 0 }]}>DATE DE DÉBUT</Text>
                      <Text style={{ color: card.reminderDate ? theme.ink : theme.accent, fontSize: 13, fontWeight: '700' }}>
                        {recurrenceStartDateLabel(card.reminderDate)}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={disabled}
                      onPress={() => (Platform.OS === 'ios' ? openReminderDateTimePicker(card.cardId) : setOpenPicker({ cardId: card.cardId, kind: 'reminderTime' }))}
                      style={[styles.recurrenceFieldRow, { marginTop: 10 }]}
                    >
                      <Text style={[styles.fieldLabel, { color: theme.inkSoft, marginTop: 0 }]}>HEURE</Text>
                      <Text style={{ color: card.reminderTime ? theme.ink : theme.accent, fontSize: 13, fontWeight: '700' }}>
                        {recurrenceTimeLabel(card.reminderTime)}
                      </Text>
                    </Pressable>
                    {/* Même roulette combinée que le rappel ponctuel (iOS) — un tap sur Date de début
                        OU Heure l'ouvre indifféremment, voir commentaire ci-dessus. */}
                    {Platform.OS === 'ios' && openPicker?.cardId === card.cardId && openPicker.kind === 'reminderDateTime' ? (
                      <>
                        <DateTimePicker
                          value={reminderPickerSeed(card)}
                          mode="datetime"
                          display="spinner"
                          locale={IOS_PICKER_LOCALE}
                          is24Hour
                          onChange={(_, selected) => {
                            if (selected) setCards((prev) => applyReminderDateTimeChange(prev, card.cardId, selected));
                          }}
                          style={{ marginTop: 8 }}
                        />
                        <Pressable onPress={() => setOpenPicker(null)} style={styles.pickerDoneBtn} hitSlop={8}>
                          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Terminé</Text>
                        </Pressable>
                      </>
                    ) : null}

                    <Pressable
                      disabled={disabled}
                      onPress={() => setRecurrenceEditor({ cardId: card.cardId, mode: 'frequency' })}
                      style={[styles.recurrenceFieldRow, { marginTop: 10 }]}
                    >
                      <Text style={[styles.fieldLabel, { color: theme.inkSoft, marginTop: 0 }]}>RÉPÉTITION</Text>
                      <Text style={{ color: needsRecurrenceFrequency(card) ? theme.accent : theme.ink, fontSize: 13, fontWeight: '700' }}>
                        {recurrenceFrequencyLabel(card.recurrenceDraft)}
                      </Text>
                    </Pressable>
                    {recurrenceEndLabel(card.recurrenceDraft) ? (
                      <Pressable
                        disabled={disabled}
                        onPress={() => setRecurrenceEditor({ cardId: card.cardId, mode: 'end' })}
                        style={[styles.recurrenceFieldRow, { marginTop: 10 }]}
                      >
                        <Text style={[styles.fieldLabel, { color: theme.inkSoft, marginTop: 0 }]}>FIN</Text>
                        <Text style={{ color: theme.ink, fontSize: 13, fontWeight: '700' }}>{recurrenceEndLabel(card.recurrenceDraft)}</Text>
                      </Pressable>
                    ) : null}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <Pressable disabled={disabled} onPress={() => setRecurrenceEditor({ cardId: card.cardId, mode: 'end' })} hitSlop={8}>
                        <Text style={{ color: theme.inkSoft, fontSize: 12, fontWeight: '600' }}>Modifier la fin</Text>
                      </Pressable>
                      <Pressable disabled={disabled} onPress={() => handleToggleRecurrence(card.cardId, false)} hitSlop={8}>
                        <Text style={{ color: theme.inkSoft, fontSize: 12, fontWeight: '600' }}>Ne plus répéter</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    {Platform.OS === 'ios' ? (
                      <>
                        {(() => {
                          const isThisCardOpen = openPicker?.cardId === card.cardId && openPicker.kind === 'reminderDateTime';
                          return (
                            <>
                              <Pressable
                                disabled={disabled}
                                // CORRECTIF picker iOS (2026-09-17) — TOGGLE explicite (voir
                                // toggleReminderDateTimePicker dans captureReview.ts) : un second tap sur le
                                // champ déjà ouvert (pour CETTE carte) referme la roulette (ex. ouverte par
                                // erreur), plutôt que de se contenter d'écraser un `openPicker` déjà identique
                                // (ce qui la laissait ouverte sans jamais permettre de la refermer au clic).
                                // CORRECTIF seed non confirmée (2026-09-18) — voir openReminderDateTimePicker :
                                // l'ouverture (pas la fermeture) écrit désormais immédiatement la valeur affichée.
                                onPress={() => openReminderDateTimePicker(card.cardId)}
                                style={[styles.dateChip, { borderColor: theme.line, backgroundColor: theme.paperDim, alignSelf: 'flex-start' }]}
                              >
                                <Ionicons name="time-outline" size={14} color={theme.ink} />
                                <Text style={{ color: theme.ink, fontSize: 12, fontWeight: '600' }}>
                                  {card.reminderDate && card.reminderTime
                                    ? `${pad2(card.reminderDate.day)}/${pad2(card.reminderDate.month + 1)}/${card.reminderDate.year} à ${pad2(card.reminderTime.hour)}:${pad2(card.reminderTime.minute)}`
                                    : 'Choisir une date et une heure'}
                                </Text>
                              </Pressable>
                              {/* CORRECTIF picker iOS (2026-09-17) — rendu INLINE dans la carte (et non plus
                                  via le DateTimePickerHost partagé monté en bas de l'écran) : en mode
                                  `display="spinner"`, iOS peint le picker à l'endroit exact où il est monté
                                  dans l'arbre, jamais en overlay/modal. Le monter tout en bas pour N cartes
                                  l'éloignait donc visuellement de la carte concernée. Un seul `openPicker`
                                  possible à la fois (state partagé, inchangé) : ouvrir celui d'une autre
                                  carte referme automatiquement celui-ci (sa condition `isThisCardOpen`
                                  devient fausse).
                                  CORRECTIF (2026-09-17) — `onChange` n'appelle PLUS `setOpenPicker(null)` :
                                  la roulette iOS déclenche `onChange` à CHAQUE segment (jour/heure/minute)
                                  tourné, pas seulement à la fin. La fermer à chaque fois empêchait toute
                                  modification successive (elle se refermait après le premier segment
                                  touché). Le picker ne se ferme donc plus que par le toggle du Pressable
                                  ci-dessus — jamais automatiquement depuis une sélection. */}
                              {isThisCardOpen ? (
                                <>
                                  <DateTimePicker
                                    value={reminderPickerSeed(card)}
                                    mode="datetime"
                                    display="spinner"
                                    locale={IOS_PICKER_LOCALE}
                                    is24Hour
                                    onChange={(_, selected) => {
                                      if (selected) setCards((prev) => applyReminderDateTimeChange(prev, card.cardId, selected));
                                    }}
                                    style={{ marginTop: 8 }}
                                  />
                                  <Pressable onPress={() => setOpenPicker(null)} style={styles.pickerDoneBtn} hitSlop={8}>
                                    <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Terminé</Text>
                                  </Pressable>
                                </>
                              ) : null}
                            </>
                          );
                        })()}
                      </>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          disabled={disabled}
                          onPress={() => setOpenPicker({ cardId: card.cardId, kind: 'reminderDate' })}
                          style={[styles.dateChip, { flex: 1, borderColor: theme.line, backgroundColor: theme.paperDim }]}
                        >
                          <Ionicons name="calendar-outline" size={14} color={theme.ink} />
                          <Text style={{ color: theme.ink, fontSize: 12, fontWeight: '600' }}>
                            {card.reminderDate ? `${pad2(card.reminderDate.day)}/${pad2(card.reminderDate.month + 1)}/${card.reminderDate.year}` : 'Date'}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={disabled}
                          onPress={() => setOpenPicker({ cardId: card.cardId, kind: 'reminderTime' })}
                          style={[styles.dateChip, { flex: 1, borderColor: theme.line, backgroundColor: theme.paperDim }]}
                        >
                          <Ionicons name="time-outline" size={14} color={theme.ink} />
                          <Text style={{ color: theme.ink, fontSize: 12, fontWeight: '600' }}>
                            {card.reminderTime ? `${pad2(card.reminderTime.hour)}:${pad2(card.reminderTime.minute)}` : 'Heure'}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                    {!card.reminderTime ? (
                      <Text style={[styles.warnHint, { color: theme.plum }]}>Choisis une heure pour activer ce rappel.</Text>
                    ) : null}
                    {/* CHANTIER UX RÉCURRENCE — incrément 4 (2026-09-18) : activation MANUELLE sur un
                        rappel ponctuel — n'invente jamais de motif (toggleRecurrence active la
                        récurrence avec frequency=null, voir captureReview.ts), l'utilisateur choisit
                        ensuite explicitement via la ligne RÉPÉTITION qui apparaît alors. */}
                    <Pressable disabled={disabled} onPress={() => handleToggleRecurrence(card.cardId, true)} style={{ marginTop: 10 }} hitSlop={8}>
                      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>Répéter ce rappel</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}

            {card.status === 'failed' && card.saveError ? (
              <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>Échec de l’enregistrement</Text>
                <Text style={{ color: theme.danger, fontSize: 12 }}>{card.saveError}</Text>
              </View>
            ) : null}

            {/* CHANTIER POLISH — hiérarchie des actions (2026-09-18), PUREMENT VISUEL : avec une
                seule carte, "Supprimer"/"Enregistrer" (+ leur séparateur, le borderTopWidth de
                styles.cardActions) sont redondants avec le CTA global "Faire confiance à Pensif" —
                masqués uniquement dans ce cas, aucun handler/protection anti-double-tap retiré
                (handleDiscard/handleSaveCard restent strictement inchangés, simplement pas rendus
                ici). Dès 2 cartes, comportement strictement identique à avant ce chantier. */}
            {cards.length >= 2 ? (
              <View style={[styles.cardActions, { borderTopColor: theme.line }]}>
                <Pressable disabled={disabled} onPress={() => handleDiscard(card.cardId)} style={styles.cardActionBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={15} color={theme.danger} />
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>Supprimer</Text>
                </Pressable>
                {card.status !== 'saved' ? (
                  <Pressable
                    disabled={!cardValid || card.status === 'saving'}
                    onPress={() => handleSaveCard(card.cardId)}
                    style={[styles.cardActionBtn, styles.cardActionBtnPrimary, { backgroundColor: theme.accentTint, opacity: !cardValid || card.status === 'saving' ? 0.4 : 1 }]}
                    hitSlop={8}
                  >
                    <Ionicons name="checkmark-outline" size={15} color={theme.accent} />
                    <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>
                      {card.status === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {/* UN SEUL picker partagé par toutes les cartes (jamais un par carte) — voir
          contactPickerCardId plus haut. */}
      <ContactPicker
        visible={contactPickerCardId !== null}
        contacts={contacts}
        theme={theme}
        title="Choisir un proche"
        onSelect={(id) => {
          if (contactPickerCardId) selectContact(contactPickerCardId, id);
          setContactPickerCardId(null);
        }}
        onClose={() => setContactPickerCardId(null)}
      />

      {/* UN SEUL éditeur de récurrence partagé (même principe que ContactPicker ci-dessus) — voir
          recurrenceEditor plus haut. */}
      {(() => {
        const targetCard = recurrenceEditor ? cards.find((c) => c.cardId === recurrenceEditor.cardId) : undefined;
        return (
          <RecurrenceEditorSheet
            visible={!!recurrenceEditor && !!targetCard}
            mode={recurrenceEditor?.mode ?? 'frequency'}
            theme={theme}
            frequency={targetCard?.recurrenceDraft.frequency ?? null}
            daysOfWeek={targetCard?.recurrenceDraft.daysOfWeek ?? []}
            occurrenceCount={targetCard?.recurrenceDraft.occurrenceCount ?? null}
            untilDate={targetCard?.recurrenceDraft.untilDate ?? null}
            startDate={targetCard?.reminderDate ?? null}
            onClose={() => setRecurrenceEditor(null)}
            onChooseFrequency={(frequency) => recurrenceEditor && handleChooseRecurrenceFrequency(recurrenceEditor.cardId, frequency)}
            onToggleDay={(day) => recurrenceEditor && handleToggleRecurrenceDay(recurrenceEditor.cardId, day)}
            onChooseNever={() => recurrenceEditor && handleChooseRecurrenceNever(recurrenceEditor.cardId)}
            onChooseOccurrenceCount={(count) => recurrenceEditor && handleChooseRecurrenceCount(recurrenceEditor.cardId, count)}
            onChooseUntilDate={(date) => recurrenceEditor && handleChooseRecurrenceUntilDate(recurrenceEditor.cardId, date)}
          />
        );
      })()}

      {hasPendingCards ? (
        <View style={{ marginTop: 8, marginBottom: hasPendingCards ? 12 : 20 }}>
          <PrimaryButton label="Faire confiance à Pensif" onPress={handleSaveAll} />
          {!canSubmitAll ? (
            <Text style={[styles.warnHint, { color: theme.inkSoft, textAlign: 'center', marginTop: 6 }]}>
              Complète ou supprime les cartes signalées pour continuer.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* "Nouvelle capture" (§2 chantier UX enchaînement) — toujours visible en Review, que des
          cartes restent en attente ou non, pour ne jamais forcer un retour arrière + re-recherche du
          bouton micro juste pour redicter une phrase. Confirmation gérée dans handleNewCapture(). */}
      <View style={{ marginBottom: 20 }}>
        <PrimaryButton label="Nouvelle capture" onPress={handleNewCapture} variant="secondary" />
      </View>
      </Animated.View>

      {/* Pickers natifs — un seul actif à la fois (openPicker), fermé automatiquement après usage.
          Exception : le rappel (reminderDateTime) ET la date d'événement (eventDate) sur iOS sont
          désormais rendus INLINE dans leur carte (voir plus haut) plutôt qu'ici, pour rester
          visuellement associés à la bonne pensée — ne pas les monter une seconde fois ici. Android
          continue de passer par ce host partagé pour les deux (dialog natif, la position ne compte
          pas). */}
      {openPicker &&
      !(Platform.OS === 'ios' && (openPicker.kind === 'reminderDateTime' || openPicker.kind === 'event' || openPicker.kind === 'eventDate' || openPicker.kind === 'eventTime')) ? (
        <DateTimePickerHost
          openPicker={openPicker}
          cards={cards}
          onClose={() => setOpenPicker(null)}
          onEventDate={setEventDate}
          onEventTime={setEventTimePart}
          onReminderDateTime={setReminderDateTime}
          onReminderDate={setReminderDatePart}
          onReminderTime={setReminderTimePart}
        />
      ) : null}
    </Screen>
  );
}

/** Isole le rendu conditionnel des pickers natifs (Android : composant monté = picker ouvert ; iOS :
 *  toujours monté en mode spinner tant qu'un picker est demandé) — évite de dupliquer cette logique
 *  pour chacun des 3 usages (event/reminderDate/reminderTime/reminderDateTime). */
function DateTimePickerHost({
  openPicker,
  cards,
  onClose,
  onEventDate,
  onEventTime,
  onReminderDateTime,
  onReminderDate,
  onReminderTime,
}: {
  // `PickerKind` complet accepté pour la sûreté de type de l'appelant (`openPicker` est typé
  // `OpenPicker`, qui inclut `'event'`) — mais `'event'` (contrôle iOS UNIQUE) n'atteint jamais ce
  // composant en pratique : toujours exclu par la condition de rendu (voir plus haut, "!(Platform.OS
  // === 'ios' && ... openPicker.kind === 'event' ...)"), rendu INLINE dans la carte à la place.
  openPicker: { cardId: string; kind: 'reminderDate' | 'reminderTime' | 'reminderDateTime' | 'event' | 'eventDate' | 'eventTime' };
  cards: CaptureCard[];
  onClose: () => void;
  onEventDate: (cardId: string, date: Date) => void;
  onEventTime: (cardId: string, date: Date) => void;
  onReminderDateTime: (cardId: string, date: Date) => void;
  onReminderDate: (cardId: string, date: Date) => void;
  onReminderTime: (cardId: string, date: Date) => void;
}) {
  const card = cards.find((c) => c.cardId === openPicker.cardId);
  if (!card) return null;

  const seed =
    openPicker.kind === 'eventDate' && card.eventHint?.date
      ? (() => {
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(card.eventHint!.date!);
          return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
        })()
      : openPicker.kind === 'eventTime'
      ? eventTimePickerSeed(card)
      : reminderPickerSeed(card);

  const mode =
    openPicker.kind === 'eventDate' || openPicker.kind === 'reminderDate'
      ? 'date'
      : openPicker.kind === 'reminderTime' || openPicker.kind === 'eventTime'
      ? 'time'
      : 'datetime';

  function handleChange(_: unknown, selected?: Date) {
    onClose();
    if (!selected) return;
    if (openPicker.kind === 'eventDate') onEventDate(openPicker.cardId, selected);
    else if (openPicker.kind === 'eventTime') onEventTime(openPicker.cardId, selected);
    else if (openPicker.kind === 'reminderDateTime') onReminderDateTime(openPicker.cardId, selected);
    else if (openPicker.kind === 'reminderDate') onReminderDate(openPicker.cardId, selected);
    else onReminderTime(openPicker.cardId, selected);
  }

  return (
    <DateTimePicker
      value={seed}
      mode={mode}
      display={Platform.OS === 'ios' ? 'spinner' : mode === 'time' ? 'clock' : 'calendar'}
      is24Hour
      onChange={handleChange}
    />
  );
}

/**
 * Le logo Pensif (P blanc, `assets/logo-mark.png`) — TOUJOURS affiché, jamais remplacé par une
 * icône cœur (voir consigne). Le cœur intégré au P est une découpe TRANSPARENTE dans ce fichier
 * (vérifié par flood-fill du canal alpha — voir HEART_HOLE plus haut, aucun cœur peint en dur) :
 * un simple rectangle rouge posé DERRIÈRE le P, à la position exacte de cette découpe, suffit donc
 * à "remplir le cœur" — le P par-dessus masque automatiquement tout ce qui dépasse de la silhouette
 * réelle du cœur. Le rouge grandit du bas vers le haut (bottom fixe, height animée) — trait
 * horizontal simple, sans décoration de vague (retiré à la demande du 2026-09-13).
 */
function LogoWithHeart({ progress, fillColor }: { progress: Animated.Value; fillColor: string }) {
  const fillHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [0, HEART_HOLE.height] });
  return (
    <View style={styles.logoBox}>
      <Animated.View
        style={{
          position: 'absolute',
          left: HEART_HOLE.left,
          bottom: LOGO_HEIGHT - (HEART_HOLE.top + HEART_HOLE.height),
          width: HEART_HOLE.width,
          height: fillHeight,
          backgroundColor: fillColor,
        }}
      />
      <Image source={require('../../assets/logo-mark.png')} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Toujours utilisé par l'écran d'erreur (centrage classique, pas de repositionnement demandé
  // pour cet état) — voir pushToTalkContainer pour idle/listening/processing.
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  // Pas de justifyContent:'center' ici : la position verticale du bouton est pilotée par les deux
  // View flex (0.8 / 1.4) placées autour de lui dans le JSX — responsive à toute hauteur d'écran,
  // jamais une coordonnée figée.
  // paddingBottom appliqué au cas par cas (insets.bottom + marge, voir JSX) : `Screen` ne fait
  // l'inset de sécurité que sur le haut (`edges:['top']`), le bas touche donc le bord physique sans
  // ce complément — c'était ce qui collait le texte de confidentialité trop près du bord.
  pushToTalkContainer: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  buttonWrap: { width: BUTTON_SIZE + 120, height: BUTTON_SIZE + 120, alignItems: 'center', justifyContent: 'center' },
  // Glow à deux couches (halo extérieur large et très doux + halo intérieur plus resserré et un peu
  // plus visible) pour approcher un flou radial façon mockup, sans dépendance supplémentaire.
  haloOuter: { position: 'absolute', width: BUTTON_SIZE * 1.38, height: BUTTON_SIZE * 1.38, borderRadius: (BUTTON_SIZE * 1.38) / 2, opacity: 0.1 },
  haloInner: { position: 'absolute', width: BUTTON_SIZE * 1.14, height: BUTTON_SIZE * 1.14, borderRadius: (BUTTON_SIZE * 1.14) / 2, opacity: 0.22 },
  // Disque plein (pas un simple contour) : au scale/opacity de départ, se fond avec le bouton —
  // c'est la variation d'opacity qui donne l'impression d'onde, pas un anneau creux qui grossirait.
  ripple: { position: 'absolute' },
  // Anneau CREUX de taille fixe (PROCESSING uniquement) — voir commentaire au point d'usage :
  // distinct des ripples (disques pleins, grandissent, boucle décalée) et du halo (opacité fixe).
  thinkingRing: {
    position: 'absolute',
    width: BUTTON_SIZE * 1.22,
    height: BUTTON_SIZE * 1.22,
    borderRadius: (BUTTON_SIZE * 1.22) / 2,
    borderWidth: 4,
    // Seuls deux bords adjacents reçoivent une couleur (voir JSX — borderTopColor/borderRightColor
    // = theme.accent) ; les deux autres restent transparents ici, ce qui forme un ARC net qui, une
    // fois mis en rotation continue, se lit sans ambiguïté comme "en cours de traitement" — jamais
    // confondu avec un état figé, contrairement à une simple variation d'opacité.
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  buttonHitArea: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2 },
  gradientCircle: { flex: 1, borderRadius: BUTTON_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  logoBox: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT, position: 'absolute', top: 0, left: 0 },
  title: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  duration: { fontSize: 13, marginTop: 18, fontVariant: ['tabular-nums'] },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, justifyContent: 'center', width: '100%' },
  privacyText: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  reviewTranscriptLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  reviewTranscript: { fontSize: 13, fontStyle: 'italic', marginBottom: 18, lineHeight: 18 },
  // Bordure fine et neutre par défaut (jamais rouge/corail — voir §13) ; le fond légèrement distinct
  // (theme.card vs theme.paper de l'écran) suffit à faire "carte", pas besoin d'un contour appuyé.
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20, marginBottom: 4 },
  savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 60, textAlignVertical: 'top', fontSize: 14 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 12, marginBottom: 7 },
  fuzzyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  fuzzyHint: { fontSize: 12 },
  chipsRow: { paddingRight: 8, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 36,
    justifyContent: 'center',
  },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // CHANTIER POLISH — hiérarchie/zones tactiles (2026-09-18) : ligne ENTIÈRE cliquable (label +
  // valeur), pas seulement le texte de droite — `minHeight: 44` vise la cible tactile recommandée
  // sans agrandir visuellement le contenu (`paddingVertical` modéré, la ligne reste compacte à
  // l'écran, seule sa zone de tap grandit). Utilisée UNIQUEMENT pour Date de début/Heure/Répétition/
  // Fin (bloc récurrent) — jamais pour le toggle "ME LE RAPPELER" lui-même, qui reste une zone
  // strictement indépendante (Switch séparé, aucun chevauchement).
  recurrenceFieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingVertical: 8 },
  warnHint: { fontSize: 11, marginTop: 6 },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  cardActionBtnPrimary: { paddingVertical: 8 },
  // CHANTIER UNIFICATION UX PICKERS iOS (2026-09-18) — action discrète "Terminé" associée à un
  // picker iOS inline visible (ferme SEULEMENT le picker, aucune modification de donnée).
  pickerDoneBtn: { alignSelf: 'flex-end', marginTop: 4, paddingVertical: 6, paddingHorizontal: 4 },
});
