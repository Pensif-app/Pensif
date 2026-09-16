import React, { useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { tabBarHidden } from '../navigation/tabBarVisibility';

export function Screen({
  children,
  scroll = true,
  topInset = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /**
   * CORRECTIF UX §8 (2026-09-16) — `false` pour un écran poussé DANS le Stack avec un header natif
   * déjà affiché (ex. MemorizedPenseesScreen) : le header réserve déjà l'espace de la safe area du
   * haut (encoche/Dynamic Island), donc ajouter `edges:['top']` ici l'ajoutait UNE SECONDE fois —
   * c'était l'origine du grand espace vide constaté entre le titre et la recherche. `true` (défaut,
   * comportement inchangé partout ailleurs) reste nécessaire pour les onglets (Tabs, headerShown:
   * false) où rien d'autre ne protège du notch.
   */
  topInset?: boolean;
}) {
  const theme = useTheme();
  const lastY = useRef(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastY.current;
    lastY.current = y;
    if (y < 20) {
      tabBarHidden.value = withTiming(0, { duration: 90 });
    } else if (delta > 6) {
      tabBarHidden.value = withTiming(1, { duration: 220 });
    } else if (delta < -6) {
      tabBarHidden.value = withTiming(0, { duration: 90 });
    }
  };

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.paper }]} edges={topInset ? ['top'] : []}>
        <View style={styles.flex}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.paper }]} edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 110 },
});
