import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
// L'API "par défaut" d'expo-contacts a basculé vers une nouvelle API à base de classes en SDK 57 ;
// presentContactPickerAsync (fonction) n'existe que dans l'ancienne API, exposée via ce sous-chemin.
import * as Contacts from 'expo-contacts/legacy';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { archetypeFor, computeTraits, isQuizComplete } from '../data/quiz';
import { RootStackParamList } from '../navigation/types';
import { Contact, Genre } from '../data/types';
import { generateId } from '../lib/id';

const AVATAR_COLORS = ['accent', 'sage', 'plum', 'accentStrong'];
const RELATIONS = ['Ami', 'Famille', 'Autres'];
// Liens de famille genrés : tant que le genre n'est pas choisi, les deux formes sont proposées ;
// une fois choisi, seule la forme qui correspond s'affiche (ex. Genre = Femme → "Sœur", pas "Frère").
const FAMILY_ROLE_PAIRS: { m: string; f: string }[] = [
  { m: 'Père', f: 'Mère' },
  { m: 'Frère', f: 'Sœur' },
  { m: 'Fils', f: 'Fille' },
  { m: 'Grand-père', f: 'Grand-mère' },
  { m: 'Oncle', f: 'Tante' },
  { m: 'Cousin', f: 'Cousine' },
];
function familyRoleOptions(genre: Genre | null): string[] {
  if (genre === 'homme') return [...FAMILY_ROLE_PAIRS.map((p) => p.m), 'Autre'];
  if (genre === 'femme') return [...FAMILY_ROLE_PAIRS.map((p) => p.f), 'Autre'];
  return [...FAMILY_ROLE_PAIRS.flatMap((p) => [p.m, p.f]), 'Autre'];
}
/** Bascule un lien de famille genré vers la forme qui correspond au nouveau genre (Frère → Sœur…). */
function swapFamilyRoleGender(role: string | null, genre: Genre | null): string | null {
  if (!role || !genre) return role;
  const pair = FAMILY_ROLE_PAIRS.find((p) => p.m === role || p.f === role);
  if (!pair) return role;
  return genre === 'homme' ? pair.m : pair.f;
}
// Options de "lien précis", propres à chaque catégorie de relation (Famille dépend du genre —
// voir familyRoleOptions).
const LIEN_OPTIONS_STATIC: Record<string, string[]> = {
  Ami: ['Meilleur', 'Proche', 'Ami'],
  Autres: ['Collègue', 'Connaissance', 'Autres'],
};

const BIRTHDAY_REMINDER_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: 'La veille' },
  { days: 3, label: 'J-3' },
  { days: 7, label: 'J-7' },
  { days: 14, label: 'J-14' },
];

// Anciennes valeurs enregistrées avant cette réorganisation — on les ramène à leur forme actuelle
// à l'ouverture d'une fiche existante. Toujours une des clés de RELATIONS en sortie (jamais une
// valeur inconnue), sinon le rendu du "Lien précis" plante.
function normalizeRelation(r?: string | null): string {
  if (r === 'Amie') return 'Ami';
  if (r === 'Collègue' || r === 'Autre') return 'Autres';
  return r && RELATIONS.includes(r) ? r : RELATIONS[0];
}

