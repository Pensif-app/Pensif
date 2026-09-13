import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { RootStackParamList } from '../navigation/types';
import { Pensee } from '../data/types';
import { isFutureReminder, withLocalDate, withLocalTime } from '../data/reminderDate';
import { canScheduleExactAlarms, openExactAlarmSettings } from 'expo-exact-alarm';

/**
 * Détail/édition d'une pensée (CHANTIER PENSÉES V2) : un seul écran pour créer ET modifier, même
 * principe que FicheScreen pour un proche. Le contenu est la seule chose obligatoire — proche lié
 * et rappel restent facultatifs, et le rappel (quand activé) est une date/heure ABSOLUE choisie
 * explicitement, jamais dérivée d'une date d'événement implicite (il n'y en a pas forcément).
 *
 * `date`/`endDate` (ancre calendrier — jour choisi ou période) ne sont volontairement PAS éditables
 * ici : elles ne sont écrites que depuis le Calendrier (création par jour/surlignage de période) et
 * restent inchangées lors d'une édition depuis cet écran — seuls texte/proche lié/rappel le sont,
 * exactement le périmètre demandé par CHANTIER PENSÉES V2.
 */
export function PenseeDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PenseeDetail'>>();
  const { pensees, contacts, addPensee, updatePensee, deletePensee } = useStore();

  const penseeId = route.params?.penseeId;
  const existing = penseeId ? pensees.find((p) => p.id === penseeId) : undefined;

  const [texte, setTexte] = useState(existing?.texte ?? '');
  const [contactId, setContactId] = useState<string | null>(existing?.contactId ?? route.params?.contactId ?? null);
  const [reminderEnabled, setReminderEnabled] = useState(Boolean(existing?.reminderAt));
  const [reminderDate, setReminderDate] = useState<Date>(() => {
    if (existing?.reminderAt) return new Date(existing.reminderAt);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  // Android : deux champs séparés (date puis heure), jamais affichés automatiquement — voir le
  // même principe déjà appliqué à l'anniversaire d'un proche (FicheScreen.tsx). iOS : une seule
  // roulette combinée date+heure, cohérente avec le mode spinner déjà utilisé ailleurs dans l'app.
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Dernière valeur BRUTE renvoyée par chaque picker natif — conservée uniquement pour le
  // diagnostic (voir save()) : permet de voir si la déviation vient du picker lui-même ou de la
  // fusion (BUG PENSÉES V2 ANDROID : rappel pourtant futur rejeté comme "dans le passé"). Des refs
  // (pas des state) pour ne provoquer aucun re-rendu supplémentaire.
  const lastPickedDateRef = useRef<Date | null>(null);
  const lastPickedTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: existing ? 'Modifier la pensée' : 'Nouvelle pensée' });
  }, [existing, navigation]);

  const reminderLabel = useMemo(() => {
    const d = reminderDate;
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    // BUG AM/PM ANDROID : HH:mm (24h, séparateur ":") — jamais de conversion 12h/AM-PM, aucune
    // ambiguïté possible sur ce que l'heure affichée représente.
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} à ${timeStr}`;
  }, [reminderDate]);

  // Défense en profondeur (CHANTIER NAVIGATION NOTIFICATION PENSÉES V2) : un `penseeId` fourni sans
  // pensée correspondante signifie qu'elle a été supprimée entre la programmation d'un lien
  // (notification, etc.) et son ouverture — resolveNotificationAction (notificationPlanning.ts)
  // filtre déjà ce cas en amont pour le tap sur notification, mais ne jamais silencieusement
  // basculer en "création" ici évite tout autre chemin de navigation dans le même état. Distinct de
  // `!penseeId` (pas de paramètre du tout = création volontaire) — même principe que MessageScreen.
  if (penseeId && !existing) {
    return (
      <Screen>
        <Text style={[styles.label, { color: theme.ink, fontSize: 18, fontWeight: '700', marginBottom: 6 }]}>
          Cette pensée n’est plus disponible
        </Text>
        <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Elle a peut-être été supprimée.</Text>
        <Pressable onPress={() => navigation.goBack()} style={[styles.input, { marginTop: 16, alignItems: 'center', borderColor: theme.line }]}>
          <Text style={{ color: theme.ink, fontWeight: '700' }}>Retour</Text>
        </Pressable>
      </Screen>
    );
  }

  function onDateChange(_: unknown, selected?: Date) {
    // Cette poignée n'est câblée QUE côté Android (le bouton qui l'ouvre ne rend rien sur iOS,
    // qui utilise le picker combiné plus bas) — toujours refermer, pas de branche iOS ici.
    setShowDatePicker(false);
    if (selected) {
      lastPickedDateRef.current = selected;
      // withLocalDate reconstruit un Date NEUF à partir des composants locaux des deux dates
      // (jamais une mutation `new Date(prev)` + `setFullYear` — voir reminderDate.ts, BUG PENSÉES
      // V2 ANDROID) : le jour choisi remplace le jour courant, l'heure déjà réglée est conservée.
      setReminderDate((prev) => withLocalDate(prev, selected));
    }
  }

  function onTimeChange(_: unknown, selected?: Date) {
    setShowTimePicker(false);
    if (selected) {
      lastPickedTimeRef.current = selected;
      setReminderDate((prev) => withLocalTime(prev, selected));
    }
  }

  function onDateTimeChangeIOS(_: unknown, selected?: Date) {
    if (selected) setReminderDate(selected);
  }

  // BUG ANDROID "notifications systématiquement en retard" (~4 min) : sans SCHEDULE_EXACT_ALARM
  // accordée, expo-notifications programme une alarme INEXACTE (batchée par le système) — voir
  // ExpoSchedulingDelegate.kt côté natif. Demandé UNIQUEMENT ici, au moment où l'utilisateur active
  // explicitement un rappel à heure précise (jamais au lancement de l'app ni à l'ouverture d'une
  // pensée existante qui a déjà un rappel — `reminderEnabled` peut valoir true dès le montage sans
  // action de l'utilisateur, donc ce contrôle vit uniquement dans ce handler, pas dans un effect
  // sur `reminderEnabled`).
  function onReminderToggle(value: boolean) {
    setReminderEnabled(value);
    if (value && Platform.OS === 'android' && !canScheduleExactAlarms()) {
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

  function save() {
    if (!texte.trim()) {
      Alert.alert('Contenu manquant', 'Écris au moins un mot pour enregistrer cette pensée.');
      return;
    }
    if (reminderEnabled && __DEV__) {
      // Diagnostic temporaire (BUG PENSÉES V2 ANDROID) — ne journalise aucune donnée Supabase,
      // uniquement les valeurs de date/heure impliquées dans la comparaison qui suit.
      console.log('[Pensées V2][reminder debug] new Date().toString() =', new Date().toString());
      console.log('[Pensées V2][reminder debug] selected date =', lastPickedDateRef.current?.toString() ?? '(inchangée depuis l’ouverture)');
      console.log('[Pensées V2][reminder debug] selected time =', lastPickedTimeRef.current?.toString() ?? '(inchangée depuis l’ouverture)');
      console.log('[Pensées V2][reminder debug] constructedReminder.toString() =', reminderDate.toString());
      console.log('[Pensées V2][reminder debug] constructedReminder.toISOString() =', reminderDate.toISOString());
      console.log('[Pensées V2][reminder debug] constructedReminder.getTime() - Date.now() =', reminderDate.getTime() - Date.now());
    }
    if (reminderEnabled && !isFutureReminder(reminderDate)) {
      Alert.alert('Rappel dans le passé', 'Choisis une date et une heure dans le futur, ou désactive le rappel.');
      return;
    }
    const reminderAt = reminderEnabled ? reminderDate.toISOString() : null;

    if (existing) {
      const updated: Pensee = { ...existing, texte: texte.trim(), contactId, reminderAt };
      updatePensee(updated);
    } else {
      addPensee({
        texte: texte.trim(),
        contactId,
        reminderAt,
        createdAt: new Date().toISOString(),
        date: null,
        endDate: null,
      });
    }
    navigation.goBack();
  }

  function remove() {
    if (!existing) return;
    Alert.alert('Supprimer cette pensée ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          deletePensee(existing.id);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text style={[styles.label, { color: theme.inkSoft }]}>C'EST À PROPOS DE QUOI ?</Text>
      <TextInput
        value={texte}
        onChangeText={setTexte}
        multiline
        placeholder="Ex. Micka aimerait un casque audio"
        placeholderTextColor={theme.inkSoft}
        style={[styles.textarea, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
      />

      <Text style={[styles.label, { color: theme.inkSoft, marginTop: 16 }]}>LIER À UN PROCHE (FACULTATIF)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        <Pressable
          onPress={() => setContactId(null)}
          style={[styles.chip, { borderColor: theme.line, backgroundColor: contactId === null ? theme.accent : theme.paperDim }]}
        >
          <Text style={{ color: contactId === null ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>Aucun</Text>
        </Pressable>
        {contacts.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setContactId(c.id)}
            style={[styles.chip, { borderColor: theme.line, backgroundColor: contactId === c.id ? theme.accent : theme.paperDim }]}
          >
            <Text style={{ color: contactId === c.id ? '#FFFFFF' : theme.inkSoft, fontWeight: '600', fontSize: 12 }}>{c.prenom}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.reminderToggleRow, { marginTop: 16 }]}>
        <Text style={[styles.label, { color: theme.inkSoft, marginTop: 0, marginBottom: 0 }]}>ME LE RAPPELER</Text>
        <Switch
          value={reminderEnabled}
          onValueChange={onReminderToggle}
          trackColor={{ false: theme.paperDim, true: theme.accent }}
          thumbColor="#fff"
        />
      </View>

      {/* Tant que le rappel est désactivé, aucune date/heure n'est demandée — voir CHANTIER
          PENSÉES V2 §"Comportement attendu". Aucun raccourci "veille/J-3" ici : sans date
          d'événement à laquelle se rattacher, ce serait artificiel (voir la même consigne) — on
          demande directement une date/heure explicite. */}
      {reminderEnabled && (
        <View style={{ marginTop: 10 }}>
          {Platform.OS === 'ios' ? (
            <DateTimePicker value={reminderDate} mode="datetime" display="spinner" onChange={onDateTimeChangeIOS} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[styles.input, styles.dateBtn, { flex: 1, borderColor: theme.line, backgroundColor: theme.card }]}
              >
                <Text style={{ color: theme.ink }}>{reminderLabel.split(' à ')[0]}</Text>
                <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
              </Pressable>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                style={[styles.input, styles.dateBtn, { flex: 1, borderColor: theme.line, backgroundColor: theme.card }]}
              >
                <Text style={{ color: theme.ink }}>{reminderLabel.split(' à ')[1]}</Text>
                <Ionicons name="time-outline" size={16} color={theme.inkSoft} />
              </Pressable>
            </View>
          )}
          {showDatePicker && <DateTimePicker value={reminderDate} mode="date" display="calendar" onChange={onDateChange} />}
          {/* is24Hour={true} : BUG AM/PM ANDROID — sans ce prop, le TimePickerDialog natif suit le
              format système (12h sur cet appareil), et une saisie "6:00" pensée comme 18:00 est
              alors retournée comme 06:00 sans qu'aucune ambiguïté ne soit visible à l'écran. Forcer
              le 24h ici supprime toute conversion AM/PM, quel que soit le format système. */}
          {showTimePicker && <DateTimePicker value={reminderDate} mode="time" display="clock" is24Hour onChange={onTimeChange} />}
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        <PrimaryButton label="Enregistrer" onPress={save} />
      </View>

      {existing && (
        <Pressable onPress={remove} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={15} color={theme.danger} />
          <Text style={[styles.deleteText, { color: theme.danger }]}>Supprimer cette pensée</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: 'top', fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 20 },
  deleteText: { fontWeight: '700', fontSize: 13 },
});
