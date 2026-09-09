import React from 'react';
import { View } from 'react-native';
import { Palette } from '../theme/colors';
import { CalEventType } from '../data/types';

export function dotColor(theme: Palette, type: CalEventType) {
  switch (type) {
    case 'anniv':
      return theme.accentStrong;
    case 'fete':
      return theme.sage;
    case 'civil':
      return theme.civil;
    case 'pensee':
    default:
      return theme.plum;
  }
}

export function Dot({ type, theme, size = 6 }: { type: CalEventType; theme: Palette; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dotColor(theme, type) }}
    />
  );
}