export function FicheScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Fiche'>>();
  const contactId = route.params?.contactId;
  const { contacts, upsertContact, deleteContact } = useStore();
  const existing = contacts.find((c) => c.id === contactId);

  const initialRelation = normalizeRelation(existing?.relation);
  const [prenom, setPrenom] = useState(existing?.prenom ?? '');
  const [nom, setNom] = useState(existing?.nom ?? '');
  const [tel, setTel] = useState(existing?.tel ?? '');
  const [date, setDate] = useState(existing?.date ?? '');
  const [relation, setRelation] = useState(initialRelation);
  const [familyRole, setFamilyRole] = useState<string | null>(existing?.familyRole ?? null);
  const [genre, setGenre] = useState<Genre | null>(existing?.genre ?? null);
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [birthdayReminderDays, setBirthdayReminderDays] = useState<number | null>(existing?.birthdayReminderDays ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const avatarColor = existing?.color ?? AVATAR_COLORS[contacts.length % AVATAR_COLORS.length];
  const previewInitials = useMemo(() => {
    const i = `${prenom.trim()[0] ?? ''}${nom.trim()[0] ?? ''}`.toUpperCase();
    return i || '?';
  }, [prenom, nom]);

  useEffect(() => {
    navigation.setOptions({
      title: existing ? 'Fiche contact' : 'Nouveau contact',
      headerRight: () => (
        <Pressable
          onPress={() => setFavorite((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          style={styles.favoriteBtn}
        >
          <Ionicons name={favorite ? 'star' : 'star-outline'} size={22} color={favorite ? theme.plum : theme.inkSoft} />
        </Pressable>
      ),
    });
  }, [existing, navigation, favorite, theme]);

  async function importFromContacts() {
    // presentContactPickerAsync ouvre le sélecteur natif du téléphone et ne nécessite PAS la
    // permission Contacts (c'est tout l'intérêt de cette API, façon sélecteur de photos) —
    // demander la permission en plus ne servait à rien et pouvait entrer en conflit avec l'UI native.
    try {
      const picked = await Contacts.presentContactPickerAsync();
      if (!picked) return; // l'utilisateur a annulé

      const phone = picked.phoneNumbers?.[0]?.number ?? '';
      if (!picked.firstName && !picked.lastName && !phone) {
        Alert.alert('Contact vide', "Ce contact n'a ni nom ni numéro à importer.");
        return;
      }
      if (picked.firstName) setPrenom(picked.firstName);
      if (picked.lastName) setNom(picked.lastName);
      if (phone) setTel(phone);
    } catch (err: any) {
      Alert.alert('Import impossible', err?.message ?? "L'import de contact n'est pas disponible sur cet appareil.");
    }
  }

  function remove() {
    if (!existing) return;
    Alert.alert(
      `Supprimer ${existing.prenom} ?`,
      'Cette fiche et son quizz seront définitivement supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteContact(existing.id);
            navigation.goBack();
          },
        },
      ],
    );
  }

  function save() {
    if (!prenom.trim()) {
      Alert.alert('Prénom manquant', 'Donne au moins un prénom pour enregistrer la fiche.');
      return;
    }
    if (!date) {
      Alert.alert('Date manquante', "Choisis la date d'anniversaire avant d'enregistrer la fiche.");
      return;
    }
    const contact: Contact = {
      id: existing?.id ?? generateId(),
      prenom: prenom.trim(),
      nom: nom.trim(),
      tel: tel.trim(),
      date,
      relation,
      familyRole,
      genre,
      initials: previewInitials === '?' ? existing?.initials ?? '?' : previewInitials,
      color: avatarColor,
      quiz: existing?.quiz ?? null,
      giftSent: existing?.giftSent ?? false,
      favorite,
      birthdayReminderDays,
    };
    upsertContact(contact);
    navigation.goBack();
  }

  return (
    <Screen>
      {!existing && (
        <Pressable
          onPress={importFromContacts}
          style={[styles.importBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Ionicons name="people" size={16} color={theme.plum} />
          <Text style={[styles.importText, { color: theme.plum }]}>Importer depuis mes contacts</Text>
        </Pressable>
      )}

      <View style={styles.avatarRow}>
        <Avatar initials={previewInitials} colorKey={avatarColor} theme={theme} size={64} />
      </View>

      <SectionLabel theme={theme}>INFORMATIONS</SectionLabel>
      <View style={styles.twoCol}>
        <Field label="Prénom" theme={theme}>
          <TextInput value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor={theme.inkSoft} style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]} />
        </Field>
        <Field label="Nom" theme={theme}>
          <TextInput value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor={theme.inkSoft} style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]} />
        </Field>
      </View>

      <View style={styles.twoCol}>
        <Field label="Téléphone" theme={theme}>
          <TextInput
            value={tel}
            onChangeText={setTel}
            placeholder="06 00 00 00 00"
            placeholderTextColor={theme.inkSoft}
            keyboardType="phone-pad"
            style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.card }]}
          />
        </Field>
        <Field label="Anniversaire" theme={theme}>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[styles.input, styles.dateBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
          >
            <Text style={{ color: date ? theme.ink : theme.inkSoft }}>
              {date ? date.split('-').reverse().join('/') : 'À choisir'}
            </Text>
          </Pressable>
        </Field>
      </View>

      {showDatePicker && (
        <DateTimePicker
          // Par défaut sur l'an 2000 plutôt que la date du jour — une naissance est bien plus
          // souvent proche de cette année-là, ça évite de faire défiler la molette très loin.
          value={date ? new Date(date) : new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selected) {
              const y = selected.getFullYear();
              const m = String(selected.getMonth() + 1).padStart(2, '0');
              const d = String(selected.getDate()).padStart(2, '0');
              setDate(`${y}-${m}-${d}`);
            }
          }}
        />
      )}

      <Field label="Genre" theme={theme}>
        <ChipRow>
          {(['homme', 'femme'] as Genre[]).map((g) => (
            <Chip
              key={g}
              label={g === 'homme' ? 'Homme' : 'Femme'}
              active={genre === g}
              theme={theme}
              onPress={() => {
                const next = genre === g ? null : g;
                setGenre(next);
                // "Frère" choisi puis passage à Femme → bascule tout seul sur "Sœur", plutôt que
                // de garder un lien qui ne correspond plus au genre affiché.
                setFamilyRole((prev) => swapFamilyRoleGender(prev, next));
              }}
            />
          ))}
        </ChipRow>
      </Field>

      <SectionLabel theme={theme}>RELATION</SectionLabel>
      <View style={{ marginBottom: 13 }}>
        <ChipRow>
          {RELATIONS.map((r) => (
            <Chip
              key={r}
              label={r}
              active={relation === r}
              theme={theme}
              onPress={() => {
                setRelation(r);
                setFamilyRole(null);
              }}
            />
          ))}
        </ChipRow>
      </View>

      <Field label="Lien précis" theme={theme}>
        <ChipRow>
          {(relation === 'Famille' ? familyRoleOptions(genre) : LIEN_OPTIONS_STATIC[relation] ?? []).map((r) => (
            <Chip key={r} label={r} active={familyRole === r} theme={theme} onPress={() => setFamilyRole(r)} />
          ))}
        </ChipRow>
      </Field>

      <SectionLabel theme={theme}>RAPPEL ANNIVERSAIRE</SectionLabel>
      <Text style={[styles.reminderHint, { color: theme.inkSoft }]}>
        Une alerte le jour J est toujours envoyée. Tu peux en ajouter une avant, pour avoir le temps de préparer
        quelque chose.
      </Text>
      <View style={{ marginBottom: 13 }}>
        <ChipRow>
          {BIRTHDAY_REMINDER_OPTIONS.map((opt) => (
            <Chip
              key={String(opt.days)}
              label={opt.label}
              active={birthdayReminderDays === opt.days}
              theme={theme}
              onPress={() => setBirthdayReminderDays((prev) => (prev === opt.days ? null : opt.days))}
            />
          ))}
        </ChipRow>
      </View>

      {existing && (
        <>
          <SectionLabel theme={theme}>LE PETIT QUIZZ</SectionLabel>
          <QuizSummaryCard contact={existing} theme={theme} onPress={() => navigation.navigate('Quiz', { contactId: existing.id })} />
        </>
      )}

      <View style={{ marginTop: 12 }}>
        <PrimaryButton label="Enregistrer la fiche" onPress={save} />
      </View>

      {existing && (
        <Pressable onPress={remove} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={15} color={theme.danger} />
          <Text style={[styles.deleteText, { color: theme.danger }]}>Supprimer ce contact</Text>
        </Pressable>
      )}
    </Screen>
  );
}

