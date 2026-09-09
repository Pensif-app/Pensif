import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Palette } from '../theme/colors';

export function resolveAvatarColor(theme: Palette, key: string) {
  switch (key) {
    case 'accent':
      return theme.accent;
    case 'accentStrong':
      return theme.accentStrong;
    case 'sage':
      return theme.sage;
    case 'plum':
    default:
      return theme.plum;
  }
}

export function Avatar({ initials, colorKey, theme, size = 44 }: { initials: string; colorKey: string; theme: Palette; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: resolveAvatarColor(theme, colorKey) },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '700' },
});
