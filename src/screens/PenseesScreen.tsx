import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { SelectionHeader } from '../components/SelectionHeader';
import { Avatar } from '../components/Avatar';
import { ContactPicker } from '../components/ContactPicker';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { buildPenseeCards, groupPenseeCards, PenseeCard } from '../data/penseesView';
import { frDate, penseeSubtitle } from '../data/calendar';
import { Contact } from '../data/types';
import { RootStackParamList, TabParamList } from '../navigation/types';

/**
 * Onglet "Pensées" — ce que l'utilisateur a confié à Pensif (texte, éventuellement un jour/une
 * période, un proche lié, un rappel), pas une todo-list : aucune action "à faire" n'apparaît ici,
 * seulement ce qui a été noté. Depuis CHANTIER PENSÉES V2, une pensée n'a plus besoin d'aucune date
 * ni d'aucun rappel — création/édition/suppression se font désormais directement depuis cet écran
 * (PenseeDetailScreen, ouvert par le "+" ou par un tap sur une carte), en plus du Calendrier qui
 * reste un point d'entrée valide pour une pensée liée à un jour précis (surlignage de période
 * compris).
 *
 * `contactId` (route param optionnel) filtre sur un seul proche — contexte de navigation ponctuel
 * (ex. Fiche → "Voir les pensées"), JAMAIS un état persistant : un tap direct sur l'onglet Pensées
 * le réinitialise toujours (voir tabNavigationHelpers.ts). Sans paramètre, comportement inchangé.
 */
