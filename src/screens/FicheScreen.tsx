import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
// L'API "par défaut" d'expo-contacts a basculé vers une nouvelle API à base de classes en SDK 57 ;
// presentContactPickerAsync (fonction) n'existe que dans l'ancienne API, exposée via ce sous-chemin.
import * as Contacts from 'expo-contacts/legacy';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { PrimaryButton } from '../components/PrimaryButton';
import { useStore } from '../data/store';
import { useIsDark, useTheme } from '../theme';
import { archetypeFor, computeTraits, INTEREST_OPTIONS, isQuizComplete } from '../data/quiz';
import { chosenGiftFor, savedIdeasFor } from '../data/myIdeas';
import { birthdayCountdownLabel } from '../data/calendar';
import { buildPenseeCards, groupPenseeCards } from '../data/penseesView';
import { contactDeletionMessage } from '../data/contactDeletionMessage';
import { RootStackParamList } from '../navigation/types';
import { Contact, Genre } from '../data/types';
import { generateId } from '../lib/id';

const AVATAR_COLORS = ['accent', 'sage', 'plum', 'accentStrong'];
// CHANTIER "Pré-TestFlight Phase 4B — Relations Couple" (2026-09-22) — 'Couple' ajoutée en fin de
// liste (catégories existantes conservées à l'identique, jamais réordonnées) : `normalizeRelation`
// (ci-dessous) reconnaît automatiquement cette nouvelle valeur du seul fait de sa présence ici,
// aucune autre logique à dupliquer pour ça.
const RELATIONS = ['Famille', 'Couple', 'Ami', 'Autres'];
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
// CHANTIER "Pré-TestFlight Phase 4B — Relations Couple" (2026-09-22) — même mécanisme de paire
// genrée que FAMILY_ROLE_PAIRS, structure strictement équivalente (pas de refonte). 'Partenaire'
// n'est volontairement PAS dans cette liste : c'est un lien neutre, jamais genré, jamais swappé par
// swapFamilyRoleGender/déduit par genreForFamilyRole (voir coupleRoleOptions ci-dessous) — resté en
// dehors de cette passe "Compagnon/Compagne", non demandée ici.
const COUPLE_ROLE_PAIRS: { m: string; f: string }[] = [
  { m: 'Petit ami', f: 'Petite amie' },
  { m: 'Fiancé', f: 'Fiancée' },
  { m: 'Mari', f: 'Épouse' },
];
// Les deux catégories genrées (Famille + Couple) partagent le même mécanisme de bascule/déduction de
// genre (swapFamilyRoleGender/genreForFamilyRole ci-dessous) — une seule liste combinée à chercher,
// jamais deux implémentations parallèles.
const GENDERED_ROLE_PAIRS = [...FAMILY_ROLE_PAIRS, ...COUPLE_ROLE_PAIRS];
function familyRoleOptions(genre: Genre | null): string[] {
  if (genre === 'homme') return [...FAMILY_ROLE_PAIRS.map((p) => p.m), 'Autre'];
  if (genre === 'femme') return [...FAMILY_ROLE_PAIRS.map((p) => p.f), 'Autre'];
  return [...FAMILY_ROLE_PAIRS.flatMap((p) => [p.m, p.f]), 'Autre'];
}
/** 'Partenaire' toujours en tête, jamais affecté par le genre (lien neutre) — les 3 paires restantes
 *  suivent exactement la même règle d'affichage que familyRoleOptions ci-dessus. Pas de 'Autre' ici
 *  (liste fermée à 4 valeurs, telle que demandée dans cette passe). */
function coupleRoleOptions(genre: Genre | null): string[] {
  if (genre === 'homme') return ['Partenaire', ...COUPLE_ROLE_PAIRS.map((p) => p.m)];
  if (genre === 'femme') return ['Partenaire', ...COUPLE_ROLE_PAIRS.map((p) => p.f)];
  return ['Partenaire', ...COUPLE_ROLE_PAIRS.flatMap((p) => [p.m, p.f])];
}
/** Bascule un lien genré (famille OU couple) vers la forme qui correspond au nouveau genre (Frère →
 *  Sœur…, Fiancé → Fiancée…) — 'Partenaire' n'apparaît dans aucune paire, donc jamais affecté. */
