// CHANTIER "Mini tutoriel onboarding global" (2026-09-24), version SIMPLIFIÉE — overlay plein écran (sibling de
// RootNavigator dans App.tsx, comme AuthGateScreen/SplashOverlay) : une suite d'IMAGES STATIQUES finales
// (assets/tutorial, déjà annotées) au-dessus d'une bande de navigation FIXE. Layout : zone image (flex:1,
// `contain`, centrée, jamais déformée) + footer en dessous. Aucune bulle, aucun hotspot, aucun placement calculé.
// Affichage one-shot via un flag AsyncStorage (voir shouldShowTutorial).
import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../data/store';
import {
  TUTORIAL_IMAGES,
  TUTORIAL_SEEN_KEY,
  TutorialImageId,
  nextTutorialIndex,
  shouldShowTutorial,
  tutorialContinueLabel,
} from '../data/tutorial';

// `require` statiques (Metro) — un par image.
const TUTORIAL_SOURCES: Record<TutorialImageId, ImageSourcePropType> = {
  accueil: require('../../assets/tutorial/tuto-accueil.png'),
  proches: require('../../assets/tutorial/tuto-proches.png'),
  'nouveau-proche': require('../../assets/tutorial/tuto-nouveau-proche.png'),
  pensees: require('../../assets/tutorial/tuto-pensees.png'),
  capture: require('../../assets/tutorial/tuto-capture.png'),
  'calendrier-mois': require('../../assets/tutorial/tuto-calendrier-mois.png'),
  'calendrier-semaine': require('../../assets/tutorial/tuto-calendrier-semaine.png'),
};

const VIOLET = '#9B7CFF';
const PINK = '#FF5CAA';
const FOOTER_BG = '#0B0A24';

export function TutorialOverlay({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);

  function onContinue() {
    const next = nextTutorialIndex(index);
    if (next === null) onDone();
    else setIndex(next);
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: FOOTER_BG }]}>
      <SafeAreaView style={styles.safe}>
        {/* Zone image : tout l'espace au-dessus du footer, image en `contain` (centrée, sans stretch ni recadrage). */}
        <View style={styles.imageArea}>
          <Image source={TUTORIAL_SOURCES[TUTORIAL_IMAGES[index]]} style={styles.image} resizeMode="contain" />
        </View>

        {/* Bande fixe en bas, commune à toutes les images. */}
        <View style={styles.footer}>
          <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button" style={styles.footerLeft}>
            <Text style={styles.skip}>Passer le tutoriel</Text>
          </Pressable>
          <View style={styles.dots}>
            {TUTORIAL_IMAGES.map((id, i) => (
              <Pressable key={id} onPress={() => setIndex(i)} hitSlop={8} accessibilityLabel={`Image ${i + 1}`}>
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </Pressable>
            ))}
          </View>
          <View style={styles.footerRight}>
            <Pressable onPress={onContinue} accessibilityRole="button" hitSlop={6}>
              <LinearGradient colors={[VIOLET, PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.continueBtn}>
                <Text style={styles.continueText}>{tutorialContinueLabel(index)}</Text>
              </LinearGradient>
            </Pressable>
          </View>
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
    // Relu à chaque changement d'auth gate : après "Simuler une réinitialisation" (DEV) le flag est supprimé et
    // `authGate` repasse par 'choice' puis 'none' — le tutoriel redevient alors éligible sans relancer l'app.
  }, [authGate]);

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
  safe: { flex: 1 },
  imageArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, backgroundColor: FOOTER_BG },
  footerLeft: { flex: 1 },
  footerRight: { flex: 1, alignItems: 'flex-end' },
  skip: { color: '#A9A5C9', fontSize: 14, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotActive: { width: 18, backgroundColor: VIOLET },
  continueBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22 },
  continueText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