export function PenseesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<TabParamList, 'Pensées'>>();
  const { pensees, contacts, today, deletePensee } = useStore();
  const [showPast, setShowPast] = useState(false);
  // CHANTIER UX §3 (2026-09-15) — sélection multiple déclenchée par appui long. `selectedIds` n'a
  // de sens QUE pendant `selectionMode` (voir exitSelectionMode, toujours appelé ensemble) — pas de
  // Set qui survivrait silencieusement à une sortie de mode.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // CHANTIER "Pré-TestFlight Phase 4E — Filtre contact dans Pensées" (2026-09-22) — état du
  // ContactPicker partagé (aucun second système de sélection, voir §3 du chantier).
  const [contactPickerOpen, setContactPickerOpen] = useState(false);

  const filterContactId = route.params?.contactId;
  const filterContact = filterContactId ? contacts.find((c) => c.id === filterContactId) : undefined;
  // CORRECTIF §10 du chantier — un `contactId` qui ne correspond plus à AUCUN contact (proche
  // supprimé entre-temps, ou tout param orphelin) ne doit jamais laisser cet écran bloqué sur un
  // état incohérent ("Pensées de undefined"/liste vide sans explication) : il n'est alors simplement
  // plus considéré comme un filtre actif — fallback sûr et immédiat vers "Toutes les pensées", sans
  // action utilisateur requise. Un `filterContactId` valide (contact trouvé) reste inchangé.
  const isFiltered = Boolean(filterContactId) && Boolean(filterContact);
  const effectiveFilterContactId = isFiltered ? filterContactId : undefined;

  const visiblePensees = useMemo(
    () => (effectiveFilterContactId ? pensees.filter((p) => p.contactId === effectiveFilterContactId) : pensees),
    [pensees, effectiveFilterContactId],
  );

  // CHANTIER PENSÉES V3 §5 — une pensée épinglée est affichée EN HAUT (pinnedCards), jamais une
  // deuxième fois dans sa section habituelle : `groups` (Aujourd'hui/À venir/Mémorisées/Passées) est
  // donc calculé sur les cartes NON épinglées uniquement — aucun changement de buildPenseeCards/
  // groupPenseeCards (penseesView.ts), on filtre juste ce qu'on leur donne en entrée.
  const allCards = useMemo(() => buildPenseeCards(visiblePensees, contacts, today), [visiblePensees, contacts, today]);
  const pinnedCards = useMemo(() => allCards.filter((c) => c.pensee.pinned), [allCards]);
  const unpinnedCards = useMemo(() => allCards.filter((c) => !c.pensee.pinned), [allCards]);
  const groups = useMemo(() => groupPenseeCards(unpinnedCards), [unpinnedCards]);
  // CHANTIER PENSÉES V3 §1 — au maximum 3 pensées mémorisées sur cet écran (déjà triées de la plus
  // récente à la plus ancienne par groupPenseeCards via `createdAt`, seul timestamp pertinent déjà
  // présent sur le modèle — voir audit du chantier, aucun nouveau champ inventé). Le reste reste
  // accessible via l'écran dédié "Pensées mémorisées" (§2), jamais silencieusement perdu.
  const memoVisible = useMemo(() => groups.memo.slice(0, 3), [groups.memo]);
  const hasMoreMemo = groups.memo.length > 3;

  // CHANTIER "Pré-TestFlight Phase 4D — UI Pensées mémorisées" (2026-09-22) — résolution du contact
  // pour une carte memo (voir PenseeRow/MemoPenseeRow) : ignoré par tout bucket != 'memo', calculé
  // ici une seule fois plutôt que dans chaque section pour ne pas dupliquer le lookup.
  function contactForCard(card: PenseeCard): Contact | null {
    if (!card.pensee.contactId) return null;
    return contacts.find((c) => c.id === card.pensee.contactId) ?? null;
  }

  function openDetail(penseeId: string) {
    navigation.navigate('PenseeDetail', { penseeId });
  }

  function openCreate() {
    navigation.navigate('PenseeDetail', { contactId: effectiveFilterContactId });
  }

  // Hors mode sélection : appui long entre en mode sélection avec CETTE carte immédiatement
  // sélectionnée. Déjà en mode sélection : un appui long ne fait rien de spécial (le tap normal sur
  // la même carte, voir handleCardPress, fait déjà sélectionner/désélectionner).
  function handleCardLongPress(penseeId: string) {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds(new Set([penseeId]));
  }

  // Hors mode sélection : tap normal → ouvre PenseeDetail, comportement inchangé. En mode
  // sélection : tap → bascule la sélection de cette carte, jamais de navigation.
  function handleCardPress(penseeId: string) {
    if (!selectionMode) {
      openDetail(penseeId);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(penseeId)) next.delete(penseeId);
      else next.add(penseeId);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function confirmDeleteSelected() {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      count === 1 ? 'Supprimer cette pensée ?' : `Supprimer ${count} pensées ?`,
      'Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            // `deletePensee` existant, UN appel par pensée — même chemin optimiste local + outbox
            // que la suppression individuelle (CalendarScreen/PenseeDetailScreen) : jamais contourné,
            // fonctionne offline à l'identique (chaque suppression s'enqueue indépendamment).
            selectedIds.forEach((id) => deletePensee(id));
            exitSelectionMode();
          },
        },
      ],
    );
  }

  function clearFilter() {
    // setParams (pas navigate) : reste sur cet écran, retire juste le contexte de filtrage — voir
    // §9 du chantier, le filtre ne doit jamais devenir un état global.
    (navigation as any).setParams({ contactId: undefined });
  }

  // CHANTIER "Pré-TestFlight Phase 4E — Filtre contact dans Pensées" (2026-09-22) — §1 : une SEULE
  // source de vérité (route.params.contactId, déjà consommée par visiblePensees/filterContact
  // ci-dessus) — sélectionner un contact ici aboutit exactement au même état que Fiche → "Voir les
  // pensées" (même navigation.navigate('Tabs', { screen: 'Pensées', params: { contactId } }) côté
  // FicheScreen.tsx, même `setParams` ici : jamais un second état local parallèle.
  function selectContact(contactId: string) {
    (navigation as any).setParams({ contactId });
    setContactPickerOpen(false);
  }

  const isEmpty = visiblePensees.length === 0;

  return (
    <Screen>
      {selectionMode ? (
        // Remplace ENTIÈREMENT le header normal pendant la sélection — pas de bouton Capture/Ajouter
        // accessible dans cet état, uniquement Annuler/Supprimer (voir §3 du chantier). CORRECTIF UX
        // §5 (2026-09-16) — header mutualisé (SelectionHeader), qui ne déborde plus jamais (voir ce
        // composant pour le détail de la correction).
        <SelectionHeader
          count={selectedIds.size}
          singular="sélectionnée"
          plural="sélectionnées"
          onCancel={exitSelectionMode}
          onDelete={confirmDeleteSelected}
          theme={theme}
        />
      ) : (
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: theme.ink }]}>{isFiltered ? `Pensées de ${filterContact?.prenom ?? 'ce proche'}` : 'Pensées'}</Text>
            {isFiltered ? (
              <Pressable onPress={clearFilter} style={styles.clearFilterBtn}>
                <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Toutes les pensées</Text>
              </Pressable>
            ) : (
              <Text style={[styles.sub, { color: theme.inkSoft }]}>Ce que tu as confié à Pensif.</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Point d'entrée secondaire de la capture intelligente — plus discret que sur Accueil
                (même fond neutre que "Ajouter"), même action (voir architecture Capture Intelligente).
                Taille agrandie (§3 chantier UX icônes headers) — styles.micIconBtn DÉDIÉ (48x48, icône
                28px), le bouton "Ajouter" juste à côté garde sa taille (styles.iconBtn, 36x36) : seul le
                micro grossit. alignItems:'center' sur la rangée pour l'alignement malgré la différence
                de hauteur. */}
            <Pressable
              onPress={() => navigation.navigate('Capture')}
              accessibilityRole="button"
              accessibilityLabel="Capture intelligente"
              style={[styles.micIconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            >
              <Ionicons name="mic-outline" size={28} color={theme.inkSoft} />
            </Pressable>
            <Pressable
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une pensée"
              style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            >
              <Ionicons name="add" size={20} color={theme.ink} />
            </Pressable>
          </View>
        </View>
      )}

      {/* CHANTIER "Pré-TestFlight Phase 4E — Filtre contact dans Pensées" (2026-09-22) — contrôle
          discret UNIQUE (§2 du chantier) : pas de barre de recherche permanente, pas de rangée de
          contacts, pas de chips multiples. Masqué en mode sélection (même principe que le header
          normal juste au-dessus). Le libellé "Pensées de {prénom}"/"Toutes les pensées" du header
          donne déjà l'information de contexte — ce bouton ne la répète jamais, il ne fait qu'ouvrir
          l'action (§5 : éviter les informations redondantes). */}
      {!selectionMode && (
        <Pressable
          onPress={() => setContactPickerOpen(true)}
          style={[styles.filterPill, { borderColor: theme.line, backgroundColor: theme.card }]}
        >
          <Ionicons name="people-outline" size={14} color={theme.inkSoft} />
          <Text style={[styles.filterPillLabel, { color: theme.inkSoft }]}>{isFiltered ? 'Changer de proche' : 'Filtrer par proche'}</Text>
        </Pressable>
      )}

      {/* CHANTIER PENSÉES V3 §5 — jamais de titre/bloc "ÉPINGLÉES" vide : rendu conditionnel strict,
          l'interface reste identique à avant pour qui n'épingle jamais rien. */}
      {pinnedCards.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.inkSoft, marginTop: 4 }]}>ÉPINGLÉES</Text>
          {pinnedCards.map((c) => (
            <PenseeRow
              key={c.id}
              card={c}
              theme={theme}
              onPress={() => handleCardPress(c.pensee.id)}
              onLongPress={() => handleCardLongPress(c.pensee.id)}
              selectionMode={selectionMode}
              selected={selectedIds.has(c.pensee.id)}
              contact={contactForCard(c)}
              memoVariant="compact"
            />
          ))}
        </>
      )}

      {isEmpty ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>
            {isFiltered ? 'Rien de noté pour ce proche' : 'Rien à retenir pour le moment'}
          </Text>
          <Text style={[styles.emptyBody, { color: theme.inkSoft }]}>
            {isFiltered
              ? `Tu n’as pas encore confié de pensée liée à ${filterContact?.prenom ?? 'ce proche'}.`
              : 'Note une petite chose que tu aimerais que Pensif retienne — une date n’est pas obligatoire.'}
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <PrimaryButton label="Ajouter une pensée" onPress={openCreate} />
          </View>
        </View>
      ) : (
        <>
          {groups.today.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>AUJOURD'HUI</Text>
              {groups.today.map((c) => (
                <PenseeRow
                  key={c.id}
                  card={c}
                  theme={theme}
                  onPress={() => handleCardPress(c.pensee.id)}
                  onLongPress={() => handleCardLongPress(c.pensee.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(c.pensee.id)}
                  contact={contactForCard(c)}
                  memoVariant="compact"
                />
              ))}
            </>
          )}

          {groups.upcoming.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>À VENIR</Text>
              {groups.upcoming.map((c) => (
                <PenseeRow
                  key={c.id}
                  card={c}
                  theme={theme}
                  onPress={() => handleCardPress(c.pensee.id)}
                  onLongPress={() => handleCardLongPress(c.pensee.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(c.pensee.id)}
                  contact={contactForCard(c)}
                  memoVariant="compact"
                />
              ))}
            </>
          )}

          {groups.today.length === 0 && groups.upcoming.length === 0 && groups.memo.length === 0 && groups.past.length > 0 && (
            <Text style={[styles.emptyInline, { color: theme.inkSoft }]}>Rien d’actif ou à venir pour l’instant.</Text>
          )}

          {memoVisible.length > 0 && (
            <>
              {/* Pensées sans aucune date ni rappel — jamais reléguées en "passées" simplement
                  parce qu'elles vieillissent (CHANTIER PENSÉES V2). CHANTIER PENSÉES V3 §1 : au
                  maximum 3 ici (les plus récentes), pour que cet écran garde à peu près la même
                  hauteur qu'il existe 10 ou 1000 pensées mémorisées. */}
              <Text style={[styles.sectionLabel, { color: theme.inkSoft }]}>MÉMORISÉES</Text>
              {memoVisible.map((c) => (
                <PenseeRow
                  key={c.id}
                  card={c}
                  theme={theme}
                  onPress={() => handleCardPress(c.pensee.id)}
                  onLongPress={() => handleCardLongPress(c.pensee.id)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(c.pensee.id)}
                  contact={contactForCard(c)}
                  memoVariant="compact"
                />
              ))}
              {hasMoreMemo && (
                <Pressable onPress={() => navigation.navigate('PenseesMemorisees')} style={styles.seeAllBtn}>
                  <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Voir toutes les pensées mémorisées</Text>
                </Pressable>
              )}
            </>
          )}

          {groups.past.length > 0 && (
            <>
              <Pressable onPress={() => setShowPast((v) => !v)} style={styles.pastToggle}>
                <Text style={[styles.sectionLabel, { color: theme.inkSoft, marginBottom: 0 }]}>
                  PASSÉES ({groups.past.length})
                </Text>
                <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={16} color={theme.inkSoft} />
              </Pressable>
              {showPast &&
                groups.past.map((c) => (
                  <PenseeRow
                    key={c.id}
                    card={c}
                    theme={theme}
                    onPress={() => handleCardPress(c.pensee.id)}
                    onLongPress={() => handleCardLongPress(c.pensee.id)}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(c.pensee.id)}
                    contact={contactForCard(c)}
                    memoVariant="compact"
                    muted
                  />
                ))}
            </>
          )}
        </>
      )}

      {/* CHANTIER "Pré-TestFlight Phase 4E — Filtre contact dans Pensées" (2026-09-22) — le
          ContactPicker partagé (voir §3 du chantier), tel quel : recherche/virtualisation/sélection
          inchangées, aucun clavier auto-focus (comportement déjà validé, voir ContactPicker.tsx). */}
      <ContactPicker visible={contactPickerOpen} contacts={contacts} theme={theme} onSelect={selectContact} onClose={() => setContactPickerOpen(false)} />
    </Screen>
  );
}

