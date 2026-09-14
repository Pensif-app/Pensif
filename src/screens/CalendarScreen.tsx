import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Screen } from '../components/Screen';
import { EventRow } from '../components/EventRow';
import { Dot } from '../components/Dot';
import { PrimaryButton } from '../components/PrimaryButton';
import { DurationWheelPicker } from '../components/WheelPicker';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import {
  addDays,
  daysInMonth,
  formatCustomOffset,
  getDayEvents,
  isPastDate,
  isoOf,
  mondayOf,
  mondayOffset,
  monthAbbrev,
  monthFull,
  periodsInMonth,
  sameDate,
  subtractMinutesLocal,
  weekdayFull,
  weekdayLabels,
} from '../data/calendar';
import { RootStackParamList, TabParamList } from '../navigation/types';
import { ReminderOffset } from '../data/types';
import { Palette } from '../theme/colors';

export function CalendarScreen() {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Calendrier'>>();
  const { contacts, pensees, addPensee, deletePensee, today, userName, themePref } = useStore();
  const isDark = (themePref === 'system' ? systemScheme : themePref) === 'dark';

  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  const [formOpen, setFormOpen] = useState(false);
  const [texte, setTexte] = useState('');
  const [linkedContact, setLinkedContact] = useState<string | null>(null);

  // Mode "Surligner" (feutre) : glisser du doigt sur la grille du mois pour sélectionner une
  // période (vacances, déplacement…) plutôt que de créer une pensée par jour.
  const [highlightMode, setHighlightMode] = useState(false);
  const [dragRange, setDragRange] = useState<{ start: number; end: number } | null>(null);
  const [periodModal, setPeriodModal] = useState<{ start: number; end: number } | null>(null);
  // CHANTIER AUDIT PRÉ-BÊTA §1 — gardes anti-double-tap pour saveThought()/savePeriod(). Contrairement
  // à FicheScreen/PenseeDetailScreen (qui NAVIGUENT hors de l'écran au succès, donc ne libèrent jamais
  // la garde sur ce chemin), ce composant reste MONTÉ après un enregistrement (le formulaire/la modale
  // se referme, l'écran Calendrier persiste) — la garde doit donc être libérée pour permettre une
  // PROCHAINE saisie légitime. Elle est libérée au moment où le formulaire/la modale est RÉOUVERT
  // (voir les points d'usage : bouton "+ Ajouter une pensée" et finalizeDrag), jamais via un
  // setTimeout arbitraire — ce qui protège aussi tout le temps que l'écran reste dans sa transition
  // de fermeture (encore montré, potentiellement encore tapable) après un tap réussi.
  const savingThoughtRef = useRef(false);
  const savingPeriodRef = useRef(false);
  const [periodText, setPeriodText] = useState('');
  const [gridWidth, setGridWidth] = useState(0);

  // Arrivée depuis l'Accueil sur une pensée précise (voir §6 chantier Accueil V1) : amène le
  // calendrier sur le bon mois/jour plutôt que de laisser l'utilisateur le rechercher lui-même.
  // Pas d'écran d'édition dédié pour une pensée dans l'app — la vue "jour sélectionné" ci-dessous
  // (déjà existante) en tient lieu.
  useEffect(() => {
    const focusDate = route.params?.focusDate;
    if (!focusDate) return;
    const [y, m, d] = focusDate.split('-').map((n) => parseInt(n, 10));
    setView({ year: y, month: m - 1 });
    setSelected({ year: y, month: m - 1, day: d });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.focusDate]);
  const periods = useMemo(() => periodsInMonth(pensees, view.year, view.month), [pensees, view]);
  const [customDuration, setCustomDuration] = useState({ weeks: 0, days: 1, hours: 0, minutes: 0 });
  const customOffsetMinutes =
    (customDuration.weeks * 7 + customDuration.days) * 24 * 60 + customDuration.hours * 60 + customDuration.minutes;
  // On ne peut pas se rappeler quelque chose "avant" un délai qui dépasserait la date de
  // l'événement elle-même — le maximum sélectionnable est donc borné par le temps restant, à
  // partir de maintenant (heure locale du téléphone), jusqu'à la fin de ce jour-là (23h59).
  const maxReminderMinutes = Math.max(
    0,
    Math.floor((new Date(selected.year, selected.month, selected.day, 23, 59, 59).getTime() - Date.now()) / 60000),
  );

  // Le rappel est entièrement facultatif et désactivé par défaut (CHANTIER PENSÉES V2) : tant que
  // ce toggle est éteint, aucune date/heure n'est demandée à l'utilisateur ni programmée. Choix
  // rapide du rappel une fois activé : "1" par défaut (la veille) — équivalent au réglage par
  // défaut de l'ancienne roulette seule (weeks:0, days:1). La roulette (DurationWheelPicker) reste
  // disponible mais devient secondaire, affichée seulement derrière "Personnaliser".
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderChoice, setReminderChoice] = useState<ReminderOffset>('1');
  const PRESET_REMINDERS: { key: Exclude<ReminderOffset, 'custom'>; label: string; days: number }[] = [
    { key: '0', label: 'Le jour même', days: 0 },
    { key: '1', label: 'La veille', days: 1 },
    { key: '3', label: '3 jours avant', days: 3 },
    { key: '7', label: '1 semaine avant', days: 7 },
    { key: '14', label: '2 semaines avant', days: 14 },
  ];
  // Même référence que le rappel non-custom réellement programmé (voir rescheduleAllReminders) :
  // 9h le jour choisi, moins N jours — pour qu'un preset désactivé ici corresponde exactement à un
  // preset qui serait de toute façon silencieusement ignoré à la programmation (voir §5/§6).
  function presetReminderDate(days: number): Date {
    const d = new Date(selected.year, selected.month, selected.day, 9, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
  }
  function isPresetPast(days: number): boolean {
    return presetReminderDate(days).getTime() <= Date.now();
  }

  // Tiroir du formulaire : le fond s'assombrit d'un coup (pas d'animation dessus, on l'a demandé
  // ainsi), seule la carte glisse — à l'ouverture, mais aussi à la fermeture (balayage vers le
  // bas ou tap en dehors), avant de démonter réellement la Modal.
  const CARD_OFFSET = 600;
  const cardY = useSharedValue(CARD_OFFSET);
  useEffect(() => {
    if (formOpen) {
      cardY.value = CARD_OFFSET;
      cardY.value = withTiming(0, { duration: 260 });
    }
  }, [formOpen, cardY]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: cardY.value }] }));

  function closeForm() {
    cardY.value = withTiming(CARD_OFFSET, { duration: 200 }, (finished) => {
      if (finished) runOnJS(setFormOpen)(false);
    });
  }

  const sheetPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-9999, 14])
        .failOffsetX([-20, 20])
        .onUpdate((e) => {
          'worklet';
          if (e.translationY > 0) cardY.value = e.translationY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 90 || e.velocityY > 800) {
            runOnJS(closeForm)();
          } else {
            cardY.value = withTiming(0, { duration: 180 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function selectDate(year: number, month: number, day: number) {
    setSelected({ year, month, day });
    setView({ year, month });
  }

  // Petit effet de transition (glisser + fondu) qui révèle le nouveau mois/semaine dans le sens
  // du changement — que ce soit via le swipe ou les flèches.
  const slideX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const TRANSITION_OFFSET = 26;
  function playTransition(direction: 1 | -1) {
    slideX.value = direction * TRANSITION_OFFSET;
    contentOpacity.value = 0.35;
    slideX.value = withTiming(0, { duration: 240 });
    contentOpacity.value = withTiming(1, { duration: 240 });
  }
  const transitionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: contentOpacity.value,
  }));

  function goto(contactId?: string | null) {
    if (contactId) navigation.navigate('Fiche', { contactId });
  }

  // Calendrier étant le dernier onglet, "revenir en arrière" mène toujours à l'onglet précédent —
  // Pensées depuis le CHANTIER ONGLET PENSÉES V1 (Cadeaux n'est plus un onglet, voir RootNavigator).
  function goToPreviousTab() {
    navigation.navigate('Pensées' as never);
  }

  function confirmDeletePensee(penseeId: string) {
    Alert.alert('Supprimer cette pensée ?', 'Elle disparaîtra du calendrier et de l’accueil.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deletePensee(penseeId) },
    ]);
  }

  const monthLabel = monthFull[view.month].charAt(0).toUpperCase() + monthFull[view.month].slice(1) + ' ' + view.year;

  function prev() {
    playTransition(-1);
    if (mode === 'month') {
      let m = view.month - 1;
      let y = view.year;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      const clamped = Math.min(selected.day, daysInMonth(y, m));
      selectDate(y, m, clamped);
    } else {
      const dt = addDays(new Date(selected.year, selected.month, selected.day), -7);
      selectDate(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
  }
  function next() {
    playTransition(1);
    if (mode === 'month') {
      let m = view.month + 1;
      let y = view.year;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      const clamped = Math.min(selected.day, daysInMonth(y, m));
      selectDate(y, m, clamped);
    } else {
      const dt = addDays(new Date(selected.year, selected.month, selected.day), 7);
      selectDate(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
  }

  // Swipe latéral, limité à la zone de la grille/semaine : geste plutôt horizontal (sinon on
  // laisse passer le scroll vertical de l'écran) et suffisamment franc pour ne pas se déclencher
  // par erreur.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .onEnd((e) => {
          'worklet';
          if (Math.abs(e.translationX) < 32) return;
          if (e.translationX < 0) runOnJS(next)();
          else runOnJS(prev)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, view, selected],
  );

  // Le swipe latéral change de page (comme les autres onglets) partout sur cet écran SAUF dans la
  // grille/bande du calendrier, où il change de mois/semaine à la place (geste ci-dessus). Le
  // changement d'onglet natif (swipeEnabled) est désactivé pour tout l'onglet Calendrier — on le
  // reproduit donc ici nous-mêmes. `requireExternalGestureToFail` évite que les deux gestes ne se
  // déclenchent en même temps : sur la grille, celui du calendrier (plus spécifique) est essayé
  // en premier, et celui-ci n'agit que s'il n'a pas été pris — donc jamais dans la zone du
  // calendrier, partout ailleurs sans délai perceptible.
  const pageSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .requireExternalGestureToFail(swipeGesture)
        .onEnd((e) => {
          'worklet';
          if (e.translationX > 40) runOnJS(goToPreviousTab)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [swipeGesture],
  );

  const weeks = useMemo(() => {
    const offset = mondayOffset(view.year, view.month);
    const total = daysInMonth(view.year, view.month);
    const arr: (number | null)[] = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= total; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < arr.length; i += 7) out.push(arr.slice(i, i + 7));
    return out;
  }, [view]);

  const weekDates = useMemo(() => {
    const monday = mondayOf(new Date(selected.year, selected.month, selected.day));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [selected]);

  function beginDrag(day: number) {
    setDragRange({ start: day, end: day });
  }
  function updateDrag(day: number) {
    setDragRange((prev) => (prev ? { start: prev.start, end: day } : { start: day, end: day }));
  }
  function finalizeDrag() {
    setDragRange((prev) => {
      if (prev) {
        const start = Math.min(prev.start, prev.end);
        const end = Math.max(prev.start, prev.end);
        // Laisse le geste de glissement (sur la grille) relâcher complètement la zone tactile
        // avant d'ouvrir la fenêtre — sans ce court délai, le premier tap sur "Enregistrer" ne
        // s'enregistrait pas (il fallait taper deux fois).
        setTimeout(() => {
          savingPeriodRef.current = false; // nouvelle session de saisie → garde anti-double-tap réarmée
          setPeriodModal({ start, end });
        }, 80);
      }
      return null;
    });
    setHighlightMode(false);
  }

  // Mémorise la dernière case survolée pour ne mettre à jour la sélection qu'au changement de
  // jour (pas à chaque micro-mouvement du doigt) — un glissement qui semble plus posé, moins
  // "nerveux", et beaucoup moins d'allers-retours avec le thread JS.
  const lastDragDay = useSharedValue<number | null>(null);

  // Glisser le doigt sur la grille (en mode Surligner) sélectionne une plage de jours plutôt que
  // de changer de mois — attachée à la place de `swipeGesture` uniquement quand highlightMode est
  // actif (voir le GestureDetector de la grille plus bas).
  const highlightGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          'worklet';
          if (gridWidth === 0) return;
          const cellW = gridWidth / 7;
          const col = Math.max(0, Math.min(6, Math.floor(e.x / cellW)));
          const row = Math.max(0, Math.min(weeks.length - 1, Math.floor(e.y / CELL_HEIGHT)));
          const day = weeks[row]?.[col];
          if (day != null) {
            lastDragDay.value = day;
            runOnJS(beginDrag)(day);
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (gridWidth === 0) return;
          const cellW = gridWidth / 7;
          const col = Math.max(0, Math.min(6, Math.floor(e.x / cellW)));
          const row = Math.max(0, Math.min(weeks.length - 1, Math.floor(e.y / CELL_HEIGHT)));
          const day = weeks[row]?.[col];
          if (day != null && day !== lastDragDay.value) {
            lastDragDay.value = day;
            runOnJS(updateDrag)(day);
          }
        })
        .onFinalize(() => {
          'worklet';
          lastDragDay.value = null;
          runOnJS(finalizeDrag)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gridWidth, weeks],
  );

  // Chaque période a sa propre couleur (dans l'ordre où elles commencent) pour qu'on puisse
  // distinguer deux périodes qui se chevauchent, plutôt que de toutes les fondre dans la même
  // teinte.
  const PERIOD_PALETTE: { bg: keyof Palette; fg: keyof Palette }[] = [
    { bg: 'plumTint', fg: 'plum' },
    { bg: 'accentTint', fg: 'accent' },
    { bg: 'sageTint', fg: 'sage' },
    { bg: 'civilTint', fg: 'civil' },
  ];
  const sortedPeriods = useMemo(() => [...periods].sort((a, b) => a.date.localeCompare(b.date)), [periods]);

  function periodsForDay(day: number) {
    const iso = isoOf(view.year, view.month, day);
    return sortedPeriods.filter((p) => iso >= p.date && iso <= p.endDate!);
  }

  function highlightForDay(day: number): { key: string; label: string; bg: string; fg: string; overlap: number } | null {
    if (highlightMode && dragRange) {
      const a = Math.min(dragRange.start, dragRange.end);
      const b = Math.max(dragRange.start, dragRange.end);
      if (day >= a && day <= b) return { key: 'drag', label: '', bg: theme.plumTint, fg: theme.plum, overlap: 0 };
    }
    const covering = periodsForDay(day);
    if (covering.length === 0) return null;
    const idx = sortedPeriods.findIndex((p) => p.id === covering[0].id);
    const tone = PERIOD_PALETTE[idx % PERIOD_PALETTE.length];
    return { key: covering[0].id, label: covering[0].texte, bg: theme[tone.bg], fg: theme[tone.fg], overlap: covering.length - 1 };
  }

  function rowSegments(week: (number | null)[]) {
    const row = week.map((day) => (day !== null ? highlightForDay(day) : null));
    const segs: { startCol: number; endCol: number; label: string; bg: string; fg: string }[] = [];
    let i = 0;
    while (i < row.length) {
      if (!row[i]) {
        i++;
        continue;
      }
      const key = row[i]!.key;
      let j = i;
      while (j + 1 < row.length && row[j + 1]?.key === key) j++;
      segs.push({ startCol: i, endCol: j, label: row[i]!.label, bg: row[i]!.bg, fg: row[i]!.fg });
      i = j + 1;
    }
    return segs;
  }

  function savePeriod() {
    if (savingPeriodRef.current) return; // enregistrement déjà en cours (ou déjà réussi) — ignore un second tap
    if (!periodModal || !periodText.trim()) {
      Alert.alert('Champ vide', "Écris un mot avant d'enregistrer.");
      return;
    }
    const startIso = isoOf(view.year, view.month, periodModal.start);
    const endIso = periodModal.start === periodModal.end ? null : isoOf(view.year, view.month, periodModal.end);
    // CHANTIER AUDIT PRÉ-BÊTA §3 — `finalizeDrag` normalise déjà start/end (Math.min/Math.max) donc
    // ce cas n'est pas atteignable aujourd'hui par le geste de sélection réel, mais `savePeriod` ne
    // doit pas en dépendre implicitement : toute date de fin antérieure à la date de début est
    // refusée explicitement ici, sans jamais rien écrire dans le store. `endIso === startIso`
    // n'arrive jamais (`start === end` produit `endIso: null`, pas une égalité de chaînes) — seul
    // `endIso > startIso` ou `endIso === null` (pas de période, un seul jour) sont acceptés.
    if (endIso !== null && endIso < startIso) {
      Alert.alert('Période invalide', 'La date de fin ne peut pas être avant la date de début.');
      return;
    }
    savingPeriodRef.current = true;
    try {
      addPensee({
        date: startIso,
        endDate: endIso,
        texte: periodText.trim(),
        // Notification unique au tout début de la période, à 9h — même comportement par défaut
        // qu'avant CHANTIER PENSÉES V2 (remind: '0'), désormais exprimé comme un rappel absolu.
        reminderAt: new Date(view.year, view.month, periodModal.start, 9, 0, 0).toISOString(),
        contactId: null,
        createdAt: new Date().toISOString(),
      });
      setPeriodText('');
      setPeriodModal(null);
    } catch (e) {
      // La modale reste ouverte (pas de reprise via finalizeDrag) — l'utilisateur doit pouvoir réessayer.
      savingPeriodRef.current = false;
      throw e;
    }
  }

  const selectedEvents = getDayEvents(selected.year, selected.month, selected.day, contacts, pensees, today, userName);
  const weekLabel =
    mode === 'week'
      ? `${weekDates[0].getDate()} ${monthAbbrev[weekDates[0].getMonth()]} – ${weekDates[6].getDate()} ${monthAbbrev[weekDates[6].getMonth()]}`
      : monthLabel;

  function dotsFor(y: number, m: number, d: number) {
    const seen = new Set<string>();
    return getDayEvents(y, m, d, contacts, pensees, today, userName).filter((ev) => {
      // Les pensées de période sont montrées via la bande colorée, pas un point par jour.
      if (ev.isPeriod) return false;
      if (seen.has(ev.type)) return false;
      seen.add(ev.type);
      return true;
    });
  }

  function saveThought() {
    if (savingThoughtRef.current) return; // enregistrement déjà en cours (ou déjà réussi) — ignore un second tap
    if (!texte.trim()) {
      Alert.alert('Champ vide', "Écris un mot avant d'enregistrer.");
      return;
    }
    // Tant que "Me le rappeler" est désactivé, aucun rappel n'est programmé — le champ reste
    // simplement `null` (CHANTIER PENSÉES V2 : le rappel est entièrement facultatif).
    let reminderAt: string | null = null;
    if (reminderEnabled) {
      // Un preset qui tomberait déjà dans le passé pour ce jour est désactivé dans l'UI (voir
      // isPresetPast) — filet de sécurité ici au cas où l'état serait resté sur un choix devenu
      // invalide entre l'ouverture du formulaire et l'enregistrement.
      if (reminderChoice !== 'custom' && isPresetPast(parseInt(reminderChoice, 10))) {
        Alert.alert('Rappel dans le passé', 'Ce rappel tomberait avant maintenant — choisis un délai plus court ou "Personnaliser".');
        return;
      }
      reminderAt =
        reminderChoice === 'custom'
          ? subtractMinutesLocal(new Date(selected.year, selected.month, selected.day, 23, 59, 59), customOffsetMinutes).toISOString()
          : presetReminderDate(parseInt(reminderChoice, 10)).toISOString();
    }
    savingThoughtRef.current = true;
    try {
      addPensee({
        date: isoOf(selected.year, selected.month, selected.day),
        texte: texte.trim(),
        reminderAt,
        contactId: linkedContact,
        createdAt: new Date().toISOString(),
      });
      setTexte('');
      setLinkedContact(null);
      setReminderEnabled(false);
      setReminderChoice('1');
      setCustomDuration({ weeks: 0, days: 1, hours: 0, minutes: 0 });
      closeForm();
    } catch (e) {
      // Le formulaire reste ouvert (pas de reprise via le bouton "+ Ajouter") — l'utilisateur doit pouvoir réessayer.
      savingThoughtRef.current = false;
      throw e;
    }
  }

  return (
    <GestureDetector gesture={pageSwipeGesture}>
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>Calendrier</Text>
      <Text style={[styles.sub, { color: theme.inkSoft }]}>Anniversaires et petites pensées</Text>

      <View style={styles.monthRow}>
        <Text style={[styles.monthName, { color: theme.ink }]}>{weekLabel}</Text>
        <View style={styles.navBtns}>
          {mode === 'month' && (
            <Pressable
              onPress={() => {
                setHighlightMode((v) => !v);
                setDragRange(null);
              }}
              style={[
                styles.navBtn,
                { borderColor: highlightMode ? theme.plum : theme.line, backgroundColor: highlightMode ? theme.plumTint : theme.card },
              ]}
              accessibilityLabel="Surligner une période"
            >
              <Ionicons name="brush" size={15} color={highlightMode ? theme.plum : theme.inkSoft} />
            </Pressable>
          )}
        </View>
      </View>
      {highlightMode && (
        <Text style={[styles.highlightHint, { color: theme.plum }]}>Glisse le doigt sur la grille pour sélectionner une période</Text>
      )}

      <View style={[styles.toggle, { backgroundColor: theme.paperDim }]}>
        <Pressable
          onPress={() => setMode('month')}
          style={[styles.toggleBtn, mode === 'month' && { backgroundColor: theme.card }]}
        >
          <Text style={{ color: mode === 'month' ? theme.ink : theme.inkSoft, fontWeight: '700' }}>Mois</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('week')}
          style={[styles.toggleBtn, mode === 'week' && { backgroundColor: theme.card }]}
        >
          <Text style={{ color: mode === 'week' ? theme.ink : theme.inkSoft, fontWeight: '700' }}>Semaine</Text>
        </Pressable>
      </View>

      {mode === 'month' ? (
        <GestureDetector gesture={highlightMode ? highlightGesture : swipeGesture}>
          <Animated.View style={transitionStyle}>
          <View style={styles.weekdayRow}>
            {weekdayLabels.map((w, i) => (
              <Text key={i} style={[styles.weekdayLabel, { color: theme.inkSoft }]}>{w}</Text>
            ))}
          </View>
          <View onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {weeks.map((week, wIdx) => {
              const segments = rowSegments(week);
              return (
              <View key={wIdx} style={styles.gridRow}>
                {segments.map((seg, i) => (
                  <View
                    key={i}
                    pointerEvents="none"
                    style={[
                      styles.highlightBand,
                      {
                        left: `${(seg.startCol / 7) * 100}%`,
                        width: `${((seg.endCol - seg.startCol + 1) / 7) * 100}%`,
                        backgroundColor: seg.bg,
                      },
                    ]}
                  />
                ))}
                {week.map((day, idx) => {
                  if (day === null) return <View key={idx} style={styles.cell} />;
                  const isToday = sameDate(new Date(view.year, view.month, day), today);
                  const isSelected = selected.year === view.year && selected.month === view.month && selected.day === day;
                  const past = isPastDate(view.year, view.month, day, today);
                  const events = dotsFor(view.year, view.month, day);
                  // Plusieurs pensées (période ou non) ce jour-là — un seul point/bande ne suffit
                  // pas à le montrer, ce petit repère en haut à droite le signale ; le détail
                  // complet reste visible en tapant le jour, dans l'agenda du dessous.
                  const hasMultiplePensees =
                    getDayEvents(view.year, view.month, day, contacts, pensees, today, userName).filter((ev) => ev.type === 'pensee')
                      .length > 1;
                  return (
                    <Pressable
                      key={idx}
                      onPress={highlightMode ? undefined : () => selectDate(view.year, view.month, day)}
                      style={[
                        styles.cell,
                        styles.cellInner,
                        isToday && { backgroundColor: theme.accentTint, borderColor: theme.accent },
                        isSelected && { borderColor: theme.plum },
                        past && { opacity: 0.4 },
                      ]}
                    >
                      {hasMultiplePensees && <View style={[styles.overlapDot, { backgroundColor: theme.plum }]} />}
                      <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>{day}</Text>
                      <View style={styles.dotsRow}>
                        {events.map((ev, i) => (
                          <Dot key={i} type={ev.type} theme={theme} size={5} />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
                {/* Rendu APRÈS les cases (donc par-dessus les chiffres) : c'est ce qui permet au
                    flou de réellement flouter les chiffres derrière le texte, plutôt que de
                    passer dessous sans effet. */}
                {segments.map(
                  (seg, i) =>
                    seg.endCol - seg.startCol + 1 >= 3 &&
                    seg.label && (
                      // Ce conteneur couvre tout le segment juste pour centrer la bulle floutée —
                      // lui n'a ni fond ni flou, donc les chiffres restent visibles partout SAUF
                      // juste sous la petite bulle (dimensionnée au texte, pas à la largeur du
                      // segment entier).
                      <View
                        key={i}
                        pointerEvents="none"
                        style={[
                          styles.highlightLabelSlot,
                          {
                            left: `${(seg.startCol / 7) * 100}%`,
                            width: `${((seg.endCol - seg.startCol + 1) / 7) * 100}%`,
                          },
                        ]}
                      >
                        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={styles.highlightLabelBlur}>
                          <Text numberOfLines={1} style={[styles.highlightLabel, { color: seg.fg }]}>
                            {seg.label}
                          </Text>
                        </BlurView>
                      </View>
                    ),
                )}
              </View>
              );
            })}
          </View>
          </Animated.View>
        </GestureDetector>
      ) : (
        <Animated.View style={transitionStyle}>
          <GestureDetector gesture={swipeGesture}>
          <View style={styles.weekStrip}>
            {weekDates.map((dt, idx) => {
              const isToday = sameDate(dt, today);
              const isSelected =
                dt.getFullYear() === selected.year && dt.getMonth() === selected.month && dt.getDate() === selected.day;
              const past = isPastDate(dt.getFullYear(), dt.getMonth(), dt.getDate(), today);
              const events = dotsFor(dt.getFullYear(), dt.getMonth(), dt.getDate());
              return (
                <Pressable
                  key={idx}
                  onPress={() => selectDate(dt.getFullYear(), dt.getMonth(), dt.getDate())}
                  style={[
                    styles.weekDay,
                    isToday && { backgroundColor: theme.accentTint, borderColor: theme.accent },
                    isSelected && { borderColor: theme.plum },
                    past && { opacity: 0.4 },
                  ]}
                >
                  <Text style={{ color: theme.inkSoft, fontSize: 10, fontWeight: '700' }}>{weekdayLabels[idx]}</Text>
                  <Text style={{ color: theme.ink, fontWeight: '700' }}>{dt.getDate()}</Text>
                  <View style={styles.dotsRow}>
                    {events.map((ev, i) => (
                      <Dot key={i} type={ev.type} theme={theme} size={5} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          </GestureDetector>

          <View style={{ gap: 10, marginTop: 14 }}>
            {weekDates.map((dt, idx) => {
              const isToday = sameDate(dt, today);
              const isSelected =
                dt.getFullYear() === selected.year && dt.getMonth() === selected.month && dt.getDate() === selected.day;
              const past = isPastDate(dt.getFullYear(), dt.getMonth(), dt.getDate(), today);
              const events = getDayEvents(dt.getFullYear(), dt.getMonth(), dt.getDate(), contacts, pensees, today, userName);
              return (
                <View
                  key={idx}
                  style={[
                    styles.agendaDay,
                    { backgroundColor: theme.card, borderColor: theme.line },
                    isToday && { borderColor: theme.accent },
                    isSelected && { borderColor: theme.plum },
                    past && { opacity: 0.55 },
                  ]}
                >
                  <Pressable
                    onPress={() => selectDate(dt.getFullYear(), dt.getMonth(), dt.getDate())}
                    style={[styles.agendaHead, { borderBottomColor: theme.line }]}
                  >
                    <Text style={{ color: theme.ink, fontWeight: '700' }}>
                      {weekdayFull[idx]} <Text style={{ color: theme.inkSoft, fontWeight: '400' }}>{dt.getDate()} {monthAbbrev[dt.getMonth()]}</Text>
                    </Text>
                    {isToday && <Text style={{ color: theme.accentStrong, fontWeight: '700', fontSize: 12 }}>Aujourd'hui</Text>}
                  </Pressable>
                  {events.length === 0 ? (
                    <Text style={{ color: theme.inkSoft, fontSize: 13, paddingTop: 6 }}>Rien de prévu.</Text>
                  ) : (
                    events.map((ev, i) => (
                      <EventRow
                        key={i}
                        event={ev}
                        theme={theme}
                        flat
                        onPress={ev.contactId ? () => goto(ev.contactId) : undefined}
                        onDelete={ev.penseeId ? () => confirmDeletePensee(ev.penseeId!) : undefined}
                      />
                    ))
                  )}
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}

      <View style={styles.legend}>
        <LegendItem type="anniv" label="Anniversaire" theme={theme} />
        <LegendItem type="pensee" label="Pensée" theme={theme} />
        <LegendItem type="fete" label="Fête du prénom" theme={theme} />
        <LegendItem type="civil" label="Férié / fête calendaire" theme={theme} />
      </View>

      {mode === 'month' && (
        <View style={{ marginTop: 16 }}>
          <Text style={[styles.dayHeading, { color: theme.ink }]}>
            {sameDate(new Date(selected.year, selected.month, selected.day), today) ? "Aujourd'hui · " : ''}
            {selected.day} {monthFull[selected.month]}
            {selected.year !== today.getFullYear() ? ` ${selected.year}` : ''}
          </Text>
          {selectedEvents.length === 0 ? (
            <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Rien de prévu ce jour-là.</Text>
          ) : (
            selectedEvents.map((ev, i) => (
              <EventRow
                key={i}
                event={ev}
                theme={theme}
                onPress={ev.contactId ? () => goto(ev.contactId) : undefined}
                onDelete={ev.penseeId ? () => confirmDeletePensee(ev.penseeId!) : undefined}
              />
            ))
          )}
        </View>
      )}

      <Pressable
        onPress={() => {
          setReminderEnabled(false);
          setReminderChoice('1');
          savingThoughtRef.current = false; // nouvelle session de saisie → garde anti-double-tap réarmée
          setFormOpen(true);
        }}
        style={[styles.addBtn, { borderColor: theme.line }]}
      >
        <Text style={{ color: theme.plum, fontWeight: '700' }}>+ Ajouter une pensée à ce jour</Text>
      </Pressable>

      <Modal visible={formOpen} transparent animationType="none" onRequestClose={closeForm}>
        {/* La Modal rend son contenu dans une hiérarchie native à part — sans son propre
            GestureHandlerRootView ici, ni les gestes (react-native-gesture-handler) ni parfois
            le scroll normal ne fonctionnent correctement à l'intérieur. */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/* CHANTIER UX §1 (2026-09-15) — clavier iPhone masquant le formulaire : même
              KeyboardAvoidingView que la modale "période" plus bas (behavior="padding" iOS
              uniquement, offset FIXE mais petit et non lié à un modèle d'appareil précis — pas un
              offset calculé pour un iPhone donné). Android n'a pas besoin de ce comportement
              (redimensionnement de fenêtre géré nativement par l'OS, `behavior={undefined}`). */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
          {/* Fond assombri d'un coup (pas de transition dessus, demandé ainsi). La zone tap-pour-
              fermer est un Pressable SÉPARÉ qui ne couvre que l'espace vide au-dessus de la carte
              — la carte elle-même n'est plus enveloppée dans un Pressable, ce qui bloquait le
              scroll de la roulette à l'intérieur (un Pressable parent capte le geste avant que
              la ScrollView enfant ne puisse le faire). */}
          <View style={styles.modalScrim}>
            <Pressable style={{ flex: 1 }} onPress={closeForm} />
            <Animated.View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.line }, cardStyle]}>
              {/* Balayage vers le bas limité à cette poignée : le reste de la carte (roulette,
                  champs) garde ses propres gestes de défilement sans interférence. */}
              <GestureDetector gesture={sheetPanGesture}>
                <View style={styles.gripZone}>
                  <View style={[styles.grip, { backgroundColor: theme.line }]} />
                </View>
              </GestureDetector>

                <Text style={[styles.label, { color: theme.inkSoft }]}>C'EST À PROPOS DE QUOI ?</Text>
                <TextInput
                  value={texte}
                  onChangeText={setTexte}
                  multiline
                  style={[styles.textarea, { borderColor: theme.line, color: theme.ink }]}
                />

                <Text style={[styles.label, { color: theme.inkSoft, marginTop: 12 }]}>LIER À UN CONTACT (OPTIONNEL)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <Pressable
                    onPress={() => setLinkedContact(null)}
                    style={[styles.chip, { borderColor: theme.line, backgroundColor: linkedContact === null ? theme.accent : theme.paperDim }]}
                  >
                    <Text style={{ color: linkedContact === null ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Aucun</Text>
                  </Pressable>
                  {contacts.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setLinkedContact(c.id)}
                      style={[styles.chip, { borderColor: theme.line, backgroundColor: linkedContact === c.id ? theme.accent : theme.paperDim }]}
                    >
                      <Text style={{ color: linkedContact === c.id ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>
                        {c.prenom}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={[styles.reminderToggleRow, { marginTop: 12 }]}>
                  <Text style={[styles.label, { color: theme.inkSoft, marginTop: 0 }]}>ME LE RAPPELER</Text>
                  <Switch
                    value={reminderEnabled}
                    onValueChange={setReminderEnabled}
                    trackColor={{ false: theme.paperDim, true: theme.accent }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Tant que le rappel est désactivé, aucune date/heure n'est demandée — voir
                    CHANTIER PENSÉES V2 §"Comportement attendu". */}
                {reminderEnabled && (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4, marginTop: 6 }}>
                      {PRESET_REMINDERS.map((preset) => {
                        const disabled = isPresetPast(preset.days);
                        const active = reminderChoice === preset.key;
                        return (
                          <Pressable
                            key={preset.key}
                            disabled={disabled}
                            onPress={() => setReminderChoice(preset.key)}
                            style={[
                              styles.chip,
                              { marginBottom: 6, borderColor: theme.line, backgroundColor: active ? theme.accent : theme.paperDim },
                              disabled && { opacity: 0.4 },
                            ]}
                          >
                            <Text style={{ color: active ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>{preset.label}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => setReminderChoice('custom')}
                        style={[
                          styles.chip,
                          { marginBottom: 6, borderColor: theme.line, backgroundColor: reminderChoice === 'custom' ? theme.accent : theme.paperDim },
                        ]}
                      >
                        <Text style={{ color: reminderChoice === 'custom' ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>
                          Personnaliser
                        </Text>
                      </Pressable>
                    </View>

                    {/* Roulette conservée, mais devenue secondaire : seulement visible derrière
                        "Personnaliser", plus affichée en permanence (voir chantier notifications V1). */}
                    {reminderChoice === 'custom' && (
                      <>
                        <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 13, marginBottom: 6, marginTop: 6 }}>
                          {formatCustomOffset(customOffsetMinutes)}
                        </Text>
                        <View style={{ marginBottom: 16 }}>
                          <DurationWheelPicker
                            weeks={customDuration.weeks}
                            days={customDuration.days}
                            hours={customDuration.hours}
                            minutes={customDuration.minutes}
                            maxMinutes={maxReminderMinutes}
                            onChange={setCustomDuration}
                            theme={theme}
                          />
                        </View>
                      </>
                    )}
                  </>
                )}

                <PrimaryButton label="Enregistrer la pensée" onPress={saveThought} />
            </Animated.View>
          </View>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>

      <Modal
        visible={!!periodModal}
        transparent
        animationType="none"
        onRequestClose={() => {
          setPeriodModal(null);
          setPeriodText('');
        }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          >
            <Pressable
              style={styles.periodScrim}
              onPress={() => {
                setPeriodModal(null);
                setPeriodText('');
              }}
            >
              <Pressable style={[styles.periodCard, { backgroundColor: theme.card, borderColor: theme.line }]} onPress={() => {}}>
                <Text style={[styles.periodTitle, { color: theme.ink }]}>
                  {periodModal &&
                    (periodModal.start === periodModal.end
                      ? `${periodModal.start} ${monthFull[view.month]}`
                      : `${periodModal.start} — ${periodModal.end} ${monthFull[view.month]}`)}
                </Text>
                <TextInput
                  value={periodText}
                  onChangeText={setPeriodText}
                  placeholder="Ajouter une pensée…"
                  placeholderTextColor={theme.inkSoft}
                  style={[styles.periodInput, { borderColor: theme.line, color: theme.ink }]}
                />
                {/* onPressIn (pas onPress) : le champ est encore focus juste avant, donc ce tap
                    fait redescendre le clavier — avec KeyboardAvoidingView, la fenêtre redescend
                    AVEC lui pendant le tap, et le bouton se dérobe sous le doigt avant le
                    relâchement. Déclencher dès le contact (avant que tout ça ne bouge) évite le
                    besoin de taper deux fois. */}
                <Pressable
                  onPressIn={savePeriod}
                  style={({ pressed }) => [styles.periodSaveBtn, { backgroundColor: theme.accent }, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.periodSaveLabel}>Enregistrer</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
    </Screen>
    </GestureDetector>
  );
}

function LegendItem({ type, label, theme }: { type: any; label: string; theme: any }) {
  return (
    <View style={styles.legendItem}>
      <Dot type={type} theme={theme} size={7} />
      <Text style={{ color: theme.inkSoft, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const CELL_SIZE = '13.5%';
const CELL_HEIGHT = 42;

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 12 },
  monthName: { fontSize: 16, fontWeight: '700' },
  navBtns: { flexDirection: 'row', gap: 6 },
  navBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3, marginBottom: 14 },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  gridRow: { flexDirection: 'row', position: 'relative' },
  highlightBand: { position: 'absolute', top: 4, bottom: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Couvre tout le segment juste pour centrer la bulle floutée dedans (lui n'a pas de fond).
  highlightLabelSlot: { position: 'absolute', top: 25, height: 13, alignItems: 'center', justifyContent: 'center' },
  // La bulle elle-même : dimensionnée au texte (pas au segment entier), pour ne flouter que les
  // quelques chiffres qu'elle recouvre réellement, et laisser les autres bien visibles.
  highlightLabelBlur: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  highlightLabel: { fontSize: 10, fontWeight: '700' },
  overlapDot: { position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: 3 },
  highlightHint: { fontSize: 11, fontWeight: '600', marginTop: -6, marginBottom: 10 },
  cell: { flex: 1, height: CELL_HEIGHT, padding: 2 },
  cellInner: { position: 'relative', borderRadius: 10, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 3 },
  dotsRow: { flexDirection: 'row', gap: 2, height: 6 },
  weekStrip: { flexDirection: 'row', gap: 6 },
  weekDay: { flex: 1, borderWidth: 1, borderColor: 'transparent', borderRadius: 14, alignItems: 'center', paddingVertical: 10, gap: 5 },
  agendaDay: { borderWidth: 1, borderRadius: 16, padding: 12 },
  agendaHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8, marginBottom: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 6, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayHeading: { fontWeight: '700', fontSize: 14, marginBottom: 8 },
  addBtn: { marginTop: 16, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(20,24,28,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 32 },
  gripZone: { paddingVertical: 8, alignItems: 'center' },
  grip: { width: 36, height: 4, borderRadius: 999 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 60, textAlignVertical: 'top', fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
  periodScrim: { flex: 1, backgroundColor: 'rgba(20,24,28,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  periodCard: { width: '100%', borderWidth: 1, borderRadius: 18, padding: 20 },
  periodTitle: { fontWeight: '700', fontSize: 15, marginBottom: 12, textAlign: 'center' },
  periodInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 16 },
  periodSaveBtn: { width: '100%', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  periodSaveLabel: { fontWeight: '700', fontSize: 15, color: '#FFFFFF' },
});
