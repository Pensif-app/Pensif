// CHANTIER RAPPELS RÉCURRENTS — UX incrément 4 (2026-09-18). Éditeur compact partagé pour les deux
// aspects d'une récurrence de Capture Review : la RÉPÉTITION (tous les jours / certains jours) et la
// FIN (jamais / après X fois / jusqu'au). Même pattern de feuille que ContactPicker.tsx (Modal
// transparent + carte ancrée en bas) — pas de nouveau système de modale.
//
// AUCUNE logique métier ici : ce composant ne fait qu'afficher l'état actuel et appeler les callbacks
// fournis, qui sont eux-mêmes de simples relais vers les fonctions PURES de captureReview.ts
// (toggleRecurrence, setRecurrenceFrequency, toggleRecurrenceDay, setRecurrenceOccurrenceCount,
// setRecurrenceUntilDate) — needsReview/isCardValid restent l'unique source de vérité de validité,
// jamais recalculée ici.
import React, { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette } from '../theme/colors';
import { LocalDate, RecurrenceDraftFrequency, recurrenceDateLabel } from '../data/captureReview';

export type RecurrenceEditorMode = 'frequency' | 'end';

// CHANTIER POLISH PICKER ÉVÉNEMENT (2026-09-18) — locale explicite pour le picker iOS inline de ce
// composant (`@react-native-community/datetimepicker` 9.1.0, prop `locale` IOSNativeProps UNIQUEMENT,
// ignorée sur Android). Même constante/valeur que CaptureScreen.tsx/PenseeDetailScreen.tsx.
const IOS_PICKER_LOCALE = 'fr-FR';

// Ordre d'affichage FRANÇAIS (lundi → dimanche) — mapping interne réel 0=dimanche..6=samedi (voir
// captureReview.ts) : chaque chip porte sa valeur INTERNE, seul l'ORDRE de rendu change.
const DAY_CHIPS: { label: string; value: number }[] = [
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'M', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
];

function localDateToJsDate(date: LocalDate): Date {
  return new Date(date.year, date.month, date.day);
}

