// CHANTIER "Mini tutoriel onboarding global" (2026-09-24) — overlay plein écran (sibling de RootNavigator dans
// App.tsx, comme AuthGateScreen/SplashOverlay) : 4 pages (Accueil / Proches / Pensées / Calendrier), chacune
// pouvant contenir 2 vues internes glissables horizontalement (jamais une 5e page principale). Footer fixe :
// "Passer le tutoriel" · 4 points · "Continuer >". Affichage one-shot via un flag AsyncStorage (voir
// shouldShowTutorial, tutorial.ts). DA sombre/néon fixe, indépendante du thème Pensif.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../data/store';
import {
  TUTORIAL_PAGES,
  TUTORIAL_PAGE_COUNT,
  TUTORIAL_SEEN_KEY,
  TutorialCallout,
  nextTutorialPage,
  shouldShowTutorial,
  tutorialContinueLabel,
} from '../data/tutorial';
import { NEON, TutorialMock } from './TutorialMocks';

const ARROW_ICON = { up: 'arrow-up', down: 'arrow-down', left: 'arrow-back', right: 'arrow-forward' } as const;

function Callout({ c }: { c: TutorialCallout }) {
  const color = NEON[c.accent];
  return (
    <View
      pointerEvents="none"
      style={[styles.callout, { top: `${c.top}%`, borderColor: color, shadowColor: color }, c.side === 'left' ? { left: 6 } : { right: 6 }]}
    >
      <View style={[styles.badge, { backgroundColor: color }]}>
        <Text style={styles.badgeText}>{c.n}</Text>
      </View>
      <Text style={styles.calloutText}>{c.text}</Text>
      <Ionicons name={ARROW_ICON[c.arrow]} size={18} color={color} style={styles.calloutArrow} />
    </View>
  );
}

/** Une page : 1 ou 2 vues. Avec 2 vues, un ScrollView horizontal paginé + flèche "glisse" à droite. */
function TutorialPageView({ pageIndex, width, height }: { pageIndex: number; width: number; height: number }) {
  const page = TUTORIAL_PAGES[pageIndex];
  const [viewIndex, setViewIndex] = useState(0);
  const multi = page.views.length > 1;
  // Hauteur EXPLICITE : un ScrollView horizontal ne donne aucune hauteur à ses enfants en flex:1.
  const mockHeight = height - 56;
  return (
    <View style={{ width, height }}>
      <Text style={styles.pageTitle}>{page.title}</Text>
      <View style={{ height: mockHeight }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ height: mockHeight }}
          scrollEnabled={multi}
          onMomentumScrollEnd={(e) => setViewIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {page.views.map((v) => (
            <View key={v.id} style={{ width, height: mockHeight }}>
              <View style={styles.mockWrap}>
                <TutorialMock id={v.mock} />
                {v.callouts.map((c) => (
                  <Callout key={c.n} c={c} />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
        {multi && viewIndex < page.views.length - 1 ? (
          <View pointerEvents="none" style={styles.swipeHint}>
            <Ionicons name="chevron-forward" size={26} color={NEON.blue} />
          </View>
        ) : null}
        {multi ? (
          <View pointerEvents="none" style={styles.viewDots}>
            {page.views.map((v, i) => (
              <View key={v.id} style={[styles.viewDot, i === viewIndex && { backgroundColor: NEON.blue }]} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function TutorialOverlay({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  // Zone d'écran disponible pour la page (hors footer ~90 + paddings) — approximation suffisante, le
  // contenu est en flex à l'intérieur.
  const pageHeight = Math.max(420, height - 190);

  function goTo(index: number) {
    setPage(index);
    pagerRef.current?.scrollTo({ x: index * width, animated: true });
  }
  function onContinue() {
    const next = nextTutorialPage(page);
    if (next === null) onDone();
    else goTo(next);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#07061A', '#17103A', '#0B0A24']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
        >
          {TUTORIAL_PAGES.map((p, i) => (
            <TutorialPageView key={p.id} pageIndex={i} width={width} height={pageHeight} />
          ))}
        </ScrollView>
        <View style={{ flex: 1 }} />
        <View style={styles.footer}>
          <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button" style={styles.footerSide}>
            <Text style={styles.skip}>Passer le tutoriel</Text>
          </Pressable>
          <View style={styles.dots}>
            {Array.from({ length: TUTORIAL_PAGE_COUNT }, (_, i) => (
              <View key={i} style={[styles.dot, i === page && { backgroundColor: NEON.violet, width: 18 }]} />
            ))}
          </View>
          <Pressable onPress={onContinue} hitSlop={10} accessibilityRole="button" style={[styles.footerSide, { alignItems: 'flex-end' }]}>
            <Text style={styles.next}>{tutorialContinueLabel(page)}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Branché dans App.tsx : lit/écrit le flag one-shot et décide de l'affichage. */
export function TutorialGate() {
  const { ready, authGate, userName, namePromptOpen, contacts, pensees } = useStore();
  const [seen, setSeen] = useState<boolean | null>(null);
  const hasData = contacts.length > 0 || pensees.length > 0;

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_SEEN_KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(true));
  }, []);

  // Utilisateur déjà installé (données présentes, flag jamais posé) : ne le verra jamais, même s'il vide ses données.
  useEffect(() => {
    if (seen === false && ready && hasData) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, ready, hasData]);

  function markSeen() {
    setSeen(true);
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, '1').catch(() => {});
  }

  if (!shouldShowTutorial({ seen, ready, authGateNone: authGate === 'none', hasUserName: !!userName, namePromptOpen, hasData })) return null;
  return <TutorialOverlay onDone={markSeen} />;
}

const styles = StyleSheet.create({
  pageTitle: { color: '#F4F2FF', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 10, marginBottom: 10 },
  mockWrap: { flex: 1, marginHorizontal: 16, marginBottom: 14 },
  callout: {
    position: 'absolute',
    maxWidth: '68%',
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: 'rgba(10,8,30,0.92)',
    paddingVertical: 8,
    paddingLeft: 34,
    paddingRight: 10,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  badge: { position: 'absolute', left: 7, top: 8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#0B0A24', fontWeight: '800', fontSize: 12 },
  calloutText: { color: '#F4F2FF', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  calloutArrow: { position: 'absolute', right: -2, bottom: -22 },
  swipeHint: { position: 'absolute', right: 2, top: '48%' },
  viewDots: { position: 'absolute', bottom: 2, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  viewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, paddingTop: 8 },
  footerSide: { flex: 1 },
  skip: { color: '#A9A5C9', fontSize: 14, fontWeight: '600' },
  next: { color: NEON.violet, fontSize: 15, fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
});
