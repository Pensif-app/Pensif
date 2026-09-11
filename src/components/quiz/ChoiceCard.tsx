import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/** Durée de l'animation de remplissage d'une réponse choisie — utilisée aussi par les écrans qui
 *  enchaînent automatiquement sur la question suivante après ce délai (voir QuizScreen.tsx). */
export const ANSWER_FILL_MS = 520;

/**
 * Bulle de choix animée, partagée par le quiz général (A/B, un seul choix actif à la fois → voir
 * QuestionStep) et l'affinage par thème (choix unique OU multiple — voir ThemeAffinageQuiz). Le
 * composant ne connaît pas la différence : il se contente de refléter `active`, c'est à l'appelant
 * de décider si `onPress` avance directement (single) ou bascule juste la sélection (multi).
 */
export function ChoiceCard({ label, theme, active, onPress }: { label: string; theme: any; active: boolean; onPress: () => void }) {
  // Se remplit en douceur (couleur) et "gonfle" comme une bulle qu'on touche (ressort avec
  // rebond) au lieu de basculer d'un coup.
  const fill = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    fill.value = withTiming(active ? 1 : 0, { duration: active ? ANSWER_FILL_MS - 60 : 160, easing: Easing.out(Easing.cubic) });
    if (active) scale.value = withSpring(1.08, { damping: 7, stiffness: 260, mass: 0.6 });
  }, [active, fill, scale]);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.value, [0, 1], [theme.card, theme.accentTint]),
    borderColor: interpolateColor(fill.value, [0, 1], [theme.line, theme.accent]),
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (!active) scale.value = withSpring(0.96, { damping: 14, stiffness: 300 });
      }}
      onPressOut={() => {
        if (!active) scale.value = withSpring(1, { damping: 14, stiffness: 300 });
      }}
    >
      <Animated.View style={[styles.choiceCard, animStyle]}>
        <Text style={[styles.choiceLabel, { color: theme.ink }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choiceCard: { borderWidth: 1.5, borderRadius: 18, paddingVertical: 26, paddingHorizontal: 18, alignItems: 'center' },
  choiceLabel: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