// Exporté — réutilisé tel quel par MemorizedPenseesScreen.tsx (CHANTIER PENSÉES V3 §2), pour ne
// jamais dupliquer le rendu d'une carte pensée dans un second composant parallèle.
//
// CHANTIER "Pré-TestFlight Phase 4D — UI Pensées mémorisées" (2026-09-22) — `contact`/`memoVariant`
// sont IGNORÉS dès que `card.bucket !== 'memo'` : le rendu Aujourd'hui/À venir/Passées/rappels
// ci-dessous reste EXACTEMENT le code d'origine, intouché (voir le early-return dédié juste après).
// Isolation par bucket existant, pas un nouveau champ sur le modèle — comme demandé.
export function PenseeRow({
  card,
  theme,
  onPress,
  onLongPress,
  muted,
  selectionMode,
  selected,
  contact,
  memoVariant = 'compact',
}: {
  card: PenseeCard;
  theme: any;
  onPress: () => void;
  onLongPress?: () => void;
  muted?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  /** Contact résolu pour une pensée memo liée (`card.pensee.contactId` non nul) — `null` si aucun
   *  contact lié OU si l'id ne correspond plus à aucun contact existant (orphelin, voir MemoMeta
   *  ci-dessous pour la distinction). Ignoré pour tout bucket != 'memo'. */
  contact?: Contact | null;
  /** 'compact' (PenseesScreen — vue temporelle dominante, la carte memo reste discrète) ou 'rich'
   *  (MemorizedPenseesScreen — bibliothèque dédiée, contact/avatar davantage mis en avant). Ignoré
   *  pour tout bucket != 'memo'. */
  memoVariant?: 'compact' | 'rich';
}) {
  if (card.bucket === 'memo') {
    return (
      <MemoPenseeRow
        card={card}
        theme={theme}
        onPress={onPress}
        onLongPress={onLongPress}
        muted={muted}
        selectionMode={selectionMode}
        selected={selected}
        contact={contact ?? null}
        variant={memoVariant}
      />
    );
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.line, opacity: muted ? 0.75 : 1 },
        selected && { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accentTint },
      ]}
    >
      {/* Coche visible UNIQUEMENT en mode sélection (voir §3 chantier UX) — jamais en usage normal. */}
      {selectionMode && (
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.accent : theme.inkSoft} />
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {/* Indicateur épinglée — icône seule, jamais un gros badge/composant séparé (§5/§6 chantier
              PENSÉES V3). Purement visuel, ne change rien à la donnée (date/reminderAt/contact). */}
          {card.pensee.pinned && <Ionicons name="pin" size={12} color={theme.plum} />}
          <Text style={[styles.text, { color: theme.ink, flexShrink: 1 }]} numberOfLines={3}>
            {card.pensee.texte}
          </Text>
        </View>
        {/* CHANTIER "Pré-TestFlight Phase 4D.1 — Identité contact dans les pensées temporelles"
            (2026-09-22) — la date reste TOUJOURS avant le contact (méta secondaire, jamais
            l'information principale) : `penseeSubtitle(..., false)` isole la partie date SEULE
            (même fonction que card.subtitle, jamais une 2e implémentation), puis le petit Avatar
            existant (18px, même taille que le variant memo compact) + prénom sont ajoutés sur la
            MÊME ligne — aucune nouvelle ligne dédiée au contact. Sans contact (aucun contactId, OU
            contactId orphelin — `contact` est alors `null` dans les deux cas) : rendu strictement
            historique, `card.subtitle` déjà calculé tel quel (date seule pour un orphelin, comme
            avant cette passe — `contactName` renvoie déjà '' pour un id introuvable). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {/* CHANTIER "Pré-TestFlight Phase 4D.2 — Unifier la méta contact/date" (2026-09-22) —
              CORRECTIF : Avatar+prénom avant la date (ordre inversé par rapport à la Phase 4D.1),
              pour être strictement cohérent avec MÉMORISÉES ("[Avatar] Prénom · Date" dans les deux
              cas). Seul l'ORDRE change — même Avatar 18px, même penseeSubtitle(..., false) pour la
              date seule, même repli sur card.subtitle historique quand `contact` est null. */}
          {contact && <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} size={18} />}
          <Text
            style={[styles.subtitle, { color: theme.inkSoft, flexShrink: 1 }]}
            // numberOfLines uniquement avec contact (ligne désormais partagée avec l'Avatar, doit
            // rester sur une ligne) — SANS contact, le sous-titre historique (ex. "Du X au Y" pour
            // une période) garde son comportement d'avant cette passe, jamais tronqué en plus.
            numberOfLines={contact ? 1 : undefined}
          >
            {contact ? `${contact.prenom} · ${penseeSubtitle(card.pensee, [], false)}` : card.subtitle}
          </Text>
        </View>
      </View>
      {card.reminderLabel && <Pill label={card.reminderLabel} tone="muted" theme={theme} />}
    </Pressable>
  );
}

