import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, PanResponderGestureState, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Screen } from '../components/Screen';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { SelectionHeader } from '../components/SelectionHeader';
import { useStore } from '../data/store';
import { useTheme } from '../theme';
import { Palette } from '../theme/colors';
import { isQuizComplete } from '../data/quiz';
import { birthdayCountdownLabel } from '../data/calendar';
import { contactsDeletionMessage, contactsDeletionTitle } from '../data/contactDeletionMessage';
import { Contact } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { tabBarHidden } from '../navigation/tabBarVisibility';
import { ALPHABET, letterFromScreenY, resolveAlphaSection, resolveTargetY } from '../data/contactsAlphabetIndex';

function displayName(c: Contact): string {
  return `${c.prenom} ${c.nom}`.trim();
}

function byName(a: Contact, b: Contact): number {
  return displayName(a).localeCompare(displayName(b), 'fr', { sensitivity: 'base' });
}

/**
 * Lettre d'index pour le regroupement alphabétique — accents ramenés à leur lettre de base
 * (ex. "Émilie" -> E) pour rester cohérent avec l'index A-Z (sans accents) affiché à droite.
 * '#' pour un nom sans première lettre A-Z (cas normalement impossible, un prénom est requis à la
 * sauvegarde côté FicheScreen).
 */
function indexLetter(name: string): string {
  const base = name
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  const first = base[0];
  return first && /[A-Z]/.test(first) ? first : '#';
}

type ContactSection = { title: string; data: Contact[]; favorites?: boolean };

/**
 * CHANTIER "Index alphabétique Proches" (2026-09-27) — remplace l'ancien compareContacts
 * (favoris > anniversaire > alphabétique, voir CHANTIER PROCHES + FICHE V1 §3). Nouvelle règle,
 * plus simple : les favoris restent toujours en tête (triés alphabétiquement entre eux), puis
 * vient l'ordre alphabétique pur A→Z, en sections avec en-têtes — sans priorité d'anniversaire,
 * déjà couverte par l'Accueil (Aujourd'hui / Cette semaine / À anticiper). Voir aussi
 * scripts/test-regression-contacts-fiche.ts §1-5 (repris à l'identique).
 */
function buildContactSections(contacts: Contact[]): ContactSection[] {
  const favorites = contacts.filter((c) => c.favorite).sort(byName);
  const rest = contacts.filter((c) => !c.favorite).sort(byName);
  const groups = new Map<string, Contact[]>();
  rest.forEach((c) => {
    const letter = indexLetter(displayName(c));
    const bucket = groups.get(letter);
    if (bucket) bucket.push(c);
    else groups.set(letter, [c]);
  });
  const letters = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
  const alphaSections: ContactSection[] = letters.map((letter) => ({ title: letter, data: groups.get(letter) as Contact[] }));
  return favorites.length ? [{ title: 'Favoris', data: favorites, favorites: true }, ...alphaSections] : alphaSections;
}

