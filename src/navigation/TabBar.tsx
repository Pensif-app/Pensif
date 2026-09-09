import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, SharedValue } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { useStore } from '../data/store';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Accueil: 'home',
  Contacts: 'person',
  Cadeaux: 'gift',
  Calendrier: 'calendar',
};

const BTN_SIZE = 46;
// Marge verticale (contrôle la hauteur de la barre) et marge horizontale (contrôle l'espace
// entre le premier/dernier bouton et le bord de la barre) séparées : la bulle est plus large que
// haute, donc il lui faut plus de marge horizontale que verticale pour ne pas toucher le trait de
// contour de la barre quand elle est posée sur le premier ou le dernier onglet.
const BAR_PADDING_V = 12;
const BAR_PADDING_H = 18;
const BAR_RADIUS = 999;
const BUBBLE_HEIGHT = 58;
const BUBBLE_WIDTH = BUBBLE_HEIGHT + 20;
const BUBBLE_RADIUS = 20;
const BUBBLE_INSET = (BUBBLE_WIDTH - BTN_SIZE) / 2;
// Au-delà du premier/dernier onglet, on tolère un léger dépassement pendant qu'on glisse (avant
// de coller pile sur le bord) — c'est ce qui donne l'effet "flaque qui s'écrase contre le coin".
const EDGE_OVERSHOOT = 16;
const SPRING = { damping: 16, stiffness: 220, mass: 0.6 };
const PRESS_SPRING = { damping: 9, stiffness: 280 };

