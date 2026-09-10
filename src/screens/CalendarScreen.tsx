import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  sameDate,
  weekdayFull,
  weekdayLabels,
} from '../data/calendar';
import { RootStackParamList } from '../navigation/types';

export function CalendarScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contacts, pensees, addPensee, deletePensee, today, userName } = useStore();

  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  const [formOpen, setFormOpen] = useState(false);
  const [texte, setTexte] = useState('');
  const [linkedContact, setLinkedContact] = useState<string | null>(null);
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

  // Calendrier étant le dernier onglet, "revenir en arrière" mène toujours à Cadeaux.
  function goToPreviousTab() {
    navigation.navigate('Cadeaux' as never);
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

  const selectedEvents = getDayEvents(selected.year, selected.month, selected.day, contacts, pensees, today, userName);
  const weekLabel =
    mode === 'week'
      ? `${weekDates[0].getDate()} ${monthAbbrev[weekDates[0].getMonth()]} – ${weekDates[6].getDate()} ${monthAbbrev[weekDates[6].getMonth()]}`
      : monthLabel;

  function dotsFor(y: number, m: number, d: number) {
    const seen = new Set<string>();
    return getDayEvents(y, m, d, contacts, pensees, today, userName).filter((ev) => {
      if (seen.has(ev.type)) return false;
      seen.add(ev.type);
      return true;
    });
  }

  function saveThought() {
    if (!texte.trim()) {
      Alert.alert('Champ vide', "Écris un mot avant d'enregistrer.");
      return;
    }
    addPensee({
      date: isoOf(selected.year, selected.month, selected.day),
      texte: texte.trim(),
      remind: 'custom',
      customOffsetMinutes,
      contactId: linkedContact,
    });
    setTexte('');
    setLinkedContact(null);
    setCustomDuration({ weeks: 0, days: 1, hours: 0, minutes: 0 });
    closeForm();
  }

  return (
    <GestureDetector gesture={pageSwipeGesture}>
    <Screen>
      <Text style={[styles.h1, { color: theme.ink }]}>Calendrier</Text>
      <Text style={[styles.sub, { color: theme.inkSoft }]}>Anniversaires et petites pensées</Text>

      <View style={styles.monthRow}>
        <Text style={[styles.monthName, { color: theme.ink }]}>{weekLabel}</Text>
        <View style={styles.navBtns}>
          <Pressable onPress={prev} style={[styles.navBtn, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Ionicons name="chevron-back" size={16} color={theme.inkSoft} />
          </Pressable>
          <Pressable onPress={next} style={[styles.navBtn, { borderColor: theme.line, backgroundColor: theme.card }]}>
            <Ionicons name="chevron-forward" size={16} color={theme.inkSoft} />
          </Pressable>
        </View>
      </View>

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
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={transitionStyle}>
          <View style={styles.weekdayRow}>
            {weekdayLabels.map((w, i) => (
              <Text key={i} style={[styles.weekdayLabel, { color: theme.inkSoft }]}>{w}</Text>
            ))}
          </View>
          <View>
            {weeks.map((week, wIdx) => (
              <View key={wIdx} style={styles.gridRow}>
                {week.map((day, idx) => {
                  if (day === null) return <View key={idx} style={styles.cell} />;
                  const isToday = sameDate(new Date(view.year, view.month, day), today);
                  const isSelected = selected.year === view.year && selected.month === view.month && selected.day === day;
                  const past = isPastDate(view.year, view.month, day, today);
                  const events = dotsFor(view.year, view.month, day);
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => selectDate(view.year, view.month, day)}
                      style={[
                        styles.cell,
                        styles.cellInner,
                        isToday && { backgroundColor: theme.accentTint, borderColor: theme.accent },
                        isSelected && { borderColor: theme.plum },
                        past && { opacity: 0.4 },
                      ]}
                    >
                      <Text style={{ color: theme.ink, fontWeight: '600', fontSize: 13 }}>{day}</Text>
                      <View style={styles.dotsRow}>
                        {events.map((ev, i) => (
                          <Dot key={i} type={ev.type} theme={theme} size={5} />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
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
        onPress={() => setFormOpen(true)}
        style={[styles.addBtn, { borderColor: theme.line }]}
      >
        <Text style={{ color: theme.plum, fontWeight: '700' }}>+ Ajouter une pensée à ce jour</Text>
      </Pressable>

      <Modal visible={formOpen} transparent animationType="none" onRequestClose={closeForm}>
        {/* La Modal rend son contenu dans une hiérarchie native à part — sans son propre
            GestureHandlerRootView ici, ni les gestes (react-native-gesture-handler) ni parfois
            le scroll normal ne fonctionnent correctement à l'intérieur. */}
        <GestureHandlerRootView style={{ flex: 1 }}>
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

                <Text style={[styles.label, { color: theme.inkSoft, marginTop: 12 }]}>ME LE RAPPELER</Text>
                <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>
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

                <PrimaryButton label="Enregistrer la pensée" onPress={saveThought} />
            </Animated.View>
          </View>
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
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, height: 42, padding: 2 },
  cellInner: { borderRadius: 10, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 3 },
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
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 60, textAlignVertical: 'top', fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
});
