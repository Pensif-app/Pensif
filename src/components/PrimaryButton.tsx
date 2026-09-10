import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

// Les 4 familles de la charte Pensif : primaire (action principale, violet plein), secondaire
// (contour violet, priorité moindre), attention (corail — interactions émotionnelles ponctuelles,
// jamais pour un bouton standard), destructif (rouge classique, réservé à "Supprimer").
export type ButtonVariant = 'primary' | 'secondary' | 'attention' | 'destructive';

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
}) {
  const theme = useTheme();
  const styleFor: Record<ButtonVariant, { bg: string; fg: string; borderColor?: string }> = {
    primary: { bg: theme.accent, fg: '#FFFFFF' },
    secondary: { bg: 'transparent', fg: theme.accent, borderColor: theme.accent },
    attention: { bg: theme.plum, fg: '#FFFFFF' },
    destructive: { bg: theme.danger, fg: '#FFFFFF' },
  };
  const s = styleFor[variant];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: s.bg, borderColor: s.borderColor ?? 'transparent', borderWidth: s.borderColor ? 1.5 : 0 },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.label, { color: s.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: '100%', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  label: { fontWeight: '700', fontSize: 15 },
});
