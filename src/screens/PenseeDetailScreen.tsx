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

// CHANTIER POLISH PICKER ÉVÉNEMENT (2026-09-18) — locale explicite pour les pickers iOS inline de cet
// écran (`@react-native-community/datetimepicker` 9.1.0, prop `locale` IOSNativeProps UNIQUEMENT,
// ignorée sur Android). Même constante/valeur que CaptureScreen.tsx — voir son commentaire pour le
// détail (identifiant BCP-47 "fr-FR" accepté nativement par NSLocale). Ne change aucune logique de
// date/heure, seulement la langue d'affichage native du picker.
const IOS_PICKER_LOCALE = 'fr-FR';

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
  // CHANTIER CAPTURE — EVENT TIME, incrément 4 (2026-09-18) : heure d'événement, INDÉPENDANTE du
  // rappel (jamais dérivée de reminderDate/reminderTime, jamais l'inverse) — n'a de sens qu'en
  // relation avec `eventDate` (voir le bloc "ÉVÉNEMENT (FACULTATIF)" plus bas, rendu seulement si
  // `eventDate` est renseignée, et le clear de `eventDate` ci-dessous qui l'efface avec elle).
  const [eventTime, setEventTime] = useState<string | null>(existing?.eventTime ?? null);
  // CHANTIER UNIFICATION UX PICKERS iOS (2026-09-18) — UN SEUL état pour TOUS les pickers de cet
  // écran (événement + rappel, iOS + Android) : garantit qu'au plus UN picker natif est visible à la
  // fois (en ouvrir un referme automatiquement celui précédemment ouvert, un seul slot possible) —
  // remplace les 4 booléens indépendants précédents (`showEventDatePicker`/`showEventTimePicker`/
  // `showDatePicker`/`showTimePicker`) ET le picker iOS du rappel qui n'avait ELLE-MÊME aucun état
  // "fermé" (toujours affichée dès `reminderEnabled`, ce qui permettait plusieurs roulettes iOS
  // visibles simultanément — voir audit). `'event'` sert aux DEUX plateformes pour le contrôle
  // principal ÉVÉNEMENT (iOS : picker "date"/"datetime" unique ; Android : dialog de DATE seule,
  // Android n'a pas de mode datetime combiné dans ce composant — voir JSX). `'eventTime'` : dialog
  // Android dédié pour éditer l'heure d'événement séparément (action secondaire). `'reminderDateTime'`
  // : picker iOS combiné du rappel. `'reminderDate'`/`'reminderTime'` : les deux dialogs Android du
  // rappel (comportement Android inchangé, seulement centralisé dans ce même état).
  type DetailPickerKind = 'event' | 'eventTime' | 'reminderDateTime' | 'reminderDate' | 'reminderTime';
  const [openPicker, setOpenPicker] = useState<DetailPickerKind | null>(null);
  /** Retape le contrôle déjà ouvert → referme (même règle que CaptureScreen.tsx) ; sinon ouvre celui
   *  demandé, remplaçant implicitement tout autre picker précédemment ouvert (un seul slot). */
  function togglePicker(kind: DetailPickerKind) {
    setOpenPicker((prev) => (prev === kind ? null : kind));
  }
  /** Ferme le picker actuellement ouvert s'il concerne l'événement (`event`/`eventTime`) — utilisé
   *  par les suppressions (événement entier, ou heure seule) pour ne jamais laisser un picker ouvert
   *  sur une donnée qui vient de disparaître. */
  function closeEventPickerIfOpen() {
    setOpenPicker((prev) => (prev === 'event' || prev === 'eventTime' ? null : prev));
  }
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
  // CHANTIER SEEDS TEMPORELS 1 (2026-09-18) — CORRECTIF : `reminderDate` (CONFIRMÉ) ne vaut plus une
  // date "demain 9h" acquise dès le montage quand aucun rappel n'existe encore. `null` = aucune
  // valeur RÉELLE de rappel tant que l'utilisateur n'a pas explicitement confirmé un choix (fermeture
  // du picker — retap ou "Terminé", voir plus bas) — exactement le même principe que Capture Review
  // (`card.reminderDate`, captureReview.ts). `existing.reminderAt` présent → valeur réelle, telle
  // quelle ; absent → `null`, jamais une valeur par défaut déjà "acquise". La seed "demain 9h" reste
  // disponible comme PROPOSITION UI pure via `reminderDateSeed()` ci-dessous, qui ne modifie jamais
  // cet état.
  const [reminderDate, setReminderDate] = useState<Date | null>(() => (existing?.reminderAt ? new Date(existing.reminderAt) : null));
  /** PROPOSÉ — valeur purement visuelle pour positionner le picker (et calculer les libellés) quand
   *  aucun rappel n'est encore confirmé : "demain 9h" (comportement historique conservé comme
   *  PROPOSITION seulement — voir docstring de `reminderDate` ci-dessus). Ne modifie jamais l'état ;
   *  quand `reminderDate` est déjà confirmé, le retourne TEL QUEL (idempotent). */
  function reminderDateSeed(): Date {
    if (reminderDate) return reminderDate;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  /**
   * CHANTIER SEEDS TEMPORELS 1 (2026-09-18) — confirme MAINTENANT la valeur ACTUELLEMENT AFFICHÉE
   * (`reminderDateSeed()`) dans `reminderDate`. Appelée UNIQUEMENT À LA FERMETURE du picker combiné
   * iOS (retap sur le champ déjà ouvert, ou tap sur "Terminé") — JAMAIS à l'ouverture, voir
   * `openReminderDateTimePicker` ci-dessous. Idempotente si la roulette a déjà été bougée
   * (`onDateTimeChangeIOS` a alors déjà écrit la vraie valeur, `reminderDateSeed()` la retourne TELLE
   * QUELLE) — jamais un retour vers le fallback "demain 9h" dans ce cas. Même principe que
   * `confirmReminderSeed` de CaptureScreen.tsx (Capture Review), transposé ici où ce mécanisme
   * n'existait pas encore (le state `reminderDate` était directement la donnée, toujours non-null).
   */
  function confirmReminderSeed() {
    setReminderDate(reminderDateSeed());
  }
  /** Toggle explicite du picker combiné iOS (même règle que `togglePicker`, réimplémentée ici pour
   *  pouvoir agir sur `next` AVANT d'appeler `setOpenPicker`) — l'OUVERTURE n'écrit plus rien (seed
   *  purement visuelle) ; la FERMETURE par retap confirme (voir `confirmReminderSeed`), même règle que
   *  le bouton "Terminé" qui l'appelle explicitement avant de fermer (voir JSX). */
  function openReminderDateTimePicker() {
    const next = openPicker === 'reminderDateTime' ? null : 'reminderDateTime';
    if (!next) confirmReminderSeed();
    setOpenPicker(next);
  }
  // Android : deux champs séparés (date puis heure), jamais affichés automatiquement — voir le
  // même principe déjà appliqué à l'anniversaire d'un proche (FicheScreen.tsx). iOS : une seule
  // roulette combinée date+heure, cohérente avec le mode spinner déjà utilisé ailleurs dans l'app.
  // Ouverture/fermeture pilotée par `openPicker` (kinds 'reminderDate'/'reminderTime'/
  // 'reminderDateTime') — voir sa déclaration plus haut.
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

  // Formate soit la valeur CONFIRMÉE (reminderDate), soit — si rien n'est encore confirmé — la seed
  // PROPOSÉE (reminderDateSeed()) : sert uniquement à calculer le TEXTE quand il y a quelque chose à
  // afficher (picker ouvert, ou déjà confirmé) — ne signifie jamais à lui seul qu'une valeur est
  // acquise, voir le rendu du chip plus bas qui distingue explicitement les deux cas.
  const reminderLabel = useMemo(() => {
    const d = reminderDate ?? reminderDateSeed();
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    // BUG AM/PM ANDROID : HH:mm (24h, séparateur ":") — jamais de conversion 12h/AM-PM, aucune
    // ambiguïté possible sur ce que l'heure affichée représente.
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} à ${timeStr}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // qui utilise le picker combiné plus bas) — toujours refermer, pas de branche iOS ici. Android
    // natif : `selected` n'est fourni QUE sur confirmation (bouton OK) — Cancel n'appelle jamais ce
    // handler avec une valeur, `if (selected)` ci-dessous n'écrit donc RIEN dans ce cas (comportement
    // déjà correct, non modifié par cet incrément — voir consigne "Android : aucun changement").
    setOpenPicker(null);
    if (selected) {
      lastPickedDateRef.current = selected;
      // withLocalDate reconstruit un Date NEUF à partir des composants locaux des deux dates
      // (jamais une mutation `new Date(prev)` + `setFullYear` — voir reminderDate.ts, BUG PENSÉES
      // V2 ANDROID) : le jour choisi remplace le jour courant, l'heure déjà réglée est conservée.
      // `prev ?? reminderDateSeed()` — base = valeur CONFIRMÉE si elle existe déjà, sinon la
      // PROPOSITION (jamais `null`, `withLocalDate` a besoin d'un `Date` de base) ; le résultat de CET
      // appel devient lui-même CONFIRMÉ (OK Android = confirmation explicite).
      setReminderDate((prev) => withLocalDate(prev ?? reminderDateSeed(), selected));
    }
  }

  function onTimeChange(_: unknown, selected?: Date) {
    setOpenPicker(null);
    if (selected) {
      lastPickedTimeRef.current = selected;
      setReminderDate((prev) => withLocalTime(prev ?? reminderDateSeed(), selected));
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
    // CHANTIER SEEDS TEMPORELS 1 (2026-09-18) — `reminderDate` (CONFIRMÉ) peut désormais être `null`
    // (aucun choix explicitement confirmé, voir sa déclaration plus haut) : un rappel activé mais
    // jamais confirmé ne doit JAMAIS être sauvegardé avec une valeur par défaut simplement parce que
    // le switch a été activé — même discipline que "Rappel dans le passé" ci-dessous, qui bloque déjà
    // explicitement plutôt que de deviner à la place de l'utilisateur.
    if (reminderEnabled && !reminderDate) {
      Alert.alert('Rappel incomplet', 'Choisis une date et une heure pour ce rappel, ou désactive-le.');
      return;
    }
    if (reminderEnabled && reminderDate && __DEV__) {
      // Diagnostic temporaire (BUG PENSÉES V2 ANDROID) — ne journalise aucune donnée Supabase,
      // uniquement les valeurs de date/heure impliquées dans la comparaison qui suit.
      console.log('[Pensées V2][reminder debug] new Date().toString() =', new Date().toString());
      console.log('[Pensées V2][reminder debug] selected date =', lastPickedDateRef.current?.toString() ?? '(inchangée depuis l’ouverture)');
      console.log('[Pensées V2][reminder debug] selected time =', lastPickedTimeRef.current?.toString() ?? '(inchangée depuis l’ouverture)');
      console.log('[Pensées V2][reminder debug] constructedReminder.toString() =', reminderDate.toString());
      console.log('[Pensées V2][reminder debug] constructedReminder.toISOString() =', reminderDate.toISOString());
      console.log('[Pensées V2][reminder debug] constructedReminder.getTime() - Date.now() =', reminderDate.getTime() - Date.now());
    }
    if (reminderEnabled && reminderDate && !isFutureReminder(reminderDate)) {
      Alert.alert('Rappel dans le passé', 'Choisis une date et une heure dans le futur, ou désactive le rappel.');
      return;
    }
    const reminderAt = reminderEnabled && reminderDate ? reminderDate.toISOString() : null;

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
          // CHANTIER CAPTURE — EVENT TIME, incrément 4 (2026-09-18) : `eventTime` reflète désormais
          // l'état d'édition RÉEL de cet écran (bloc "ÉVÉNEMENT (FACULTATIF)" plus bas) — jamais un
          // repli silencieux sur `existing.eventTime`. Remis à `null` avec `date`/`endDate` si
          // l'événement est retiré (même règle que `endDate` : une heure sans date n'a pas de sens).
          eventTime: eventDate ? eventTime : null,
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
          eventTime: eventDate ? eventTime : null,
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

      {/* CHANTIER UNIFICATION UX PICKERS iOS (2026-09-18) — remplace les deux blocs séparés DATE +
          HEURE par UN SEUL bloc principal "ÉVÉNEMENT (FACULTATIF)" (voir docstring en tête pour
          l'indépendance vis-à-vis du rappel). "date + eventTime=null" reste un état pleinement
          valide : le contrôle principal ci-dessous n'invente JAMAIS une heure (mode "date" tant
          qu'aucune heure n'existe, jamais "datetime" silencieusement) — seule l'action secondaire
          heure (plus bas) peut en créer une, explicitement. */}
      <Text style={[styles.label, { color: theme.inkSoft, marginTop: 16 }]}>ÉVÉNEMENT (FACULTATIF)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => togglePicker('event')}
          style={[styles.input, styles.dateBtn, { flex: 1, borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Text style={{ color: eventDate ? theme.ink : theme.inkSoft }}>
            {eventDate ? `${eventDate.split('-').reverse().join('/')}${eventTime ? ` à ${eventTime}` : ''}` : 'Ajouter un événement'}
          </Text>
          <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
        </Pressable>
        {eventDate && (
          <Pressable
            onPress={() => {
              // Suppression de l'événement ENTIER — date ET heure (même règle que `endDate`, voir
              // docstring en tête et save() plus haut) : jamais une heure orpheline sans date.
              setEventDate(null);
              setEventTime(null);
              closeEventPickerIfOpen();
            }}
            hitSlop={8}
            accessibilityLabel="Retirer l’événement"
          >
            <Ionicons name="close-circle-outline" size={22} color={theme.inkSoft} />
          </Pressable>
        )}
      </View>

      {/* Contrôle principal — iOS : UNE roulette unique, mode "datetime" si une heure existe déjà,
          "date" sinon (jamais inventée par ce contrôle). Android : dialog de DATE seule (pas de mode
          "datetime" combiné dans ce composant sur cette plateforme, voir l'action secondaire heure
          ci-dessous pour éditer l'heure). "Terminé" (iOS uniquement) ne modifie AUCUNE donnée, ferme
          seulement le picker. */}
      {Platform.OS === 'ios' && openPicker === 'event' ? (
        <DateTimePicker
          value={eventDate ? new Date(`${eventDate}T${eventTime ?? '00:00'}:00`) : new Date()}
          mode={eventTime ? 'datetime' : 'date'}
          display="spinner"
          locale={IOS_PICKER_LOCALE}
          is24Hour
          onChange={(_, selected) => {
            // Ne ferme jamais automatiquement — même discipline que le rappel (roulette iOS,
            // onChange à chaque segment tourné) : seul un retap ou "Terminé" ferme.
            if (!selected) return;
            const y = selected.getFullYear();
            const m = String(selected.getMonth() + 1).padStart(2, '0');
            const d = String(selected.getDate()).padStart(2, '0');
            setEventDate(`${y}-${m}-${d}`);
            // Mode "date" (eventTime actuellement null) : le cadran heure n'existe pas, IGNORE
            // délibérément toute composante horaire de `selected` — ne jamais l'écrire.
            if (eventTime) {
              const h = String(selected.getHours()).padStart(2, '0');
              const mi = String(selected.getMinutes()).padStart(2, '0');
              setEventTime(`${h}:${mi}`);
            }
          }}
          style={{ marginTop: 8 }}
        />
      ) : null}
      {Platform.OS === 'android' && openPicker === 'event' ? (
        <DateTimePicker
          value={eventDate ? new Date(`${eventDate}T00:00:00`) : new Date()}
          mode="date"
          display="calendar"
          onChange={(_, selected) => {
            setOpenPicker(null);
            if (selected) {
              const y = selected.getFullYear();
              const m = String(selected.getMonth() + 1).padStart(2, '0');
              const d = String(selected.getDate()).padStart(2, '0');
              setEventDate(`${y}-${m}-${d}`);
            }
          }}
        />
      ) : null}

      {/* CHANTIER POLISH PICKER ÉVÉNEMENT (2026-09-18) — CORRECTIF : le contrôle principal ci-dessus
          affiche déjà "07/03/2027 à 20:00" (ou "07/03/2027" sans heure) — un second champ/chip heure
          était donc redondant (supprimé). Action DISCRÈTE (texte seul, pas un champ) pour
          ajouter/retirer UNIQUEMENT l'heure, jamais la date — rendue seulement si une date événement
          existe déjà. Sur iOS, "+ Ajouter une heure" écrit une valeur RÉELLE (12:00) AVANT d'ouvrir le
          contrôle principal (désormais en mode "datetime") — même correctif "seed confirmée à
          l'ouverture" que les autres pickers de l'app (jamais un cadran affiché sans valeur déjà
          enregistrée derrière). Sur Android, rien n'est préempli avant ouverture du dialog HEURE dédié
          : le dialog natif ne commet que sur son propre bouton OK — préremplir risquerait de laisser
          une heure fantôme si l'utilisateur annule.
          CORRECTIF ALIGNEMENT (2026-09-18) — "Retirer l'heure"/"+ Ajouter une heure" et "Terminé"
          (roulette iOS) partagent désormais une seule row (`justifyContent: 'space-between'`), sous
          la roulette : gauche/droite, séparation maximale (jamais rapprochées), même ligne
          horizontale — auparavant "Terminé" (à l'intérieur du picker iOS) et cette action (rendue
          plus bas, hors de tout row) apparaissaient à des hauteurs différentes. Textes/couleurs/
          handlers/comportement strictement inchangés — seul le POSITIONNEMENT change. */}
      {eventDate && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Pressable
            onPress={() => {
              if (eventTime) {
                setEventTime(null);
                closeEventPickerIfOpen();
              } else if (Platform.OS === 'ios') {
                setEventTime('12:00');
                setOpenPicker('event');
              } else {
                togglePicker('eventTime');
              }
            }}
            hitSlop={6}
          >
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
              {eventTime ? 'Retirer l’heure' : '+ Ajouter une heure'}
            </Text>
          </Pressable>
          {Platform.OS === 'ios' && openPicker === 'event' ? (
            <Pressable onPress={() => setOpenPicker(null)} hitSlop={8}>
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Terminé</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      {Platform.OS === 'android' && openPicker === 'eventTime' ? (
        <DateTimePicker
          value={eventTime ? new Date(`2000-01-01T${eventTime}:00`) : new Date(2000, 0, 1, 12, 0, 0, 0)}
          mode="time"
          display="clock"
          is24Hour
          onChange={(_, selected) => {
            setOpenPicker(null);
            if (selected) {
              const h = String(selected.getHours()).padStart(2, '0');
              const mi = String(selected.getMinutes()).padStart(2, '0');
              setEventTime(`${h}:${mi}`);
            }
          }}
        />
      ) : null}

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
          demande directement une date/heure explicite. CHANTIER UNIFICATION UX PICKERS iOS
          (2026-09-18) — le rappel utilise désormais le MÊME état centralisé `openPicker` que
          l'événement (garantit l'exclusivité globale) : iOS gagne un contrôle "fermable" (chip +
          Terminé, la roulette n'est plus affichée en permanence dès l'activation) ; Android garde ses
          deux dialogs natifs séparés, strictement inchangés visuellement. CHANTIER SEEDS TEMPORELS 1
          (2026-09-18) — `reminderDate` (CONFIRMÉ) est désormais nullable : voir sa déclaration plus
          haut, `reminderDateSeed()` (PROPOSÉ, "demain 9h" inchangée), et `confirmReminderSeed()`/
          `openReminderDateTimePicker()` pour la confirmation À LA FERMETURE (plus à l'ouverture). */}
      {reminderEnabled && (
        <View style={{ marginTop: 10 }}>
          {Platform.OS === 'ios' ? (
            <>
              <Pressable
                onPress={openReminderDateTimePicker}
                style={[styles.input, styles.dateBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
              >
                <Text style={{ color: reminderDate ? theme.ink : theme.inkSoft }}>
                  {reminderDate ? reminderLabel : 'Choisir une date et une heure'}
                </Text>
                <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
              </Pressable>
              {openPicker === 'reminderDateTime' ? (
                <>
                  <DateTimePicker
                    value={reminderDateSeed()}
                    mode="datetime"
                    display="spinner"
                    locale={IOS_PICKER_LOCALE}
                    onChange={onDateTimeChangeIOS}
                  />
                  <Pressable
                    onPress={() => {
                      confirmReminderSeed();
                      setOpenPicker(null);
                    }}
                    style={styles.pickerDoneBtn}
                    hitSlop={8}
                  >
                    <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '700' }}>Terminé</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => togglePicker('reminderDate')}
                style={[styles.input, styles.dateBtn, { flex: 1, borderColor: theme.line, backgroundColor: theme.card }]}
              >
                <Text style={{ color: reminderDate ? theme.ink : theme.inkSoft }}>{reminderDate ? reminderLabel.split(' à ')[0] : 'Date'}</Text>
                <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
              </Pressable>
              <Pressable
                onPress={() => togglePicker('reminderTime')}
                style={[styles.input, styles.dateBtn, { flex: 1, borderColor: theme.line, backgroundColor: theme.card }]}
              >
                <Text style={{ color: reminderDate ? theme.ink : theme.inkSoft }}>{reminderDate ? reminderLabel.split(' à ')[1] : 'Heure'}</Text>
                <Ionicons name="time-outline" size={16} color={theme.inkSoft} />
              </Pressable>
            </View>
          )}
          {Platform.OS === 'android' && openPicker === 'reminderDate' ? (
            <DateTimePicker value={reminderDateSeed()} mode="date" display="calendar" onChange={onDateChange} />
          ) : null}
          {/* is24Hour={true} : BUG AM/PM ANDROID — sans ce prop, le TimePickerDialog natif suit le
              format système (12h sur cet appareil), et une saisie "6:00" pensée comme 18:00 est
              alors retournée comme 06:00 sans qu'aucune ambiguïté ne soit visible à l'écran. Forcer
              le 24h ici supprime toute conversion AM/PM, quel que soit le format système. */}
          {Platform.OS === 'android' && openPicker === 'reminderTime' ? (
            <DateTimePicker value={reminderDateSeed()} mode="time" display="clock" is24Hour onChange={onTimeChange} />
          ) : null}
        </View>
      )}

      {/* CHANTIER UX — exposer `event` (2026-09-17) : réutilise EXACTEMENT la même condition que le
          backend (buildMessageSuggestionContext/validateOccasion côté suggest-message) — contactId
          ET date (l'ancre canonique) requis. `reminderAt` (rappel technique) n'entre jamais dans
          cette condition : un simple rappel sans date d'ancrage ne devient jamais un "événement"
          relationnel. Basé sur `existing` (donnée PERSISTÉE), jamais sur les states d'édition en
          cours (contactId/eventDate) : MessageScreen résout la pensée depuis le store via son id, un
          tap ici doit donc refléter ce qui est réellement enregistré, pas un brouillon non sauvegardé.
          `penseeId` transmis, jamais l'objet Pensee complet (voir décision d'architecture actée). */}
      {existing && existing.contactId && existing.date && (
        <Pressable
          onPress={() =>
            navigation.navigate('Message', { contactId: existing.contactId!, occasion: 'event', penseeId: existing.id })
          }
          style={[styles.messageLink, { borderColor: theme.line }]}
        >
          <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Préparer un message</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.accent} />
        </Pressable>
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
  messageLink: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 14, marginTop: 18 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 20 },
  deleteText: { fontWeight: '700', fontSize: 13 },
  // CHANTIER UNIFICATION UX PICKERS iOS (2026-09-18) — action discrète "Terminé" associée à un
  // picker iOS inline visible (ferme SEULEMENT le picker, aucune modification de donnée).
  pickerDoneBtn: { alignSelf: 'flex-end', marginTop: 4, paddingVertical: 6, paddingHorizontal: 4 },
});
