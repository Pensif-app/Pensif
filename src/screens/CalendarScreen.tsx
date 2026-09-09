import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { EventRow } from '../components/EventRow';
import { Dot } from '../components/Dot';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import {
  addDays,
  daysInMonth,
  getDayEvents,
  isPastDate,
  isoOf,
  mondayOf,
  mondayOffset,
  monthAbbrev,
  monthFull,
  reminderLabels,
  sameDate,
  weekdayFull,
  weekdayLabels,
} from '../data/calendar';
import { RootStackParamList } from '../navigation/types';
import { ReminderOffset } from '../data/types';

const REMIND_OPTIONS: ReminderOffset[] = ['0', '1', '3', '7', '14'];

export function CalendarScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contacts, pensees, addPensee, today, userName } = useStore();

  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
  const [formOpen, setFormOpen] = useState(false);
  const [texte, setTexte] = useState('');
  const [remind, setRemind] = useState<ReminderOffset>('3');
  const [linkedContact, setLinkedContact] = useState<string | null>(null);

  function selectDate(year: number, month: number, day: number) {
    setSelected({ year, month, day });
    setView({ year, month });
  }

  function goto(contactId?: string | null) {
    if (contactId) navigation.navigate('Fiche', { contactId });
  }

  const monthLabel = monthFull[view.month].charAt(0).toUpperCase() + monthFull[view.month].slice(1) + ' ' + view.year;

  function prev() {
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
    addPensee({ date: isoOf(selected.year, selected.month, selected.day), texte: texte.trim(), remind, contactId: linkedContact });
    setTexte('');
    setLinkedContact(null);
    setRemind('3');
    setFormOpen(false);
  }

  return (
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
        <>
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
        </>
      ) : (
        <>
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
                      <EventRow key={i} event={ev} theme={theme} flat onPress={ev.contactId ? () => goto(ev.contactId) : undefined} />
                    ))
                  )}
                </View>
              );
            })}
          </View>
        </>
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
              <EventRow key={i} event={ev} theme={theme} onPress={ev.contactId ? () => goto(ev.contactId) : undefined} />
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

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <Text style={[styles.label, { color: theme.inkSoft }]}>C'EST À PROPOS DE QUOI ?</Text>
            <TextInput
              value={texte}
              onChangeText={setTexte}
              placeholder="Ex. entretien d'embauche de Sofia"
              placeholderTextColor={theme.inkSoft}
              multiline
              style={[styles.textarea, { borderColor: theme.line, color: theme.ink }]}
            />

            <Text style={[styles.label, { color: theme.inkSoft, marginTop: 12 }]}>LIER À UN CONTACT (OPTIONNEL)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <Pressable
                onPress={() => setLinkedContact(null)}
                style={[styles.chip, { borderColor: theme.line, backgroundColor: linkedContact === null ? theme.accent : theme.paperDim }]}
              >
                <Text style={{ color: linkedContact === null ? '#3A2308' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Aucun</Text>
              </Pressable>
              {contacts.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setLinkedContact(c.id)}
                  style={[styles.chip, { borderColor: theme.line, backgroundColor: linkedContact === c.id ? theme.accent : theme.paperDim }]}
                >
                  <Text style={{ color: linkedContact === c.id ? '#3A2308' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>
                    {c.prenom}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.label, { color: theme.inkSoft, marginTop: 12 }]}>ME LE RAPPELER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {REMIND_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setRemind(opt)}
                  style={[styles.chip, { borderColor: theme.line, backgroundColor: remind === opt ? theme.accent : theme.paperDim }]}
                >
                  <Text style={{ color: remind === opt ? '#3A2308' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>
                    {reminderLabels[opt]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <PrimaryButton label="Enregistrer la pensée" onPress={saveThought} />
            <Pressable onPress={() => setFormOpen(false)} style={{ marginTop: 10, alignItems: 'center' }}>
              <Text style={{ color: theme.inkSoft }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
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
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 60, textAlignVertical: 'top', fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
});