function swapFamilyRoleGender(role: string | null, genre: Genre | null): string | null {
  if (!role || !genre) return role;
  const pair = GENDERED_ROLE_PAIRS.find((p) => p.m === role || p.f === role);
  if (!pair) return role;
  return genre === 'homme' ? pair.m : pair.f;
}
/** Déduit le genre à partir d'un lien genré (famille OU couple) — pour le cas inverse : on clique un
 *  lien précis avant d'avoir choisi le genre, autant l'en déduire directement plutôt que de forcer à
 *  re-choisir un genre déjà implicite dans le lien sélectionné. 'Partenaire' → null (neutre par
 *  construction, jamais dans GENDERED_ROLE_PAIRS). */
function genreForFamilyRole(role: string): Genre | null {
  const pair = GENDERED_ROLE_PAIRS.find((p) => p.m === role || p.f === role);
  if (!pair) return null;
  return pair.m === role ? 'homme' : 'femme';
}
// Options de "lien précis", propres à chaque catégorie de relation (Famille/Couple dépendent du
// genre — voir familyRoleOptions/coupleRoleOptions).
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

/**
 * Résumé "N pensées · M à venir" (ou "· M aujourd'hui" si au moins une est active aujourd'hui) —
 * singulier/pluriel et zéro gérés, sans aucun système de priorité : juste un if/else simple sur des
 * comptages déjà calculés par groupPenseeCards (voir CHANTIER PROCHES + FICHE V1 §7).
 */
function penseeSummaryLabel(total: number, todayCount: number, upcomingCount: number): string {
  if (total === 0) return 'Aucune pensée liée pour l’instant.';
  const parts = [`${total} pensée${total > 1 ? 's' : ''}`];
  if (todayCount > 0) parts.push(`${todayCount} aujourd’hui`);
  else if (upcomingCount > 0) parts.push(`${upcomingCount} à venir`);
  return `${parts.join(' · ')}.`;
}

