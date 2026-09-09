import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

export function PrimaryButton({ label, onPress, ghost = false }: { label: string; onPress: () => void; ghost?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: ghost ? theme.paperDim : theme.accentStrong, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: ghost ? theme.ink : '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: '100%', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  label: { fontWeight: '700', fontSize: 15 },
});
