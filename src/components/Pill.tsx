import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Palette } from '../theme/colors';

type Tone = 'accent' | 'plum' | 'sage' | 'muted';

export function Pill({ label, tone, theme }: { label: string; tone: Tone; theme: Palette }) {
  const toneStyles: Record<Tone, { bg: string; fg: string }> = {
    accent: { bg: theme.accent, fg: '#3A2308' },
    plum: { bg: theme.plumTint, fg: theme.plum },
    sage: { bg: theme.sageTint, fg: theme.sage },
    muted: { bg: theme.paperDim, fg: theme.inkSoft },
  };
  const s = toneStyles[tone];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700' },
});
