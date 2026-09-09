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
import { RootStackParamList } from '../navigation/types';
import { Contact } from '../data/types';

const AVATAR_COLORS = ['accent', 'sage', 'plum', 'accentStrong'];
const RELATIONS = ['Amie', 'Ami', 'Famille', 'Collègue', 'Autre'];

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
  const [q1, setQ1] = useState(existing?.q1 ?? '');
  const [q2, setQ2] = useState(existing?.q2 ?? '');
  const [q3, setQ3] = useState(existing?.q3 ?? '');
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
          <Ionicons name={favorite ? 'star' : 'star-outline'} size={22} color={favorite ? theme.accentStrong : theme.inkSoft} />
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
      initials: existing?.initials ?? `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase(),
      color: existing?.color ?? AVATAR_COLORS[contacts.length % AVATAR_COLORS.length],
      q1: q1.trim(),
      q2: q2.trim(),
      q3: q3.trim(),
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
            <RelationPicker value={relation} onChange={setRelation} theme={theme} />
          </View>
        </Field>
      </View>

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

      <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>LE PETIT QUIZZ</Text>
      <QuizField question="Qu'est-ce qu'elle/il aime faire de son temps libre ?" value={q1} onChangeText={setQ1} theme={theme} />
      <QuizField question="Un style ou une couleur qu'elle/il porte souvent ?" value={q2} onChangeText={setQ2} theme={theme} />
      <QuizField question="Un truc dont elle/il a envie depuis un moment ?" value={q3} onChangeText={setQ3} theme={theme} />

      <View style={{ marginTop: 8 }}>
        <PrimaryButton label="Enregistrer la fiche" onPress={save} />
      </View>

      {existing && (
        <Pressable onPress={remove} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={15} color={theme.civil} />
          <Text style={[styles.deleteText, { color: theme.civil }]}>Supprimer ce contact</Text>
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

function QuizField({ question, value, onChangeText, theme }: { question: string; value: string; onChangeText: (t: string) => void; theme: any }) {
  return (
    <View style={[styles.quizCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.quizQ, { color: theme.plum }]}>{question}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Pas encore répondu — à compléter"
        placeholderTextColor={theme.inkSoft}
        multiline
        style={[styles.quizInput, { color: theme.ink }]}
      />
    </View>
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
  quizCard: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10 },
  quizQ: { fontWeight: '700', fontSize: 13, marginBottom: 6 },
  quizInput: { fontSize: 14, minHeight: 44, textAlignVertical: 'top' },
});