export function FicheScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Fiche'>>();
  const contactId = route.params?.contactId;
  const { contacts, pensees, today, upsertContact, deleteContact } = useStore();
  const existing = contacts.find((c) => c.id === contactId);

  // Pensées liées — calculées uniquement à partir des données/fonctions existantes (filtre direct +
  // buildPenseeCards/groupPenseeCards de penseesView.ts), aucune logique temporelle recréée ici.
  const linkedPenseeGroups = useMemo(() => {
    if (!existing) return { today: [], upcoming: [], past: [] };
    const linked = pensees.filter((p) => p.contactId === existing.id);
    return groupPenseeCards(buildPenseeCards(linked, contacts, today));
  }, [existing, pensees, contacts, today]);
  const linkedPenseeTotal = linkedPenseeGroups.today.length + linkedPenseeGroups.upcoming.length + linkedPenseeGroups.past.length;

  const initialRelation = normalizeRelation(existing?.relation);
  const [prenom, setPrenom] = useState(existing?.prenom ?? '');
  const [nom, setNom] = useState(existing?.nom ?? '');
  const [tel, setTel] = useState(existing?.tel ?? '');
  const [date, setDate] = useState(existing?.date ?? '');
  const [relation, setRelation] = useState(initialRelation);
  const [familyRole, setFamilyRole] = useState<string | null>(existing?.familyRole ?? null);
  const [genre, setGenre] = useState<Genre | null>(existing?.genre ?? null);
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  // Build 9, lot C : un proche existant s'ouvre en LECTURE (cartes dépliables) ; le formulaire n'est plus que le
  // mode « Modifier ». Un nouveau proche s'ouvre directement en modification (flux de création inchangé).
  const [mode, setMode] = useState<'view' | 'edit'>(existing ? 'view' : 'edit');
  // Une seule carte dépliée à la fois.
  const [openCard, setOpenCard] = useState<'idees' | 'portrait' | 'pensees' | 'rappel' | null>(null);
  // Ouvert d'office pour un nouveau contact SUR iOS SEULEMENT : sans ça, rien n'indique qu'il faut
  // renseigner l'anniversaire avant de pouvoir enregistrer (la fiche refuse sinon silencieusement
  // l'échec) — comportement iOS existant, non modifié. Sur Android, le DateTimePicker natif est une
  // boîte de dialogue modale (pas un composant inline) : il ne doit jamais s'ouvrir tout seul,
  // uniquement au tap explicite sur le champ.
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios' && !existing);

  // CHANTIER AUDIT PRÉ-BÊTA §1 — garde anti-double-tap sur save() : même principe que busyRef
  // (CaptureScreen)/isTransitioning (QuizScreen), pas un debounce temporel arbitraire. `save()` est
  // entièrement SYNCHRONE (aucun await) — verrouillée juste avant l'upsert/navigation.goBack(), elle
  // n'est JAMAIS déverrouillée sur le chemin de succès (inutile : navigation.goBack() démonte cet
  // écran, un second tap pendant la transition de sortie retombe donc toujours sur la garde déjà
  // posée, jamais sur un second upsertContact). Déverrouillée UNIQUEMENT si une exception empêchait
  // la navigation de se produire (l'utilisateur resterait alors sur l'écran, et doit pouvoir réessayer).
  const savingRef = useRef(false);

  const avatarColor = existing?.color ?? AVATAR_COLORS[contacts.length % AVATAR_COLORS.length];
  const previewInitials = useMemo(() => {
    const i = `${prenom.trim()[0] ?? ''}${nom.trim()[0] ?? ''}`.toUpperCase();
    return i || '?';
  }, [prenom, nom]);

  useEffect(() => {
    // Seule source du titre (voir RootNavigator.tsx, qui ne fixe plus rien de statique) : le
    // prénom du proche (+ nom si présent — la troncature native gère un nom trop long), ou "Nouveau
    // proche" à la création — plus jamais un intitulé générique (voir CHANTIER PROCHES + FICHE V1 §6).
    navigation.setOptions({
      title: existing ? `${existing.prenom} ${existing.nom}`.trim() : 'Nouveau proche',
      headerRight: () => {
        const viewing = !!existing && mode === 'view';
        const starred = viewing ? !!existing?.favorite : favorite;
        return (
          <View style={styles.headerActions}>
            {viewing && (
              <Pressable
                onPress={startEditing}
                accessibilityRole="button"
                accessibilityLabel="Modifier la fiche"
                style={styles.favoriteBtn}
              >
                <Ionicons name="create-outline" size={22} color={theme.inkSoft} />
              </Pressable>
            )}
            <Pressable
              onPress={() => (viewing && existing ? upsertContact({ ...existing, favorite: !existing.favorite }) : setFavorite((v) => !v))}
              accessibilityRole="button"
              accessibilityLabel={starred ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              style={styles.favoriteBtn}
            >
              <Ionicons name={starred ? 'star' : 'star-outline'} size={22} color={starred ? theme.plum : theme.inkSoft} />
            </Pressable>
          </View>
        );
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, navigation, favorite, theme, mode]);

  // CHANTIER AUDIT PRÉ-BÊTA (2026-09-15) — §2 : un contact ouvert avec un id existant qui disparaît
  // du store PENDANT que cet écran reste monté (suppression déclenchée ailleurs) ne doit JAMAIS
  // basculer silencieusement cet écran en mode création. Même principe que PenseeDetailScreen.tsx
  // (`if (penseeId && !existing)`) — placé APRÈS tous les hooks (règle des Hooks React : jamais
  // d'appel de hook conditionnel), donc avant les autres fonctions/le rendu principal qui, eux,
  // supposent `existing` cohérent avec `contactId`.
  if (contactId && !existing) {
    return (
      <Screen>
        <Text style={[styles.label, { color: theme.ink, fontSize: 18, fontWeight: '700', marginBottom: 6 }]}>
          Ce proche n’est plus disponible
        </Text>
        <Text style={{ color: theme.inkSoft, fontSize: 13 }}>Il a peut-être été supprimé.</Text>
        <Pressable onPress={() => navigation.goBack()} style={[styles.importBtn, { marginTop: 16, borderColor: theme.line, backgroundColor: theme.card }]}>
          <Text style={{ color: theme.ink, fontWeight: '700' }}>Retour</Text>
        </Pressable>
      </Screen>
    );
  }

  /** Passe en modification en repartant des valeurs enregistrées (jamais d'un brouillon périmé). */
  function startEditing() {
    if (!existing) return;
    setPrenom(existing.prenom);
    setNom(existing.nom);
    setTel(existing.tel);
    setDate(existing.date);
    setRelation(normalizeRelation(existing.relation));
    setFamilyRole(existing.familyRole);
    setGenre(existing.genre);
    setFavorite(existing.favorite);
    setShowDatePicker(false);
    savingRef.current = false;
    setMode('edit');
  }

  function cancelEditing() {
    setShowDatePicker(false);
    setMode('view');
  }

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
    // CHANTIER SUPPRESSION/INTÉGRITÉ (2026-09-15) — décision produit validée : supprimer un proche
    // NE supprime JAMAIS ses pensées liées (comportement `deleteContact`/schema.sql inchangé, voir
    // store.tsx : `contactId` passe à null, jamais un delete en cascade). Seul CE texte change, pour
    // que l'utilisateur le sache clairement AVANT de confirmer, plutôt que de le découvrir après coup.
    const linkedCount = pensees.filter((p) => p.contactId === existing.id).length;
    Alert.alert(
      `Supprimer ${existing.prenom} ?`,
      contactDeletionMessage(linkedCount),
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
    if (savingRef.current) return; // sauvegarde déjà en cours (ou déjà réussie) — ignore un second tap
    if (!prenom.trim()) {
      Alert.alert('Prénom manquant', 'Donne au moins un prénom pour enregistrer la fiche.');
      return;
    }
    if (!date) {
      Alert.alert('Date manquante', "Choisis la date d'anniversaire avant d'enregistrer la fiche.");
      return;
    }
    savingRef.current = true;
    try {
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
        giftPreparedYear: existing?.giftPreparedYear ?? null,
        favorite,
        birthdayReminderDays: existing?.birthdayReminderDays ?? null,
      };
      upsertContact(contact);
      if (existing) {
        // Build 9 : « Enregistrer » ramène à la fiche en lecture (le garde anti-double-tap est relâché : l'écran reste monté).
        savingRef.current = false;
        setShowDatePicker(false);
        setMode('view');
      } else {
        navigation.goBack();
      }
    } catch (e) {
      // La navigation n'a pas eu lieu — l'utilisateur reste sur cet écran, il doit pouvoir réessayer.
      savingRef.current = false;
      throw e;
    }
  }

  const savedIdeas = existing ? savedIdeasFor(existing) : [];
  const chosenGift = existing ? chosenGiftFor(existing, today) : null;
  const quizDone = !!existing && isQuizComplete(existing.quiz);
  const reminderLabel = BIRTHDAY_REMINDER_OPTIONS.find((o) => o.days === existing?.birthdayReminderDays)?.label;
  const toggleCard = (card: NonNullable<typeof openCard>) => setOpenCard((prev) => (prev === card ? null : card));

  const ideasSummary = !quizDone
    ? 'Fais d’abord son portrait'
    : `${savedIdeas.length} idée${savedIdeas.length > 1 ? 's' : ''} aimée${savedIdeas.length > 1 ? 's' : ''}${chosenGift ? ' · cadeau prévu' : ''}`;

  return (
    <Screen>
      {existing && mode === 'view' ? (
        <>
          {/* Build 9, lot C : fiche en LECTURE. Synthèse + cartes dépliables au toucher (une seule ouverte à la fois) ;
              tout ce qui se règle est dans le mode « Modifier » (crayon en haut à droite). */}
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <Avatar initials={previewInitials} colorKey={avatarColor} theme={theme} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.summaryName, { color: theme.ink }]}>{`${existing.prenom} ${existing.nom}`.trim()}</Text>
              <Text style={[styles.summaryMeta, { color: theme.inkSoft }]}>
                {existing.familyRole ?? existing.relation}
                {existing.date ? ` · ${birthdayCountdownLabel(existing.date, today)}` : ''}
              </Text>
            </View>
          </View>

          <InfoCard icon="gift-outline" title="Idées cadeaux" summary={ideasSummary} open={openCard === 'idees'} onToggle={() => toggleCard('idees')} theme={theme}>
            {chosenGift && (
              <Text style={{ color: theme.ink, fontSize: 13, marginBottom: 8 }}>Cadeau prévu : {chosenGift.title}</Text>
            )}
            {savedIdeas.slice(0, 3).map((g) => (
              <Text key={g.id} style={{ color: theme.inkSoft, fontSize: 13, marginBottom: 4 }}>
                {g.emoji} {g.title}
              </Text>
            ))}
            {savedIdeas.length > 0 && (
              <Pressable
                onPress={() => navigation.navigate('MesIdees', { contactId: existing.id })}
                style={[styles.giftsLink, { borderColor: theme.line, marginTop: 6 }]}
              >
                <Ionicons name="heart-outline" size={16} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Mes idées pour {existing.prenom}</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.accent} />
              </Pressable>
            )}
            {/* Cadeaux n'est plus un onglet permanent (voir CHANTIER ONGLET PENSÉES V1) — sans ce lien, les idées
                cadeaux d'un proche autre que "le plus proche" deviendraient difficiles à retrouver. Uniquement
                quand le quiz est fait : un écran Cadeaux sans quiz n'aurait rien à proposer. */}
            {quizDone ? (
              <Pressable
                onPress={() => navigation.navigate('Cadeaux', { contactId: existing.id })}
                style={[styles.giftsLink, { borderColor: theme.line, marginTop: 6 }]}
              >
                <Ionicons name="gift-outline" size={16} color={theme.accent} />
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Voir ses idées cadeaux</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.accent} />
              </Pressable>
            ) : (
              <Text style={{ color: theme.inkSoft, fontSize: 12 }}>Le portrait permet de proposer des idées vraiment adaptées.</Text>
            )}
          </InfoCard>

          <InfoCard
            icon="sparkles-outline"
            title="Portrait"
            summary={quizDone ? archetypeFor(computeTraits(existing.quiz!.answers), existing).title : 'À faire'}
            open={openCard === 'portrait'}
            onToggle={() => toggleCard('portrait')}
            theme={theme}
          >
            {quizDone && existing.quiz!.interests.length > 0 && (
              <Text style={{ color: theme.inkSoft, fontSize: 13, marginBottom: 10 }}>
                {existing.quiz!.interests.map((k) => INTEREST_OPTIONS.find((o) => o.key === k)?.label ?? k).join(' · ')}
              </Text>
            )}
            {/* push (pas navigate) : CAUSE RÉELLE DU BUG "impossible de modifier un quiz déjà complété" — si un écran
                'Quiz' pour ce contact est déjà quelque part dans la pile, `navigate('Quiz', ...)` se contente de
                refocaliser cette instance déjà montée, figée à son ancien `step`. `push` monte TOUJOURS une instance
                neuve ; `mode: 'edit'` quand le quiz est déjà complété repart de la question 1. */}
            <QuizSummaryCard
              contact={existing}
              theme={theme}
              onPress={() => navigation.push('Quiz', { contactId: existing.id, mode: isQuizComplete(existing.quiz) ? 'edit' : 'default' })}
            />
          </InfoCard>

          <InfoCard
            icon="chatbox-ellipses-outline"
            title="Pensées liées"
            summary={penseeSummaryLabel(linkedPenseeTotal, linkedPenseeGroups.today.length, linkedPenseeGroups.upcoming.length).replace(/\.$/, '')}
            open={openCard === 'pensees'}
            onToggle={() => toggleCard('pensees')}
            theme={theme}
          >
            <Pressable
              onPress={() => navigation.navigate('Tabs', { screen: 'Pensées', params: { contactId: existing.id } })}
              style={[styles.giftsLink, { borderColor: theme.line }]}
            >
              <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.accent} />
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, flex: 1 }}>Voir les pensées</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.accent} />
            </Pressable>
          </InfoCard>

          <InfoCard
            icon="alarm-outline"
            title="Rappel d’anniversaire"
            summary={reminderLabel ? `${reminderLabel} et le jour J` : 'Le jour J seulement'}
            open={openCard === 'rappel'}
            onToggle={() => toggleCard('rappel')}
            theme={theme}
          >
            <Text style={[styles.reminderHint, { color: theme.inkSoft }]}>
              Une alerte le jour J est toujours envoyée. Tu peux en ajouter une avant, pour avoir le temps de préparer
              quelque chose.
            </Text>
            <ChipRow>
              {BIRTHDAY_REMINDER_OPTIONS.map((opt) => (
                <Chip
                  key={String(opt.days)}
                  label={opt.label}
                  active={existing.birthdayReminderDays === opt.days}
                  theme={theme}
                  onPress={() => upsertContact({ ...existing, birthdayReminderDays: existing.birthdayReminderDays === opt.days ? null : opt.days })}
                />
              ))}
            </ChipRow>
          </InfoCard>

          {/* CHANTIER UX — exposer `thinking_of_you` (2026-09-17) : volontaire, sans anniversaire ni événement
              particulier — jamais de carte automatique équivalente sur Accueil. Aucun `penseeId` : MessageScreen
              construira son contexte à partir des pensées/quiz existants du contact. */}
          <Pressable
            onPress={() => navigation.navigate('Message', { contactId: existing.id, occasion: 'thinking_of_you' })}
            style={[styles.messageRow, { backgroundColor: theme.card, borderColor: theme.line }]}
          >
            <Ionicons name="chatbox-ellipses-outline" size={18} color={theme.accent} />
            <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 14, flex: 1 }}>Écrire un message</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.accent} />
          </Pressable>
        </>
      ) : (
        <>
      {!existing && (
        <Pressable
          onPress={importFromContacts}
          style={[styles.importBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Ionicons name="people" size={16} color={theme.plum} />
          <Text style={[styles.importText, { color: theme.plum }]}>Importer depuis mes contacts</Text>
        </Pressable>
      )}

      {existing ? (
        // Synthèse compacte pour un proche déjà enregistré — identité + relation + prochain
        // anniversaire, en un coup d'œil avant même les champs du formulaire (voir CHANTIER
        // PROCHES + FICHE V1 §5). Volontairement une seule rangée, pas une hero card : pas de
        // synthèse pour un nouveau proche, qui garde le flux création/import tel quel.
        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Avatar initials={previewInitials} colorKey={avatarColor} theme={theme} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryName, { color: theme.ink }]}>{`${prenom} ${nom}`.trim()}</Text>
            <Text style={[styles.summaryMeta, { color: theme.inkSoft }]}>
              {familyRole ?? relation}
              {date ? ` · ${birthdayCountdownLabel(date, today)}` : ''}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.avatarRow}>
          <Avatar initials={previewInitials} colorKey={avatarColor} theme={theme} size={64} />
        </View>
      )}

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
            <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
          </Pressable>
        </Field>
      </View>

      {showDatePicker && (
        <DateTimePicker
          themeVariant={isDark ? 'dark' : 'light'}
          // Par défaut sur l'an 2000 plutôt que la date du jour — une naissance est bien plus
          // souvent proche de cette année-là, ça évite de faire défiler la molette très loin.
          value={date ? new Date(date) : new Date(2000, 0, 1)}
          mode="date"
          // iOS : roulette inline inchangée. Android : boîte de dialogue native "calendar" explicite
          // (jamais le spinner Android, jamais affichée ailleurs qu'au tap sur le champ ci-dessus).
          display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
          onChange={(_, selected) => {
            // Sur Android, l'événement arrive une seule fois (validation OU annulation) et le
            // dialogue se ferme tout seul côté OS — on referme donc toujours notre état ici. Sur
            // iOS, la roulette reste affichée en continu (comportement existant, inchangé).
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
          {(relation === 'Famille'
            ? familyRoleOptions(genre)
            : relation === 'Couple'
              ? coupleRoleOptions(genre)
              : LIEN_OPTIONS_STATIC[relation] ?? []
          ).map((r) => (
            <Chip
              key={r}
              label={r}
              active={familyRole === r}
              theme={theme}
              onPress={() => {
                setFamilyRole(r);
                // "Frère"/"Fiancé" cliqué avant tout choix de genre → en déduire Homme directement,
                // plutôt que de laisser le genre vide alors que le lien l'indique déjà sans
                // ambiguïté — même mécanisme pour Famille et Couple (genreForFamilyRole renvoie
                // null pour 'Partenaire', neutre par construction : aucun genre n'est alors déduit).
                if ((relation === 'Famille' || relation === 'Couple') && !genre) {
                  const inferred = genreForFamilyRole(r);
                  if (inferred) setGenre(inferred);
                }
              }}
            />
          ))}
        </ChipRow>
      </Field>


          <View style={{ marginTop: 12 }}>
            <PrimaryButton label="Enregistrer la fiche" onPress={save} />
          </View>

          {existing && (
            <>
              <Pressable onPress={cancelEditing} style={styles.cancelBtn}>
                <Text style={{ color: theme.inkSoft, fontWeight: '700', fontSize: 14 }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={remove} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={15} color={theme.danger} />
                <Text style={[styles.deleteText, { color: theme.danger }]}>Supprimer ce proche</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/** Carte dépliable de la fiche en lecture : une ligne de résumé, le détail au toucher. */
function InfoCard({
  icon,
  title,
  summary,
  open,
  onToggle,
  theme,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  theme: any;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: open ? theme.accent : theme.line }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${summary}`}
        style={styles.infoHeader}
      >
        <Ionicons name={icon} size={18} color={theme.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 14 }}>{title}</Text>
          <Text style={{ color: theme.inkSoft, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.inkSoft} />
      </Pressable>
      {open && <View style={styles.infoBody}>{children}</View>}
    </View>
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
            {/* CTA explicite pour rouvrir le quiz déjà complété — ce même Pressable navigue déjà
                vers 'Quiz' quel que soit l'état (voir onPress ci-dessus/plus bas), seul ce libellé
                changeait pour ne pas suggérer qu'on peut le modifier. */}
            <Text style={{ color: theme.inkSoft, fontSize: 12, marginTop: 2 }}>Modifier le portrait</Text>
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  infoCard: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  infoBody: { paddingHorizontal: 14, paddingBottom: 14 },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  deleteText: { fontWeight: '700', fontSize: 13 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  importText: { fontWeight: '700', fontSize: 13 },
  avatarRow: { alignItems: 'center', marginBottom: 18 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 18 },
  summaryName: { fontWeight: '700', fontSize: 16 },
  summaryMeta: { fontSize: 12, marginTop: 3 },
  twoCol: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, marginBottom: 13 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 6, marginBottom: 10 },
  reminderHint: { fontSize: 12, lineHeight: 17, marginBottom: 10, marginTop: -4 },
  quizCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  giftsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 2 },
  quizQ: { fontWeight: '700', fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});
