import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
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
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { RootStackParamList } from '../navigation/types';
import { uploadAudioForCapture, CaptureApiError } from '../lib/captureApi';
import { matchContactByHeardName } from '../data/contactMatching';
import { toLocalDateTimeParts } from '../data/reminderDate';
import { isPressTooShort } from '../data/pushToTalk';
import { isCaptureExploitable } from '../data/captureExploitability';
import { VoiceActivityAccumulator } from '../data/voiceActivity';
import {
  CaptureCard,
  LocalDate,
  buildInitialCards,
  buildPenseeFromCard,
  canSaveAll,
  discardCard,
  isCardValid,
  markFailed,
  markSaved,
  markSaving,
  needsReview,
} from '../data/captureReview';

type Phase = 'idle' | 'listening' | 'processing' | 'review' | 'error' | 'unclear' | 'silence';

// Bouton principal ~3-4x plus grand que l'ancien micro (84px) — voir mockup validé.
const BUTTON_SIZE = 280;

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
  const [openPicker, setOpenPicker] = useState<{ cardId: string; kind: 'reminderDate' | 'reminderTime' | 'reminderDateTime' | 'eventDate' } | null>(null);

  // Respiration douce du bouton — active pendant l'écoute (léger, réagit au niveau audio via
  // `level` ci-dessous) ET pendant le traitement (animation "douce de processing" demandée).
  const pulse = useRef(new Animated.Value(1)).current;
  // Niveau audio normalisé (0..1), piloté par le vrai metering expo-audio — voir l'effet dédié plus
  // bas. Anime les anneaux autour du bouton pendant l'écoute.
  const level = useRef(new Animated.Value(0)).current;
  // Progression du remplissage du cœur (0..1), pilotée par la durée d'enregistrement — purement
  // visuel, aucune lecture de cette valeur par la logique métier.
  const heartFill = useRef(new Animated.Value(0)).current;
  // Entrée de l'écran Review (fade + léger slide vertical, Animated natif uniquement) — jamais de
  // flash brutal quand le backend répond.
  const reviewEntrance = useRef(new Animated.Value(0)).current;

  // Refs (pas de state) pour le geste press-and-hold : lues/écrites en dehors du cycle de rendu,
  // sans provoquer ni attendre de re-rendu — indispensable pour départager correctement un
  // relâchement survenu PENDANT la séquence asynchrone de démarrage (permission/prepare).
  const pressStartRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const busyRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Respiration du bouton/halo : UNIQUEMENT pendant PROCESSING ("animation très légère possible sur
  // le halo/bouton" demandée pour cet état précis) — jamais pendant l'écoute (où seuls les anneaux
  // pilotés par le vrai niveau audio doivent bouger, voir plus bas) ni au repos.
  useEffect(() => {
    if (phase !== 'processing') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // seuil anti-tap (>=400ms) mais sans voix réelle détectée (silence, bruit lointain) ne doit
    // JAMAIS être envoyé au backend : ni uploadAudioForCapture, ni donc Groq — cas réel corrigé,
    // le STT "hallucinait" une phrase sur du silence maintenu plusieurs secondes.
    if (!voiceActivityRef.current.hasDetectedVoice()) {
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
      // Garde-fou "aucune parole exploitable" — AVANT toute carte/sauvegarde : du bruit transcrit
      // en texte incohérent (ou une capture vide/hors-français) ne doit jamais atteindre Review.
      if (!isCaptureExploitable(result)) {
        setPhase('unclear');
        return;
      }
      setTranscript(result.transcript);
      setCards(buildInitialCards(result, (heard) => matchContactByHeardName(heard, contacts)));
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
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        handlePressIn();
      },
      onPanResponderMove: () => {},
      onPanResponderRelease: () => {
        handlePressOut();
      },
      onPanResponderTerminate: () => {
        // Interruption système (appel entrant, alerte, etc.) — traité comme un relâchement réel,
        // jamais un recorder laissé actif silencieusement.
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
    patchCard(cardId, { contactId, contactMatch: contactId ? { kind: 'exact', contactId } : { kind: 'none' } });
  }

  function clearEventDate(cardId: string) {
    patchCard(cardId, { eventHint: null });
  }

  function setEventDate(cardId: string, date: Date) {
    const card = cards.find((c) => c.cardId === cardId);
    patchCard(cardId, { eventHint: { date: formatDateISO(date), heardExpression: card?.eventHint?.heardExpression ?? null } });
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

  function handleDiscard(cardId: string) {
    const next = discardCard(cards, cardId);
    setCards(next);
    if (next.length === 0) navigation.goBack();
  }

  function saveOne(card: CaptureCard): CaptureCard[] {
    let next = markSaving(cards, card.cardId);
    try {
      addPensee(buildPenseeFromCard(card));
      next = markSaved(next, card.cardId);
    } catch (e) {
      next = markFailed(next, card.cardId, e instanceof Error ? e.message : String(e));
    }
    return next;
  }

  function handleSaveCard(cardId: string) {
    const card = cards.find((c) => c.cardId === cardId);
    if (!card || !isCardValid(card)) return;
    setCards(saveOne(card));
  }

  function handleSaveAll() {
    if (!canSaveAll(cards)) return;
    let next = cards;
    let allOk = true;
    for (const card of cards.filter((c) => c.status === 'pending')) {
      let step = markSaving(next, card.cardId);
      try {
        addPensee(buildPenseeFromCard(card));
        step = markSaved(step, card.cardId);
      } catch (e) {
        step = markFailed(step, card.cardId, e instanceof Error ? e.message : String(e));
        allOk = false;
      }
      next = step;
    }
    setCards(next);
    if (allOk) navigation.goBack();
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
                approchent un flou radial sans dépendance supplémentaire. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.haloOuter, { backgroundColor: theme.accent, transform: [{ scale: pulse }] }]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.haloInner, { backgroundColor: theme.accent, transform: [{ scale: pulse }] }]}
            />
            {/* Anneaux d'onde — présents mais parfaitement immobiles au repos (level reste à 0 hors
                écoute, voir l'effet dédié) : seule l'écoute les anime, avec le VRAI niveau audio,
                jamais de fausse réaction périodique. Trois anneaux, plus espacés (façon mockup). */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: BUTTON_SIZE + 32,
                  height: BUTTON_SIZE + 32,
                  borderRadius: (BUTTON_SIZE + 32) / 2,
                  borderColor: theme.accent,
                  transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
                  opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.65] }),
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: BUTTON_SIZE + 68,
                  height: BUTTON_SIZE + 68,
                  borderRadius: (BUTTON_SIZE + 68) / 2,
                  borderColor: theme.accent,
                  transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] }) }],
                  opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.5] }),
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  width: BUTTON_SIZE + 110,
                  height: BUTTON_SIZE + 110,
                  borderRadius: (BUTTON_SIZE + 110) / 2,
                  borderColor: theme.accent,
                  transform: [{ scale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
                  opacity: level.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.34] }),
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
          </View>
          {isListening ? (
            <Text style={[styles.duration, { color: theme.inkSoft }]}>{(recorderState.durationMillis / 1000).toFixed(0)}s</Text>
          ) : (
            <View style={{ height: 13 + 18 }} />
          )}
          {/* Plus petit que le spacer du dessus (flex:1) : remonte le texte de confidentialité
              nettement au-dessus du bord, sans le recoller au bouton. */}
          <View style={{ flex: 0.55 }} />

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
          <Text style={[styles.title, { color: theme.ink, marginTop: 18 }]}>Je réfléchis…</Text>
          <Text style={[styles.subtitle, { color: theme.inkSoft }]}>Pensif organise votre pensée.</Text>
          <View style={{ flex: 1 }} />
          <Animated.View style={[styles.buttonWrap, { transform: [{ scale: pulse }] }]}>
            <Animated.View pointerEvents="none" style={[styles.haloOuter, { backgroundColor: theme.accent }]} />
            <Animated.View pointerEvents="none" style={[styles.haloInner, { backgroundColor: theme.accent }]} />
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
          <View style={{ flex: 0.55 }} />

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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              <Pressable
                disabled={disabled}
                onPress={() => selectContact(card.cardId, null)}
                style={[
                  styles.chip,
                  {
                    borderColor: card.contactId === null ? theme.accent : theme.line,
                    backgroundColor: card.contactId === null ? theme.accentTint : theme.paperDim,
                  },
                ]}
              >
                <Text style={{ color: card.contactId === null ? theme.accent : theme.inkSoft, fontWeight: '700', fontSize: 12 }}>Aucun</Text>
              </Pressable>
              {contacts.map((c) => {
                const selected = card.contactId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    disabled={disabled}
                    onPress={() => selectContact(card.cardId, c.id)}
                    style={[
                      styles.chip,
                      { borderColor: selected ? theme.accent : theme.line, backgroundColor: selected ? theme.accent : theme.paperDim },
                    ]}
                  >
                    {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    <Text style={{ color: selected ? '#fff' : theme.inkSoft, fontWeight: '700', fontSize: 12 }}>{c.prenom}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Événement (informatif, purement daté — indépendant du rappel) */}
            {card.eventHint?.date ? (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.fieldLabel, { color: theme.inkSoft }]}>ÉVÉNEMENT</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    disabled={disabled}
                    onPress={() => setOpenPicker({ cardId: card.cardId, kind: 'eventDate' })}
                    style={[styles.dateChip, { borderColor: theme.line, backgroundColor: theme.paperDim }]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={theme.ink} />
                    <Text style={{ color: theme.ink, fontSize: 12, fontWeight: '600' }}>{formatDateFR(card.eventHint.date)}</Text>
                  </Pressable>
                  <Pressable disabled={disabled} onPress={() => clearEventDate(card.cardId)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={18} color={theme.inkSoft} />
                  </Pressable>
                </View>
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
              <View style={{ marginTop: 8 }}>
                {Platform.OS === 'ios' ? (
                  <Pressable
                    disabled={disabled}
                    onPress={() => setOpenPicker({ cardId: card.cardId, kind: 'reminderDateTime' })}
                    style={[styles.dateChip, { borderColor: theme.line, backgroundColor: theme.paperDim, alignSelf: 'flex-start' }]}
                  >
                    <Ionicons name="time-outline" size={14} color={theme.ink} />
                    <Text style={{ color: theme.ink, fontSize: 12, fontWeight: '600' }}>
                      {card.reminderDate && card.reminderTime
                        ? `${pad2(card.reminderDate.day)}/${pad2(card.reminderDate.month + 1)}/${card.reminderDate.year} à ${pad2(card.reminderTime.hour)}:${pad2(card.reminderTime.minute)}`
                        : 'Choisir une date et une heure'}
                    </Text>
                  </Pressable>
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
              </View>
            ) : null}

            {card.status === 'failed' && card.saveError ? (
              <View style={[styles.errorBox, { borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '700' }}>Échec de l’enregistrement</Text>
                <Text style={{ color: theme.danger, fontSize: 12 }}>{card.saveError}</Text>
              </View>
            ) : null}

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
          </View>
        );
      })}

      {hasPendingCards ? (
        <View style={{ marginTop: 8, marginBottom: 20 }}>
          <PrimaryButton label="Faire confiance à Pensif" onPress={handleSaveAll} />
          {!canSubmitAll ? (
            <Text style={[styles.warnHint, { color: theme.inkSoft, textAlign: 'center', marginTop: 6 }]}>
              Complète ou supprime les cartes signalées pour continuer.
            </Text>
          ) : null}
        </View>
      ) : null}
      </Animated.View>

      {/* Pickers natifs — un seul actif à la fois (openPicker), fermé automatiquement après usage. */}
      {openPicker ? (
        <DateTimePickerHost
          openPicker={openPicker}
          cards={cards}
          onClose={() => setOpenPicker(null)}
          onEventDate={setEventDate}
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
  onReminderDateTime,
  onReminderDate,
  onReminderTime,
}: {
  openPicker: { cardId: string; kind: 'reminderDate' | 'reminderTime' | 'reminderDateTime' | 'eventDate' };
  cards: CaptureCard[];
  onClose: () => void;
  onEventDate: (cardId: string, date: Date) => void;
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
      : reminderPickerSeed(card);

  const mode = openPicker.kind === 'eventDate' || openPicker.kind === 'reminderDate' ? 'date' : openPicker.kind === 'reminderTime' ? 'time' : 'datetime';

  function handleChange(_: unknown, selected?: Date) {
    onClose();
    if (!selected) return;
    if (openPicker.kind === 'eventDate') onEventDate(openPicker.cardId, selected);
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
  ring: { position: 'absolute', borderWidth: 1.5 },
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
  warnHint: { fontSize: 11, marginTop: 6 },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  cardActionBtnPrimary: { paddingVertical: 8 },
});
