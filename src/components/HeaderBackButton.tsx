import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Bouton retour custom pour tous les écrans empilés (fiche, réglages, message, et les suivants) —
 * le chevron par défaut de native-stack peut se fondre dans le fond selon la plateforme/le thème,
 * celui-ci reste toujours visible (fond + bordure) quel que soit le thème.
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
      style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.line }]}
    >
      <Ionicons name="chevron-back" size={20} color={theme.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