function SectionLabel({ theme, children }: { theme: any; children: React.ReactNode }) {
  return <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>{children}</Text>;
}

function Field({ label, theme, children }: { label: string; theme: any; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.inkSoft }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function Chip({ label, active, theme, onPress }: { label: string; active: boolean; theme: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? theme.accent : theme.line, backgroundColor: active ? theme.accentTint : theme.card }]}
    >
      <Text style={{ color: active ? theme.accent : theme.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function QuizSummaryCard({ contact, theme, onPress }: { contact: Contact; theme: any; onPress: () => void }) {
  const done = isQuizComplete(contact.quiz);
  const archetype = done ? archetypeFor(computeTraits(contact.quiz!.answers), contact) : null;
  return (
    <Pressable onPress={onPress} style={[styles.quizCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <View style={{ flex: 1 }}>
        {done ? (
          <>
            <Text style={[styles.quizQ, { color: theme.ink }]}>{archetype!.title}</Text>
            <Text style={{ color: theme.inkSoft, fontSize: 12, marginTop: 2 }}>Voir le profil et les idées cadeaux</Text>
          </>
        ) : (
          <>
            <Text style={[styles.quizQ, { color: theme.ink }]}>
              Tu connais {contact.prenom} par <Ionicons name="heart" size={14} color={theme.plum} /> ?
            </Text>
            <Text style={{ color: theme.inkSoft, fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
              Quelques choix suffisent à mieux cerner ce qui lui ferait vraiment plaisir.
            </Text>
          </>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.inkSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  favoriteBtn: { padding: 6, marginRight: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  deleteText: { fontWeight: '700', fontSize: 13 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  importText: { fontWeight: '700', fontSize: 13 },
  avatarRow: { alignItems: 'center', marginBottom: 18 },
  twoCol: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, marginBottom: 13 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  dateBtn: { justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 6, marginBottom: 10 },
  reminderHint: { fontSize: 12, lineHeight: 17, marginBottom: 10, marginTop: -4 },
  quizCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  quizQ: { fontWeight: '700', fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
