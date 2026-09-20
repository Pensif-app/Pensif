import React, { useRef } from 'react';
import { KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
      {/* CORRECTIF "Auth P0-1 — clavier iOS" (2026-09-20) : même pattern KeyboardAvoidingView que
          CalendarScreen.tsx/AuthGateScreen.tsx (behavior="padding" iOS uniquement, offset fixe petit,
          jamais lié à un modèle d'iPhone précis) — nécessaire pour que la section "SÉCURISER MES
          DONNÉES" (SettingsScreen) reste accessible au-dessus du clavier. N'affecte les autres écrans
          que si un champ y prend le focus (comportement neutre sinon). */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 110 },
});