export function ContactsScreen() {
  const theme = useTheme();
  const { contacts, pensees, today, deleteContact } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // CHANTIER UX §6 (2026-09-16) — même principe que PenseesScreen : `selectedIds` n'a de sens QUE
  // pendant `selectionMode` (voir exitSelectionMode, toujours appelé ensemble).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const listRef = useRef<SectionList<Contact, ContactSection>>(null);
  // Vraie View native englobant la SectionList — point de référence géométrique pour
  // measureInWindow (voir measureSectionHeader). Ne modifie aucun layout (flex:1, aucun ScrollView
  // supplémentaire, aucun changement au swipe horizontal).
  const listViewportRef = useRef<View>(null);
  const lastY = useRef(0);
  // Position de scroll réelle courante, tenue à jour dans onScroll (aucun state, juste une ref) —
  // nécessaire pour convertir une position-écran (measureInWindow) en position-contenu absolue.
  const currentScrollYRef = useRef(0);

  // CHANTIER "Index alphabétique Proches" — MOTEUR DE NAVIGATION (2026-09-27, validé physiquement
  // dans les deux sens : Favoris→W/A/M, puis W→A→M→W). `scrollToLocation()` s'est avéré peu fiable
  // sur cette configuration (retombait dans les Favoris, y compris avec des indices codés en dur) ;
  // une première tentative de mesure via `measureLayout`/`getInnerViewNode`/`findNodeHandle` a
  // également échoué au runtime ("ref.measureLayout must be called with a ref to a native
  // component"). La stratégie retenue : `measureInWindow` (position ÉCRAN) sur le header ET sur
  // `listViewportRef`, combinée à la position de scroll courante :
  //   contentY = currentScrollY + (headerWindowY - listViewportWindowY)
  // C'est un offset ABSOLU dans le contenu, puis `getScrollResponder().scrollTo({y})` (déjà
  // confirmé fonctionnel) pour s'y rendre.
  const sectionOffsetByTitleRef = useRef<Record<string, number>>({});
  const sectionHeaderNodesRef = useRef<Record<string, View | null>>({});

  // Les offsets mesurés deviennent obsolètes UNIQUEMENT si le contenu change réellement (contacts
  // ajoutés/supprimés déplacent les sections) — jamais sur un simple re-rendu, sinon le header
  // actuellement sticky pourrait fausser une remesure pendant le scroll (voir measureSectionHeader,
  // qui ne remesure jamais un titre déjà connu).
  useEffect(() => {
    sectionOffsetByTitleRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);

  function measureSectionHeader(title: string) {
    // Mesure initiale valide uniquement : ne jamais écraser un offset déjà connu (un header devenu
    // sticky pendant le scroll donnerait une position fausse s'il était remesuré à ce moment-là).
    if (typeof sectionOffsetByTitleRef.current[title] === 'number') return;
    const headerNode = sectionHeaderNodesRef.current[title];
    if (!headerNode) return;
    headerNode.measureInWindow((_headerX: number, headerWindowY: number) => {
      listViewportRef.current?.measureInWindow((_listX: number, listWindowY: number) => {
        const contentY = currentScrollYRef.current + (headerWindowY - listWindowY);
        sectionOffsetByTitleRef.current[title] = contentY;
      });
    });
  }

  const sections = useMemo<ContactSection[]>(() => buildContactSections(contacts), [contacts]);
  const alphaSections = useMemo(() => sections.filter((s) => !s.favorites), [sections]);
  const availableLetters = useMemo(() => new Set(alphaSections.map((s) => s.title)), [alphaSections]);
  // Rend tout le contenu dès le premier rendu (proches + un en-tête par section) : nécessaire pour
  // que chaque en-tête de section soit mesuré via measureSectionHeader (onLayout) sans attendre un
  // scroll manuel — raisonnable pour un carnet de contacts personnel.
  const initialRenderCount = useMemo(() => sections.reduce((sum, s) => sum + 1 + s.data.length, 0), [sections]);

  // FONCTION FINALE UNIQUE — appelée à la fois par le geste tactile (tap et glisser continu, voir
  // AlphabetIndex) : aucune deuxième implémentation de la navigation lettre -> section n'existe
  // ailleurs. Repose sur un offset Y RÉELLEMENT MESURÉ + getScrollResponder().scrollTo({y}).
  function navigateToAlphabetLetter(letter: string) {
    const resolvedSection = resolveAlphaSection(alphaSections, letter);
    const targetY = resolvedSection ? resolveTargetY(alphaSections, letter, sectionOffsetByTitleRef.current) : undefined;
    if (!resolvedSection) return;
    // JAMAIS de repli vers 0 ni vers les Favoris quand l'offset n'est pas encore mesuré.
    if (typeof targetY !== 'number') return;
    const responder = listRef.current?.getScrollResponder?.() as unknown as { scrollTo?: (p: { y: number; animated: boolean }) => void };
    responder?.scrollTo?.({ y: Math.max(0, targetY), animated: false });
  }

  // Même logique que Screen.tsx (masquage de la barre d'onglets au scroll vers le bas) —
  // dupliquée ici car cet écran gère sa propre SectionList au lieu de la ScrollView de Screen
  // (nécessaire pour les en-têtes de section collants + measureInWindow de l'index A-Z).
  function onScroll(y: number) {
    currentScrollYRef.current = y;
    const delta = y - lastY.current;
    lastY.current = y;
    if (y < 20) tabBarHidden.value = withTiming(0, { duration: 90 });
    else if (delta > 6) tabBarHidden.value = withTiming(1, { duration: 220 });
    else if (delta < -6) tabBarHidden.value = withTiming(0, { duration: 90 });
  }

  function goToPreviousTab() {
    navigation.navigate('Accueil' as never);
  }
  function goToNextTab() {
    navigation.navigate('Pensées' as never);
  }

  // Le swipe latéral change de page (comme les autres onglets) partout sur cet écran SAUF sur la
  // barre de raccourcis alphabétique A-Z, qui reste un simple sibling en dehors de la vue que ce
  // geste surveille (voir AlphabetIndex/pageSwipeGesture ci-dessous) — un toucher qui démarre sur
  // la barre n'atteint donc jamais ce geste, structurellement. Le swipe natif de CET onglet est
  // désactivé une fois pour toutes (RootNavigator.tsx, `swipeEnabled: false`) et réimplémenté ici,
  // même technique que CalendarScreen.tsx/pageSwipeGesture.
  // Amélioration visuelle (2026-09-27) — l'index A-Z reste visuellement "collé" pendant la
  // transition entre onglets, quel que soit le mode de navigation (swipe OU tap direct sur la
  // bottom navbar). `alphabetIndexOpacity` fait un fade doux, opacité uniquement (aucun
  // translate/scale) : sortie 180ms, retour 160ms, easing `Easing.out(Easing.quad)` — léger, pas
  // lent. Ne touche ni au moteur A-Z (letterFromScreenY, navigateToAlphabetLetter, measureInWindow)
  // ni aux seuils/logique du swipe lui-même.
  const alphabetIndexOpacity = useSharedValue(1);
  const alphabetIndexAnimatedStyle = useAnimatedStyle(() => ({ opacity: alphabetIndexOpacity.value }));
  // Incrémenté à chaque gain de focus (voir useFocusEffect plus bas) — signale à AlphabetIndex de
  // remesurer sa géométrie et de réinitialiser son état tactile, indépendamment de onLayout (qui ne
  // se redéclenche pas forcément si l'écran est resté monté pendant la transition).
  const [alphabetIndexFocusVersion, setAlphabetIndexFocusVersion] = useState(0);
  const fadeIn = () => withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
  const fadeOut = () => withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
  // CORRECTIF (2026-09-27) — le swipe horizontal seul ne couvrait pas un tap direct sur un autre
  // onglet de la bottom navbar (l'index restait visible pendant toute cette transition). La perte
  // de focus (React Navigation), elle, se déclenche pour LES DEUX modes de sortie — swipe validé ET
  // tap navbar — donc le cleanup de useFocusEffect est désormais la source de vérité pour le
  // fade-out au départ de l'écran ; le focus (retour sur Proches) reste la source pour le fade-in.
  // Coordination avec pageSwipeGesture : un swipe validé a déjà démarré son fade via `.onStart`, la
  // perte de focus qui suit ne fait alors que MAINTENIR la même cible (0), sans à-coup ; un swipe
  // annulé ne déclenche jamais de perte de focus, donc seul `.onEnd` (retour vers 1) s'applique.
  useFocusEffect(
    useCallback(() => {
      alphabetIndexOpacity.value = fadeIn();
      // CORRECTIF (2026-09-28) — régression : après un swipe/tap navbar puis retour sur Proches,
      // l'index redevenait visible mais ne répondait plus au tap/drag. L'écran reste MONTÉ pendant
      // la transition (material-top-tabs) : `onLayout` de la barre ne se redéclenche donc pas au
      // retour, sa géométrie mesurée pouvait être obsolète (ou un geste interrompu en plein milieu
      // laissait `lastNavigatedLetterRef` sur une ancienne lettre). `focusVersion` signale à
      // AlphabetIndex de remesurer sa géométrie (après le layout réellement stabilisé, via rAF) et
      // de réinitialiser son état tactile à chaque gain de focus.
      setAlphabetIndexFocusVersion((v) => v + 1);
      return () => {
        alphabetIndexOpacity.value = fadeOut();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const pageSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .onStart(() => {
          'worklet';
          alphabetIndexOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
        })
        .onEnd((e) => {
          'worklet';
          // Swipe annulé (sous le seuil de changement d'onglet) : seul cas où l'on refait un
          // fade-in ici — un swipe validé laisse le cleanup de useFocusEffect (perte de focus)
          // gérer la suite, jamais une remise à 1 inconditionnelle au relâchement (voir plus haut).
          if (Math.abs(e.translationX) < 40) {
            alphabetIndexOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
            return;
          }
          if (e.translationX < 0) runOnJS(goToNextTab)();
          else runOnJS(goToPreviousTab)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (contacts.length === 0) {
    return (
      <Screen>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.h1, { color: theme.ink }]}>Mes proches</Text>
            <Text style={[styles.sub, { color: theme.inkSoft }]}>0 proche suivi</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Fiche', undefined)}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un proche"
            style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
          >
            <Ionicons name="add" size={20} color={theme.ink} />
          </Pressable>
        </View>
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>Ajoute les personnes qui comptent</Text>
          <Text style={[styles.emptyBody, { color: theme.inkSoft }]}>
            Pensif pourra t’aider à retenir leurs dates et les petites choses importantes.
          </Text>
          <View style={{ marginTop: 16, width: '100%' }}>
            <PrimaryButton label="Ajouter un proche" onPress={() => navigation.navigate('Fiche', undefined)} />
          </View>
        </View>
      </Screen>
    );
  }

  function handleRowLongPress(contactId: string) {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds(new Set([contactId]));
  }

  function handleRowPress(contactId: string) {
    if (!selectionMode) {
      navigation.navigate('Fiche', { contactId });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
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
    // Même règle métier que la suppression individuelle (FicheScreen.remove) : jamais de suppression
    // en cascade des pensées liées, juste `contactId -> null` (voir contactDeletionMessage.ts) —
    // texte de confirmation qui l'explique aussi au pluriel ici.
    const linkedCount = pensees.filter((p) => p.contactId && selectedIds.has(p.contactId)).length;
    Alert.alert(contactsDeletionTitle(count), contactsDeletionMessage(count, linkedCount), [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          // `deleteContact` existant, UN appel par proche — même chemin optimiste local + outbox
          // que la suppression individuelle (FicheScreen), jamais contourné, fonctionne offline.
          selectedIds.forEach((id) => deleteContact(id));
          exitSelectionMode();
        },
      },
    ]);
  }

  return (
    // scroll=false : cet écran gère sa propre liste scrollable (SectionList), pas la ScrollView de
    // Screen — nécessaire pour les en-têtes de section collants et measureInWindow (index A-Z).
    <Screen scroll={false}>
      <View style={styles.flexArea}>
        {/* Vraie View native de référence géométrique pour measureInWindow (voir measureSectionHeader) —
            flex:1, ne modifie aucun layout, aucun ScrollView supplémentaire, aucun changement au swipe. */}
        <View ref={listViewportRef} style={styles.flex1}>
          <GestureDetector gesture={pageSwipeGesture}>
            <SectionList
              ref={listRef}
              sections={sections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled
              showsVerticalScrollIndicator={false}
              onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
              initialNumToRender={initialRenderCount}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                selectionMode ? (
                  <View style={styles.selectionHeaderWrap}>
                    <SelectionHeader
                      count={selectedIds.size}
                      singular="sélectionné"
                      plural="sélectionnés"
                      onCancel={exitSelectionMode}
                      onDelete={confirmDeleteSelected}
                      theme={theme}
                    />
                  </View>
                ) : (
                  <View style={styles.headerRow}>
                    <View>
                      <Text style={[styles.h1, { color: theme.ink }]}>Mes proches</Text>
                      <Text style={[styles.sub, { color: theme.inkSoft }]}>
                        {contacts.length} {contacts.length === 1 ? 'proche suivi' : 'proches suivis'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => navigation.navigate('Fiche', undefined)}
                      accessibilityRole="button"
                      accessibilityLabel="Ajouter un proche"
                      style={[styles.iconBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
                    >
                      <Ionicons name="add" size={20} color={theme.ink} />
                    </Pressable>
                  </View>
                )
              }
              renderSectionHeader={({ section }) => {
                const title = section.favorites ? 'Favoris' : section.title;
                return (
                  <View
                    ref={(node) => {
                      sectionHeaderNodesRef.current[title] = node;
                    }}
                    onLayout={() => measureSectionHeader(title)}
                    style={[styles.sectionHeader, { backgroundColor: theme.paper }]}
                  >
                    <Text style={[styles.sectionHeaderText, { color: theme.inkSoft }]}>
                      {section.favorites ? '★ FAVORIS' : section.title}
                    </Text>
                  </View>
                );
              }}
              renderItem={({ item: c, index, section }) => {
                const hasQuiz = isQuizComplete(c.quiz);
                const selected = selectedIds.has(c.id);
                const isFirst = index === 0;
                const isLast = index === section.data.length - 1;
                return (
                  <ContactRow
                    theme={theme}
                    contact={c}
                    hasQuiz={hasQuiz}
                    selected={selected}
                    selectionMode={selectionMode}
                    isFirst={isFirst}
                    isLast={isLast}
                    today={today}
                    onPress={() => handleRowPress(c.id)}
                    onLongPress={() => handleRowLongPress(c.id)}
                  />
                );
              }}
            />
          </GestureDetector>
        </View>
        {/* AlphabetIndex est un SIBLING de la SectionList, PAS un enfant du GestureDetector ci-dessus
            — un toucher qui démarre sur la barre de lettres n'entre donc jamais dans la vue que
            pageSwipeGesture surveille (voir commentaire de pageSwipeGesture plus haut). Le fade
            (Animated.View, opacité seule) est purement visuel : `pointerEvents="box-none"` laisse
            passer les touchers exactement comme avant, AlphabetIndex gère ses propres gestes en
            dessous sans changement. */}
        <Animated.View style={[styles.indexFadeWrap, alphabetIndexAnimatedStyle]} pointerEvents="box-none">
          <AlphabetIndex
            theme={theme}
            availableLetters={availableLetters}
            onSelectLetter={navigateToAlphabetLetter}
            focusVersion={alphabetIndexFocusVersion}
          />
        </Animated.View>
      </View>
    </Screen>
  );
}

/**
 * CORRECTIF (2026-09-28) — une carte Proche s'ouvrait comme un tap réussi même quand le geste
 * démarré dessus était en réalité un scroll vertical ou un swipe horizontal de changement d'onglet
 * (l'ancien `Pressable.onPress` ne les distinguait pas de façon fiable dans cette configuration).
 * Remplacé par une vraie reconnaissance de geste (`react-native-gesture-handler`, déjà utilisé sur
 * cet écran pour `pageSwipeGesture`) : `Gesture.Tap()` avec une tolérance de déplacement limitée
 * (`maxDistance(10)`) échoue dès qu'un scroll/swipe réel commence, laissant le parent (SectionList
 * native pour le scroll, `pageSwipeGesture` pour le swipe) prendre normalement la main — un vrai
 * tap, même avec un tout petit mouvement involontaire, reste reconnu et ouvre la fiche.
 * `Gesture.LongPress()` (même tolérance) gère l'entrée en mode sélection, en course avec le tap
 * (`Gesture.Race`) : si le doigt reste posé assez longtemps sans bouger, le longPress l'emporte ;
 * sinon, au relâchement rapide, c'est le tap qui aboutit.
 */
function ContactRow({
  theme,
  contact: c,
  hasQuiz,
  selected,
  selectionMode,
  isFirst,
  isLast,
  today,
  onPress,
  onLongPress,
}: {
  theme: Palette;
  contact: Contact;
  hasQuiz: boolean;
  selected: boolean;
  selectionMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  today: Date;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const rowGesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((_e, success) => {
        'worklet';
        if (success) runOnJS(onPress)();
      });
    const longPress = Gesture.LongPress()
      .maxDistance(10)
      .onStart(() => {
        'worklet';
        runOnJS(onLongPress)();
      });
    // Course entre les deux : un appui prolongé sans bouger fait gagner le longPress ; un
    // relâchement rapide fait aboutir le tap. Aucune relation avec pageSwipeGesture (parent) n'est
    // nécessaire : ce geste échoue de lui-même dès `maxDistance` dépassé, laissant le parent
    // reconnaître le swipe indépendamment (voir seuils inchangés de pageSwipeGesture).
    return Gesture.Race(longPress, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPress, onLongPress]);

  return (
    <GestureDetector gesture={rowGesture}>
      <View
        style={[
          styles.row,
          { backgroundColor: theme.card, borderColor: theme.line },
          isFirst && styles.rowFirst,
          isLast ? styles.rowLast : { borderBottomWidth: 1, borderBottomColor: theme.line },
          selected && { backgroundColor: theme.accentTint },
        ]}
      >
        {/* Coche visible UNIQUEMENT en mode sélection — même langage visuel que PenseeRow. */}
        {selectionMode && (
          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.accent : theme.inkSoft} />
        )}
        <Avatar initials={c.initials} colorKey={c.color} theme={theme} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            {c.favorite && <Ionicons name="star" size={13} color={theme.plum} />}
            <Text style={[styles.name, { color: theme.ink }]}>{displayName(c)}</Text>
          </View>
          <Text style={[styles.meta, { color: theme.inkSoft }]}>
            {c.familyRole ?? c.relation}
            {c.date ? ` · ${birthdayCountdownLabel(c.date, today)}` : ''}
          </Text>
        </View>
        {!selectionMode && <Pill label={hasQuiz ? 'Quizz ✓' : 'Quizz à faire'} tone={hasQuiz ? 'sage' : 'muted'} theme={theme} />}
      </View>
    </GestureDetector>
  );
}

/**
 * Barre de raccourcis A-Z façon Contacts iOS, collée au bord droit : un tap ou un glisser continu
 * du doigt le long de la colonne fait défiler directement jusqu'à la section de la lettre visée
 * (ou la plus proche disponible). Lettres sans proche associé affichées en gris clair (comme sur
 * iOS), pour montrer que le raccourci existe mais saute à la lettre disponible suivante.
 *
 * `PanResponder` + coordonnée ÉCRAN absolue (`gestureState.y0`/`moveY`) convertie en lettre via
 * `letterFromScreenY`, avec la géométrie RÉELLEMENT MESURÉE du wrapper entier (`measureInWindow`) —
 * jamais `nativeEvent.locationY` (coordonnée relative à L'ENFANT `<Text>` touché, pas à toute la
 * barre : c'était la cause du tap initial imprécis, voir letterFromScreenY). Cette View est un
 * SIBLING de la SectionList (voir ContactsScreen), en dehors de la vue que surveille
 * `pageSwipeGesture` : un toucher qui démarre ici n'atteint donc jamais ce geste.
 */
function AlphabetIndex({
  theme,
  availableLetters,
  onSelectLetter,
  focusVersion,
}: {
  theme: Palette;
  availableLetters: Set<string>;
  onSelectLetter: (letter: string) => void;
  focusVersion: number;
}) {
  // CORRECTIF RACINE (2026-09-27) : `useRef(PanResponder.create({...}))` évalue son argument à
  // CHAQUE rendu mais n'en conserve QUE LE TOUT PREMIER — les callbacks du responder
  // (`onPanResponderGrant`/`onPanResponderMove`) resteraient donc figés sur la fonction
  // `onSelectLetter` telle qu'elle existait au tout premier montage de la barre, jamais mise à jour
  // ensuite malgré les re-rendus de l'écran. Un ref resynchronisé à CHAQUE rendu
  // (`onSelectLetterRef.current = onSelectLetter`) garantit que le responder — créé une seule fois —
  // appelle toujours la version la plus récente.
  const onSelectLetterRef = useRef(onSelectLetter);
  onSelectLetterRef.current = onSelectLetter;

  // Pendant un glisser continu, ne rappelle la navigation QUE si la lettre survolée a changé —
  // évite de re-déclencher un scroll identique en boucle à chaque frame du geste.
  const lastNavigatedLetterRef = useRef<string | null>(null);

  // Géométrie ÉCRAN réelle du wrapper A-Z entier (pas d'un enfant) — mesurée une fois montée, puis
  // rafraîchie à chaque `onLayout` (changement de taille/position réel). `letterFromScreenY` divise
  // cette hauteur mesurée en 26 tranches égales, jamais une hauteur de police supposée.
  const alphabetIndexRef = useRef<View>(null);
  const alphabetGeometryRef = useRef({ pageY: 0, height: 0 });

  function measureAlphabetGeometry() {
    alphabetIndexRef.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      alphabetGeometryRef.current = { pageY: y, height };
    });
  }

  // CORRECTIF (2026-09-28) — régression : l'écran Proches reste MONTÉ pendant une transition
  // d'onglet (swipe ou tap navbar, material-top-tabs), donc `onLayout` ne se redéclenche pas
  // forcément au retour — la géométrie mesurée pouvait être obsolète, et un geste interrompu en
  // plein milieu du changement d'onglet pouvait laisser `lastNavigatedLetterRef` bloqué sur une
  // ancienne lettre. `focusVersion` (incrémenté par ContactsScreen à chaque gain de focus)
  // déclenche une remesure — après le layout réellement stabilisé, via requestAnimationFrame — et
  // une réinitialisation de l'état tactile, à chaque retour sur cet écran.
  useEffect(() => {
    lastNavigatedLetterRef.current = null;
    const raf = requestAnimationFrame(() => measureAlphabetGeometry());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVersion]);

  function handleTouch(screenY: number) {
    const resolvedLetter = letterFromScreenY(screenY, alphabetGeometryRef.current);
    if (!resolvedLetter || resolvedLetter === lastNavigatedLetterRef.current) return;
    lastNavigatedLetterRef.current = resolvedLetter;
    onSelectLetterRef.current(resolvedLetter);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // y0 : coordonnée écran du début du geste (tap initial). moveY : coordonnée écran courante
      // pendant le glisser. Jamais `nativeEvent.locationY` (voir commentaire de fonction ci-dessus).
      onPanResponderGrant: (_e, gestureState: PanResponderGestureState) => handleTouch(gestureState.y0),
      onPanResponderMove: (_e, gestureState: PanResponderGestureState) => handleTouch(gestureState.moveY),
      onPanResponderRelease: () => {
        lastNavigatedLetterRef.current = null;
      },
      onPanResponderTerminate: () => {
        lastNavigatedLetterRef.current = null;
      },
    }),
  ).current;

  return (
    // Le wrapper couvre toute la hauteur de la colonne mais ne capte aucun toucher lui-même
    // (`pointerEvents="box-none"`) : seule la View intérieure, ajustée exactement à la hauteur des
    // 26 lettres (pas de top:0/bottom:0), intercepte le geste. Au-dessus et en dessous du bloc de
    // lettres, le scroll/swipe normal de l'écran reste donc possible.
    <View style={styles.indexBarWrap} pointerEvents="box-none">
      <View
        ref={alphabetIndexRef}
        onLayout={measureAlphabetGeometry}
        style={styles.indexBar}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Index alphabétique"
      >
        {ALPHABET.map((letter) => (
          <Text
            key={letter}
            style={[styles.indexLetter, { color: availableLetters.has(letter) ? theme.accent : theme.inkSoft }]}
          >
            {letter}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  selectionHeaderWrap: { marginBottom: 12 },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flexArea: { flex: 1, position: 'relative' },
  flex1: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 110, paddingRight: 40 },
  sectionHeader: { paddingVertical: 6 },
  sectionHeaderText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderLeftWidth: 1, borderRightWidth: 1 },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, marginBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontWeight: '700', fontSize: 15 },
  meta: { fontSize: 12, marginTop: 2 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 8, alignItems: 'center' },
  emptyTitle: { fontWeight: '700', fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
  // Géométrie identique à `indexBarWrap` (AlphabetIndex se repositionne dedans à l'identique) —
  // ce wrapper externe n'existe que pour porter l'opacité animée du fade de swipe (voir
  // alphabetIndexOpacity), sans changer la position ni la taille réelle de la barre.
  indexFadeWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
  },
  indexBarWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexBar: {
    alignItems: 'center',
  },
  indexLetter: { fontSize: 11, fontWeight: '700', lineHeight: 13 },
});