function jsDateToLocalDate(date: Date): LocalDate {
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

export function RecurrenceEditorSheet({
  visible,
  mode,
  theme,
  frequency,
  daysOfWeek,
  occurrenceCount,
  untilDate,
  startDate,
  onClose,
  onChooseFrequency,
  onToggleDay,
  onChooseNever,
  onChooseOccurrenceCount,
  onChooseUntilDate,
}: {
  visible: boolean;
  mode: RecurrenceEditorMode;
  theme: Palette;
  frequency: RecurrenceDraftFrequency | null;
  daysOfWeek: number[];
  occurrenceCount: number | null;
  untilDate: LocalDate | null;
  /** Date de première occurrence déjà choisie — jamais de "Jusqu'au" antérieur à ce jour (voir
   *  `minimumDate` du picker plus bas). `null` tant qu'elle n'est pas encore définie : le picker
   *  natif s'ouvre alors sans borne basse (le blocage réel reste de toute façon `isCardValid`, ceci
   *  n'est qu'un guide visuel). */
  startDate: LocalDate | null;
  onClose: () => void;
  onChooseFrequency: (frequency: RecurrenceDraftFrequency) => void;
  onToggleDay: (day: number) => void;
  onChooseNever: () => void;
  onChooseOccurrenceCount: (count: number) => void;
  onChooseUntilDate: (date: LocalDate) => void;
}) {
  // État purement local d'AFFICHAGE (quel champ de fin est actuellement "sélectionné" dans la
  // feuille avant confirmation) — la vraie donnée reste `occurrenceCount`/`untilDate` du brouillon,
  // ce state ne fait que piloter quel contrôle (stepper texte / picker date) est visible.
  const [endChoice, setEndChoice] = useState<'never' | 'count' | 'until'>(occurrenceCount !== null ? 'count' : untilDate ? 'until' : 'never');
  const [countText, setCountText] = useState(String(occurrenceCount ?? 5));
  const [showUntilPicker, setShowUntilPicker] = useState(false);

  function handleClose() {
    setShowUntilPicker(false);
    onClose();
  }

  function applyCount(text: string) {
    setCountText(text);
    const n = parseInt(text, 10);
    if (Number.isInteger(n) && n >= 1) onChooseOccurrenceCount(n);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.card }]} onPress={() => {}}>
          {mode === 'frequency' ? (
            <>
              <Text style={[styles.title, { color: theme.ink }]}>Répétition</Text>
              <Pressable
                onPress={() => onChooseFrequency('daily')}
                style={[styles.optionRow, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Tous les jours</Text>
                {frequency === 'daily' ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
              </Pressable>
              <Pressable
                onPress={() => onChooseFrequency('weekly')}
                style={[styles.optionRow, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Certains jours</Text>
                {frequency === 'weekly' ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
              </Pressable>

              {frequency === 'weekly' ? (
                <View style={styles.dayChipsRow}>
                  {DAY_CHIPS.map((chip) => {
                    const active = daysOfWeek.includes(chip.value);
                    return (
                      <Pressable
                        key={chip.value}
                        onPress={() => onToggleDay(chip.value)}
                        style={[
                          styles.dayChip,
                          { borderColor: active ? theme.accent : theme.line, backgroundColor: active ? theme.accent : theme.paperDim },
                        ]}
                      >
                        <Text style={{ color: active ? '#FFFFFF' : theme.inkSoft, fontWeight: '700', fontSize: 13 }}>{chip.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: theme.ink }]}>Fin de la répétition</Text>
              <Pressable
                onPress={() => {
                  setEndChoice('never');
                  onChooseNever();
                }}
                style={[styles.optionRow, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Jamais</Text>
                {endChoice === 'never' ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
              </Pressable>

              <Pressable
                onPress={() => {
                  setEndChoice('count');
                  applyCount(countText);
                }}
                style={[styles.optionRow, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Après X fois</Text>
                {endChoice === 'count' ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
              </Pressable>
              {endChoice === 'count' ? (
                <View style={styles.countRow}>
                  <TextInput
                    value={countText}
                    onChangeText={applyCount}
                    keyboardType="number-pad"
                    style={[styles.countInput, { borderColor: theme.line, color: theme.ink }]}
                  />
                  <Text style={{ color: theme.inkSoft, fontSize: 13 }}>fois</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => {
                  setEndChoice('until');
                  setShowUntilPicker(true);
                  if (untilDate) onChooseUntilDate(untilDate);
                }}
                style={[styles.optionRow, { borderColor: theme.line }]}
              >
                <Text style={{ color: theme.ink, fontSize: 14, fontWeight: '600' }}>Jusqu'au</Text>
                {endChoice === 'until' ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
              </Pressable>
              {endChoice === 'until' ? (
                <View style={{ marginTop: 4 }}>
                  <Pressable
                    onPress={() => setShowUntilPicker((v) => !v)}
                    style={[styles.dateChip, { borderColor: theme.line, backgroundColor: theme.paperDim }]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={theme.ink} />
                    <Text style={{ color: theme.ink, fontSize: 13, fontWeight: '600' }}>
                      {untilDate ? recurrenceDateLabel(untilDate) : 'Choisir une date'}
                    </Text>
                  </Pressable>
                  {showUntilPicker ? (
                    <DateTimePicker
                      value={untilDate ? localDateToJsDate(untilDate) : startDate ? localDateToJsDate(startDate) : new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                      locale={Platform.OS === 'ios' ? IOS_PICKER_LOCALE : undefined}
                      // Jamais une fin avant le départ — garde-fou UX (le blocage réel de sauvegarde
                      // reste isCardValid, ceci évite seulement de proposer un choix déjà voué à
                      // l'échec).
                      minimumDate={startDate ? localDateToJsDate(startDate) : undefined}
                      onChange={(_, selected) => {
                        setShowUntilPicker(Platform.OS === 'ios');
                        if (selected) onChooseUntilDate(jsDateToLocalDate(selected));
                      }}
                    />
                  ) : null}
                </View>
              ) : null}
            </>
          )}

          <Pressable onPress={handleClose} style={[styles.doneBtn, { backgroundColor: theme.accent }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  title: { fontWeight: '700', fontSize: 15, marginBottom: 12 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1 },
  dayChipsRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
  dayChip: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  countInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, width: 60, fontSize: 14, textAlign: 'center' },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  doneBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
});
