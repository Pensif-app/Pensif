import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Palette } from '../theme/colors';
import { CalEvent } from '../data/types';
import { Dot } from './Dot';

export function EventRow({
  event,
  theme,
  onPress,
  flat = false,
}: {
  event: CalEvent;
  theme: Palette;
  onPress?: () => void;
  flat?: boolean;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={[
        styles.row,
        !flat && { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1 },
        flat && { borderBottomColor: theme.line, borderBottomWidth: 1 },
      ]}
    >
      <Dot type={event.type} theme={theme} size={8} />
      <View style={styles.info}>
        <Text style={[styles.label, { color: theme.ink }]}>{event.label}</Text>
        <Text style={[styles.kind, { color: theme.inkSoft }]}>{event.kind}</Text>
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, marginBottom: 8 },
  info: { flex: 1 },
  label: { fontWeight: '700', fontSize: 14 },
  kind: { fontSize: 12, marginTop: 2 },
});
