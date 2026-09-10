import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Bouton retour custom pour tous les écrans empilés (fiche, réglages, message, et les suivants).
 * Depuis iOS 26 (Liquid Glass), react-native-screens place déjà automatiquement un fond circulaire
 * translucide derrière tout `headerLeft` custom — dessiner en plus notre propre cercle (fond +
 * bordure) donnait un double cercle. On ne dessine donc plus que le chevron ; le cercle vient du
 * système.
 */
export function HeaderBackButton() {
  const theme = useTheme();
  const navigation = useNavigation();
  if (!navigation.canGoBack()) return null;

  return (
    <Pressable
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Retour"
      hitSlop={10}
      style={styles.btn}
    >
      <Ionicons name="chevron-back" size={20} color={theme.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
