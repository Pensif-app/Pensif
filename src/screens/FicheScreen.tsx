import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
// L'API "par défaut" d'expo-contacts a basculé vers une nouvelle API à base de classes en SDK 57 ;
// presentContactPickerAsync (fonction) n'existe que dans l'ancienne API, exposée via ce sous-chemin.
import * as Contacts from 'expo-contacts/legacy';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { archetypeFor, computeTraits, isQuizComplete } from '../data/quiz';
import { RootStackParamList } from '../navigation/types';
import { Contact, FamilyRole, Genre } from '../data/types';

const AVATAR_COLORS = ['accent', 'sage', 'plum', 'accentStrong'];
const RELATIONS = ['Amie', 'Ami', 'Famille', 'Collègue', 'Autre'];
const FAMILY_ROLES: FamilyRole[] = [
  'Père',
  'Mère',
  'Frère',
  'Sœur',
  'Fils',
  'Fille',
  'Grand-père',
  'Grand-mère',
  'Oncle',
  'Tante',
  'Cousin',
  'Cousine',
  'Autre',
];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FicheScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Fiche'>>();
  const contactId = route.params?.contactId;
  const { contacts, upsertContact, deleteContact } = useStore();
  const existing = contacts.find((c) => c.id === contactId);

  const [prenom, setPrenom] = useState(existing?.prenom ?? '');
  const [nom, setNom] = useState(existing?.nom ?? '');
  const [tel, setTel] = useState(existing?.tel ?? '');
  const [date, setDate] = useState(existing?.date ?? '');
  const [relation, setRelation] = useState(existing?.relation ?? RELATIONS[0]);
  const [familyRole, setFamilyRole] = useState<FamilyRole | null>(existing?.familyRole ?? null);
  const [genre, setGenre] = useState<Genre | null>(existing?.genre ?? null);
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [showDatePicker, setShowDatePicker] = useState(false);

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
      id: existing?.id ?? `c${Date.now()}`,
      prenom: prenom.trim(),
      nom: nom.trim(),
      tel: tel.trim(),
      date,
      relation,
      familyRole: relation === 'Famille' ? familyRole : null,
      genre,
      initials: existing?.initials ?? `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase(),
      color: existing?.color ?? AVATAR_COLORS[contacts.length % AVATAR_COLORS.length],
      quiz: existing?.quiz ?? null,
      giftSent: existing?.giftSent ?? false,
      favorite,
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
        <Field label="Genre" theme={theme}>
          <View style={styles.chipRow}>
            {(['homme', 'femme'] as Genre[]).map((g) => (
              <Pressable
                key={g}
                onPress={() => setGenre((prev) => (prev === g ? null : g))}
                style={[
                  styles.chip,
                  { borderColor: genre === g ? theme.accent : theme.line, backgroundColor: genre === g ? theme.accentTint : theme.card },
                ]}
              >
                <Text style={{ color: genre === g ? theme.accent : theme.ink, fontWeight: '600', fontSize: 13 }}>
                  {g === 'homme' ? 'Homme' : 'Femme'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>
      </View>

      <View style={styles.twoCol}>
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
        <Field label="Relation" theme={theme}>
          <View style={[styles.input, { borderColor: theme.line, backgroundColor: theme.card, padding: 0 }]}>
            <RelationPicker
              value={relation}
              onChange={(v) => {
                setRelation(v);
                if (v !== 'Famille') setFamilyRole(null);
              }}
              theme={theme}
            />
          </View>
        </Field>
      </View>

      {relation === 'Famille' && (
        <Field label="Lien précis" theme={theme}>
          <View style={styles.chipRow}>
            {FAMILY_ROLES.map((r) => (
              <Pressable
                key={r}
                onPress={() => setFamilyRole(r)}
                style={[
                  styles.chip,
                  { borderColor: familyRole === r ? theme.accent : theme.line, backgroundColor: familyRole === r ? theme.accentTint : theme.card },
                ]}
              >
                <Text style={{ color: familyRole === r ? theme.accent : theme.ink, fontWeight: '600', fontSize: 13 }}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={date ? new Date(date) : new Date(isoToday())}
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

      {existing && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>LE PETIT QUIZZ</Text>
          <QuizSummaryCard contact={existing} theme={theme} onPress={() => navigation.navigate('Quiz', { contactId: existing.id })} />
        </>
      )}

      <View style={{ marginTop: 8 }}>
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

function Field({ label, theme, children }: { label: string; theme: any; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.inkSoft }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function QuizSummaryCard({ contact, theme, onPress }: { contact: Contact; theme: any; onPress: () => void }) {
  const done = isQuizComplete(contact.quiz);
  const archetype = done ? archetypeFor(computeTraits(contact.quiz!.answers)) : null;
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

function RelationPicker({ value, onChange, theme }: { value: string; onChange: (v: string) => void; theme: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.relationTrigger}>
        <Text style={{ color: theme.ink }}>{value}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.inkSoft} />
      </Pressable>
      {open && (
        <View style={[styles.relationList, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {RELATIONS.map((r) => (
            <Pressable key={r} onPress={() => { onChange(r); setOpen(false); }} style={styles.relationItem}>
              <Text style={{ color: theme.ink }}>{r}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  favoriteBtn: { padding: 6, marginRight: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  deleteText: { fontWeight: '700', fontSize: 13 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  importText: { fontWeight: '700', fontSize: 13 },
  twoCol: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, marginBottom: 13 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  dateBtn: { justifyContent: 'center' },
  relationTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  relationList: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  relationItem: { paddingHorizontal: 12, paddingVertical: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 8, marginBottom: 8 },
  quizCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  quizQ: { fontWeight: '700', fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
