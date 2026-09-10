import React, { useEffect, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Palette } from '../theme/colors';

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const PAD = (ITEM_HEIGHT * (VISIBLE_ROWS - 1)) / 2;

/** Une colonne de roulette façon minuteur iOS : on fait défiler, ça s'aimante sur chaque valeur. */
export function WheelColumn({
  data,
  value,
  onChange,
  theme,
}: {
  data: number[];
  value: number;
  onChange: (v: number) => void;
  theme: Palette;
}) {
  const ref = useRef<ScrollView>(null);
  const settledIndex = useRef(data.indexOf(value));

  useEffect(() => {
    const idx = data.indexOf(value);
    if (idx >= 0 && idx !== settledIndex.current) {
      // La valeur a changé sans venir de notre propre scroll (ex. bornée par le parent parce
      // qu'elle dépassait le délai autorisé) : on recentre la roulette dessus.
      settledIndex.current = idx;
      ref.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    }
  }, [value, data]);

  function settle(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    if (idx !== settledIndex.current) {
      settledIndex.current = idx;
      onChange(data[idx]);
    }
  }

  return (
    <ScrollView
      ref={ref}
      style={styles.column}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: PAD }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
    >
      {data.map((n) => (
        <View key={n} style={styles.row}>
          <Text
            style={[
              styles.value,
              { color: n === value ? theme.ink : theme.inkSoft, fontWeight: n === value ? '700' : '400' },
            ]}
          >
            {n}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const WEEK_MIN = 7 * 24 * 60;
const DAY_MIN = 24 * 60;

function range(count: number) {
  return Array.from({ length: Math.max(1, count + 1) }, (_, i) => i);
}

/**
 * Les 4 roulettes (semaines / jours / heures / minutes) côte à côte. `maxMinutes` borne ce qui
 * est sélectionnable — au-delà, le rappel tomberait après l'événement, donc chaque roulette ne
 * propose que les valeurs encore atteignables compte tenu des précédentes (comme un compteur
 * kilométrique : la marge restante se réduit colonne après colonne). Pour un rappel le jour même
 * (0 semaine, 0 jour), ça laisse justement régler précisément les heures ET les minutes qui
 * restent dans la journée.
 */
export function DurationWheelPicker({
  weeks,
  days,
  hours,
  minutes,
  maxMinutes,
  onChange,
  theme,
}: {
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  maxMinutes: number;
  onChange: (next: { weeks: number; days: number; hours: number; minutes: number }) => void;
  theme: Palette;
}) {
  const maxWeeks = Math.min(4, Math.floor(maxMinutes / WEEK_MIN));
  const clampedWeeks = Math.min(weeks, maxWeeks);

  const remainingAfterWeeks = maxMinutes - clampedWeeks * WEEK_MIN;
  const maxDays = Math.min(6, Math.floor(remainingAfterWeeks / DAY_MIN));
  const clampedDays = Math.min(days, maxDays);

  const remainingAfterDays = remainingAfterWeeks - clampedDays * DAY_MIN;
  const maxHours = Math.min(23, Math.floor(remainingAfterDays / 60));
  const clampedHours = Math.min(hours, maxHours);

  const remainingAfterHours = remainingAfterDays - clampedHours * 60;
  const maxMinutesWheel = Math.min(59, remainingAfterHours);
  const clampedMinutes = Math.min(minutes, maxMinutesWheel);

  useEffect(() => {
    if (clampedWeeks !== weeks || clampedDays !== days || clampedHours !== hours || clampedMinutes !== minutes) {
      onChange({ weeks: clampedWeeks, days: clampedDays, hours: clampedHours, minutes: clampedMinutes });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedWeeks, clampedDays, clampedHours, clampedMinutes]);

  return (
    <View>
      <View style={styles.wrap}>
        <View style={[styles.highlight, { backgroundColor: theme.paperDim }]} pointerEvents="none" />
        <WheelColumn
          data={range(maxWeeks)}
          value={clampedWeeks}
          onChange={(w) => onChange({ weeks: w, days: clampedDays, hours: clampedHours, minutes: clampedMinutes })}
          theme={theme}
        />
        <WheelColumn
          data={range(maxDays)}
          value={clampedDays}
          onChange={(d) => onChange({ weeks: clampedWeeks, days: d, hours: clampedHours, minutes: clampedMinutes })}
          theme={theme}
        />
        <WheelColumn
          data={range(maxHours)}
          value={clampedHours}
          onChange={(h) => onChange({ weeks: clampedWeeks, days: clampedDays, hours: h, minutes: clampedMinutes })}
          theme={theme}
        />
        <WheelColumn
          data={range(maxMinutesWheel)}
          value={clampedMinutes}
          onChange={(m) => onChange({ weeks: clampedWeeks, days: clampedDays, hours: clampedHours, minutes: m })}
          theme={theme}
        />
      </View>
      <View style={styles.unitRow}>
        <Text style={[styles.unit, { color: theme.inkSoft }]}>sem.</Text>
        <Text style={[styles.unit, { color: theme.inkSoft }]}>jours</Text>
        <Text style={[styles.unit, { color: theme.inkSoft }]}>heures</Text>
        <Text style={[styles.unit, { color: theme.inkSoft }]}>min.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', height: ITEM_HEIGHT * VISIBLE_ROWS, position: 'relative' },
  highlight: { position: 'absolute', left: 0, right: 0, top: PAD, height: ITEM_HEIGHT, borderRadius: 12 },
  column: { flex: 1 },
  row: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 19 },
  unitRow: { flexDirection: 'row', marginTop: 4 },
  unit: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
});