export function FloatingTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  const isDark = (themePref === 'system' ? systemScheme : themePref) === 'dark';

  // Position réelle de chaque bouton (mesurée, plutôt que déduite de space-around) pour que
  // la bulle glisse exactement sous les icônes. Recopiée dans une shared value : un ref React
  // classique ne se lit pas de façon fiable depuis un worklet (thread UI de Reanimated).
  const [buttonX, setButtonX] = useState<number[]>([]);
  const buttonXShared = useSharedValue<number[]>([]);
  useEffect(() => {
    buttonXShared.value = buttonX;
  }, [buttonX, buttonXShared]);

  const onButtonLayout = (index: number) => (e: LayoutChangeEvent) => {
    const x = e.nativeEvent.layout.x;
    setButtonX((prev) => {
      if (prev[index] === x) return prev;
      const next = [...prev];
      next[index] = x;
      return next;
    });
  };
  const bubbleReady = buttonX.length === state.routes.length && buttonX.every((x) => x !== undefined);

  const bubbleX = useSharedValue(0);
  const bubbleScale = useSharedValue(1);
  const edgeSquashX = useSharedValue(1);
  const isDragging = useSharedValue(0);
  // -1 = personne ; sinon l'index de l'onglet actuellement "survolé" (pressé, ou sous la bulle
  // pendant un glisser) — c'est ce qui déclenche le petit zoom sur l'icône.
  const hoverIndex = useSharedValue(-1);

  // La bulle retombe pile centrée sur l'onglet actif à chaque changement — tap, swipe terminé ou
  // glisser relâché, peu importe la cause.
  useEffect(() => {
    if (!bubbleReady || isDragging.value) return;
    bubbleX.value = withSpring((buttonX[state.index] ?? 0) - BUBBLE_INSET, SPRING);
  }, [state.index, bubbleReady, buttonX, bubbleX, isDragging]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bubbleX.value },
      { scale: bubbleScale.value },
      { scaleX: edgeSquashX.value },
    ],
  }));

  const activeIndex = state.index;
  const navigateTo = (index: number) => {
    navigation.navigate(state.routes[index].name as never);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onBegin(() => {
          // Se déclenche dès l'appui, drag ou pas — c'est ce qui fait "grossir" la bulle sur un
          // simple appui maintenu, indépendamment du glisser.
          isDragging.value = 1;
          hoverIndex.value = activeIndex;
          bubbleScale.value = withSpring(1.3, SPRING);
        })
        .onUpdate((e) => {
          const xs = buttonXShared.value;
          const minX = xs[0] ?? 0;
          const maxX = xs[xs.length - 1] ?? 0;
          const base = xs[activeIndex] ?? 0;
          const raw = base + e.translationX;
          const overshoot = raw < minX ? minX - raw : raw > maxX ? raw - maxX : 0;
          const clamped = Math.max(minX - EDGE_OVERSHOOT, Math.min(maxX + EDGE_OVERSHOOT, raw));

          bubbleX.value = clamped - BUBBLE_INSET;
          edgeSquashX.value = 1 + Math.min(overshoot, EDGE_OVERSHOOT) / EDGE_OVERSHOOT * 0.4;

          let nearest = activeIndex;
          let best = Infinity;
          for (let i = 0; i < xs.length; i++) {
            const d = Math.abs(xs[i] - clamped);
            if (d < best) {
              best = d;
              nearest = i;
            }
          }
          hoverIndex.value = nearest;
        })
        .onFinalize(() => {
          // Toujours exécuté — même si le geste est annulé (doigt sorti de la barre côté bord),
          // ce qui évite que la bulle reste figée à mi-chemin. On la recentre nous-mêmes ici,
          // plutôt que de compter sur le changement d'onglet pour le faire : si l'onglet le plus
          // proche est déjà l'onglet actif, `state.index` ne changera pas, et rien d'autre ne la
          // ramènerait au centre.
          bubbleScale.value = withSpring(1, SPRING);
          edgeSquashX.value = withSpring(1, SPRING);
          isDragging.value = 0;
          const nearest = hoverIndex.value;
          hoverIndex.value = -1;
          const xs = buttonXShared.value;
          bubbleX.value = withSpring((xs[nearest] ?? xs[activeIndex] ?? 0) - BUBBLE_INSET, SPRING);
          if (nearest !== -1 && nearest !== activeIndex) runOnJS(navigateTo)(nearest);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeIndex],
  );

  const bubbleGlass = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.5)';
  const bubbleEdge = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.9)';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BlurView
        intensity={60}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.bar, { borderColor: theme.line }]}
      >
        {bubbleReady && (
          <Animated.View
            pointerEvents="none"
            style={[styles.bubble, { backgroundColor: bubbleGlass, borderColor: bubbleEdge }, bubbleStyle]}
          />
        )}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            if (!focused) navigation.navigate(route.name as never);
          };
          const button = (
            <TabBarButton
              key={route.key}
              index={index}
              hoverIndex={hoverIndex}
              onPress={onPress}
              onLayout={onButtonLayout(index)}
              iconName={ICONS[route.name] ?? 'ellipse'}
              color={focused ? theme.accentStrong : theme.inkSoft}
              focused={focused}
              label={route.name}
            />
          );
          return focused ? (
            <GestureDetector key={route.key} gesture={panGesture}>
              {button}
            </GestureDetector>
          ) : (
            button
          );
        })}
      </BlurView>
    </View>
  );
}

function TabBarButton({
  index,
  hoverIndex,
  onPress,
  onLayout,
  iconName,
  color,
  focused,
  label,
}: {
  index: number;
  hoverIndex: SharedValue<number>;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  label: string;
}) {
  const iconStyle = useAnimatedStyle(() => {
    const hovered = hoverIndex.value === index;
    const target = hovered ? 1.35 : focused ? 1.08 : 1;
    return { transform: [{ scale: withSpring(target, PRESS_SPRING) }] };
  });

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      onPressIn={() => {
        hoverIndex.value = index;
      }}
      onPressOut={() => {
        if (hoverIndex.value === index) hoverIndex.value = -1;
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.btn}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={iconName} size={21} color={color} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.select({ ios: 30, default: 18 }),
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingVertical: BAR_PADDING_V,
    paddingHorizontal: BAR_PADDING_H,
    borderRadius: BAR_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: (BTN_SIZE - BUBBLE_HEIGHT) / 2 + BAR_PADDING_V,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    borderRadius: BUBBLE_RADIUS,
    borderWidth: 1,
  },
});