/** Libellé + éventuel avatar d'une pensée mémorisée — centralise la distinction à 3 issues (contact
 *  trouvé / aucun contact / contactId orphelin, voir §3-§4 du chantier), jamais recalculée deux fois
 *  entre variant 'compact' et 'rich'. */
function memoMeta(contactId: string | null, contact: Contact | null): { label: string; hasAvatar: boolean } {
  if (contact) return { label: contact.prenom, hasAvatar: true };
  // `contactId` présent mais `contact` introuvable : l'id ne pointe plus vers personne (proche
  // supprimé, par exemple) — un fallback "Pensée personnelle" laisserait croire qu'elle n'a JAMAIS
  // été liée à quelqu'un, ce qui est faux. "Pensée mémorisée" reste neutre et sûr dans les deux cas
  // (aucun contact ET contact disparu), sans jamais réinventer un prénom.
  if (contactId) return { label: 'Pensée mémorisée', hasAvatar: false };
  return { label: 'Pensée personnelle', hasAvatar: false };
}

function MemoPenseeRow({
  card,
  theme,
  onPress,
  onLongPress,
  muted,
  selectionMode,
  selected,
  contact,
  variant,
}: {
  card: PenseeCard;
  theme: any;
  onPress: () => void;
  onLongPress?: () => void;
  muted?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  contact: Contact | null;
  variant: 'compact' | 'rich';
}) {
  const { label, hasAvatar } = memoMeta(card.pensee.contactId, contact);
  const dateLabel = frDate(card.pensee.createdAt.slice(0, 10));
  const avatarSize = variant === 'rich' ? 30 : 18;

  const AvatarOrIcon = hasAvatar && contact ? (
    <Avatar initials={contact.initials} colorKey={contact.color} theme={theme} size={avatarSize} />
  ) : (
    // Pas de second système d'avatar : un simple glyphe discret dans un rond neutre (même rayon
    // qu'Avatar), jamais un avatar avec des initiales inventées.
    <View style={[styles.memoIconFallback, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: theme.paperDim }]}>
      <Ionicons name="document-text-outline" size={avatarSize * 0.55} color={theme.inkSoft} />
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.line, opacity: muted ? 0.75 : 1, alignItems: variant === 'rich' ? 'stretch' : 'center' },
        selected && { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accentTint },
      ]}
    >
      {selectionMode && (
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.accent : theme.inkSoft} />
      )}
      {variant === 'rich' ? (
        // Rich (MemorizedPenseesScreen — bibliothèque dédiée) : avatar/prénom/date EN TÊTE de
        // carte, texte ensuite comme contenu principal (priorité visuelle demandée §2/§6).
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {AvatarOrIcon}
            <Text style={[styles.memoRichLabel, { color: theme.ink, flex: 1 }]} numberOfLines={1}>
              {label}
            </Text>
            {card.pensee.pinned && <Ionicons name="pin" size={12} color={theme.plum} />}
            <Text style={[styles.memoDate, { color: theme.inkSoft }]}>{dateLabel}</Text>
          </View>
          <Text style={[styles.memoRichText, { color: theme.ink }]} numberOfLines={4}>
            {card.pensee.texte}
          </Text>
        </View>
      ) : (
        // Compact (PenseesScreen — la vue temporelle Aujourd'hui/À venir/Passées reste dominante,
        // voir consigne dédiée) : texte d'abord (priorité visuelle), petite méta contact+date sous
        // le texte, hauteur proche du rendu historique — jamais une grosse carte relationnelle ici.
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {card.pensee.pinned && <Ionicons name="pin" size={12} color={theme.plum} />}
            <Text style={[styles.text, { color: theme.ink, flexShrink: 1 }]} numberOfLines={3}>
              {card.pensee.texte}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
            {AvatarOrIcon}
            <Text style={[styles.subtitle, { color: theme.inkSoft, flexShrink: 1 }]} numberOfLines={1}>
              {label} · {dateLabel}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2, marginBottom: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Cible tactile 48x48 (minimum recommandé) — voir point d'usage : dédié au micro uniquement.
  micIconBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clearFilterBtn: { marginTop: 4, marginBottom: 8, alignSelf: 'flex-start' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  text: { fontWeight: '700', fontSize: 14, lineHeight: 19 },
  subtitle: { fontSize: 12, marginTop: 4 },
  pastToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8, paddingVertical: 4 },
  seeAllBtn: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 8, paddingVertical: 4 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 24, alignItems: 'center' },
  emptyTitle: { fontWeight: '700', fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
  emptyInline: { fontSize: 13, marginTop: 16, textAlign: 'center' },
  // CHANTIER "Pré-TestFlight Phase 4D — UI Pensées mémorisées" (2026-09-22).
  memoIconFallback: { alignItems: 'center', justifyContent: 'center' },
  memoRichLabel: { fontWeight: '700', fontSize: 13 },
  memoDate: { fontSize: 11 },
  memoRichText: { fontWeight: '700', fontSize: 15, lineHeight: 20, marginTop: 8 },
  // CHANTIER "Pré-TestFlight Phase 4E — Filtre contact dans Pensées" (2026-09-22).
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
  },
  filterPillLabel: { fontSize: 12, fontWeight: '600' },
});
