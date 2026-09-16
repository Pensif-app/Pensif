import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { ContactAssociationField } from '../components/ContactAssociationField';
import { ContactPicker } from '../components/ContactPicker';
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
 * `date` (ancre calendrier, CHANTIER UX §4 2026-09-15) est désormais éditable ici, en plus du
 * Calendrier qui reste un raccourci de création totalement distinct et inchangé (CalendarScreen a son
 * propre formulaire inline, `saveThought`, qui renseigne `date` directement — jamais via cet écran).
 * Toujours un simple JOUR, jamais d'heure (voir `Pensee.date`, `YYYY-MM-DD`) — le modèle Pensées V2
 * (date/endDate/reminderAt/penseeAnchor) n'est pas modifié, seule cette valeur devient éditable
 * depuis ce second point d'entrée. `endDate` (période, uniquement créée depuis le Calendrier — pas de
 * surlignage de période possible ici) est TOUJOURS préservée telle quelle tant que `date` reste
 * renseignée ; si `date` est retirée, `endDate` est remise à null avec elle (une période sans date de
 * départ n'a pas de sens dans ce modèle).
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
  // CHANTIER UX §4 — Date optionnelle, un concept INDÉPENDANT du rappel (voir docstring). Aucune
  // valeur par défaut : reste `null` tant que l'utilisateur ne choisit pas explicitement une date via
  // le picker (jamais une date "silencieusement" écrite juste en activant un champ).
  const [eventDate, setEventDate] = useState<string | null>(existing?.date ?? null);
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  // CHANTIER PENSÉES V3 §6 — épingler/désépingler, MÊME PATTERN que le favori proche
  // (FicheScreen.tsx `headerRight` + Switch local persistée par save()) : audit des interactions
  // existantes (tap ouvre l'écran, appui long = sélection multiple sur PenseesScreen — jamais
  // détourné ici) a confirmé qu'un icône de header dans cet écran est l'endroit le plus naturel,
  // sans polluer chaque carte d'une icône permanente supplémentaire.
  const [pinned, setPinned] = useState(Boolean(existing?.pinned));
  // CHANTIER UX — ContactPicker commun (2026-09-16) : plus de liste de tous les contacts affichée
  // d'office, voir ContactAssociationField/ContactPicker (components/).
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
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
  // CHANTIER AUDIT PRÉ-BÊTA §1 — garde anti-double-tap sur save(), même principe qu'ailleurs dans
  // FicheScreen.tsx (voir ce fichier pour le détail du raisonnement) : save() est synchrone, jamais
  // déverrouillée sur le chemin de succès (navigation.goBack() démonte l'écran), déverrouillée
  // uniquement si une exception a empêché la navigation.
  const savingRef = useRef(false);

  useEffect(() => {
    navigation.setOptions({
      title: existing ? 'Modifier la pensée' : 'Nouvelle pensée',
      headerRight: () => (
        <Pressable
          onPress={() => setPinned((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={pinned ? 'Désépingler' : 'Épingler'}
          style={styles.pinBtn}
        >
          <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={22} color={pinned ? theme.plum : theme.inkSoft} />
        </Pressable>
      ),
    });
  }, [existing, navigation, pinned, theme]);

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
    if (savingRef.current) return; // sauvegarde déjà en cours (ou déjà réussie) — ignore un second tap
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

    // Verrou posé ICI seulement — après TOUTE validation (un retour anticipé au-dessus n'a jamais
    // engagé la garde, donc rien à libérer pour ces cas-là, voir FicheScreen.tsx pour le même
    // raisonnement détaillé).
    savingRef.current = true;
    try {
      if (existing) {
        // `endDate` (période) n'a de sens qu'accompagnée d'une `date` de départ — si la date a été
        // retirée, l'éventuelle période (créée depuis le Calendrier) est retirée avec elle plutôt que
        // de laisser une `endDate` orpheline. Si `date` reste renseignée, l'`endDate` existante
        // (période ou simple jour) est TOUJOURS préservée telle quelle (voir docstring en tête).
        const updated: Pensee = {
          ...existing,
          texte: texte.trim(),
          contactId,
          reminderAt,
          date: eventDate,
          endDate: eventDate ? existing.endDate ?? null : null,
          pinned,
        };
        updatePensee(updated);
      } else {
        addPensee({
          texte: texte.trim(),
          contactId,
          pinned,
          reminderAt,
          createdAt: new Date().toISOString(),
          date: eventDate,
          endDate: null,
        });
      }
      navigation.goBack();
    } catch (e) {
      savingRef.current = false;
      throw e;
    }
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
      <ContactAssociationField
        theme={theme}
        contacts={contacts}
        selectedContactId={contactId}
        onClear={() => setContactId(null)}
        onOpenPicker={() => setContactPickerOpen(true)}
      />
      <ContactPicker
        visible={contactPickerOpen}
        contacts={contacts}
        theme={theme}
        title="Choisir un proche"
        onSelect={(id) => {
          setContactId(id);
          setContactPickerOpen(false);
        }}
        onClose={() => setContactPickerOpen(false)}
      />

      {/* CHANTIER UX §4 — Date OPTIONNELLE, indépendante du rappel (voir docstring en tête). Simple
          chip Pressable (comme "Anniversaire" dans FicheScreen.tsx) plutôt qu'un Switch : aucune date
          n'est écrite tant que le picker n'a pas explicitement renvoyé un choix (jamais de valeur par
          défaut silencieuse), et retirer une date déjà choisie est un simple tap sur la croix. */}
      <Text style={[styles.label, { color: theme.inkSoft, marginTop: 16 }]}>DATE (FACULTATIF)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => setShowEventDatePicker(true)}
          style={[styles.input, styles.dateBtn, { flex: 1, borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Text style={{ color: eventDate ? theme.ink : theme.inkSoft }}>
            {eventDate ? eventDate.split('-').reverse().join('/') : 'Ajouter une date'}
          </Text>
          <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
        </Pressable>
        {eventDate && (
          <Pressable onPress={() => setEventDate(null)} hitSlop={8} accessibilityLabel="Retirer la date">
            <Ionicons name="close-circle-outline" size={22} color={theme.inkSoft} />
          </Pressable>
        )}
      </View>
      {showEventDatePicker && (
        <DateTimePicker
          value={eventDate ? new Date(`${eventDate}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          onChange={(_, selected) => {
            // Même discipline que FicheScreen.tsx (anniversaire) : composants locaux du Date choisi,
            // jamais toISOString() qui déciderait en UTC et pourrait décaler le jour affiché.
            setShowEventDatePicker(Platform.OS === 'ios');
            if (selected) {
              const y = selected.getFullYear();
              const m = String(selected.getMonth() + 1).padStart(2, '0');
              const d = String(selected.getDate()).padStart(2, '0');
              setEventDate(`${y}-${m}-${d}`);
            }
          }}
        />
      )}

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
  // Même style que FicheScreen.tsx `favoriteBtn` (bouton favori du header) — réutilisé tel quel.
  pinBtn: { padding: 6, marginRight: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 6 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 90, textAlignVertical: 'top', fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
  reminderToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 20 },
  deleteText: { fontWeight: '700', fontSize: 13 },
});
