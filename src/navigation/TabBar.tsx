import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import { useStore } from '../data/store';
import { tabBarHidden } from './tabBarVisibility';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Accueil: 'home',
  Contacts: 'person',
  Calendrier: 'calendar',
};

// Pas d'icône Ionicons dédiée pour "Pensée" — on utilise le "P" du logo Pensif (silhouette
// blanche avec le coeur en trou, voir assets/logo-mark.png généré depuis assets/icon.png), recoloré
// via `tintColor` exactement comme les icônes de police des autres onglets.
const LOGO_ROUTES = new Set(['Cadeaux']);

// Libellé affiché dans la barre — distinct du nom de route ('Cadeaux' reste le nom technique de
// l'écran/onglet dans la navigation, pour ne pas avoir à toucher tous les endroits qui y naviguent).
const LABELS: Record<string, string> = { Cadeaux: 'Pensée' };

const SPRING = { damping: 18, stiffness: 260, mass: 0.7 };
const SNAP_SPRING = { damping: 15, stiffness: 220, mass: 0.8 };
// Doivent correspondre aux valeurs du style `bar` ci-dessous — utilisées pour calculer la hauteur
// totale réelle de la barre (row + padding + bordure) à partir de la seule hauteur mesurée de la
// rangée de boutons.
const BAR_PADDING_V = 10;
const BAR_PADDING_H = 10;
const BAR_BORDER = 1;
// Au repos : la bulle occupe quasiment toute la hauteur de la barre (juste quelques pixels de
// marge en haut/bas, comme sur l'App Store). Ce n'est qu'en appui maintenu / glisser qu'elle
// grossit encore et déborde par-dessus le contour.
const REST_PAD_H = 6;
const REST_MARGIN_V = 4;
const PRESS_PAD_H = 22;
const PRESS_OVERFLOW_V = 16;
// En glissant jusqu'au bord, la bulle ne doit dépasser que de quelques pixels du contour de la
// barre — jamais flotter complètement détachée à côté.
const EDGE_OVERFLOW_MAX = 10;

type Layout = { x: number; width: number };
type RowOrigin = { x: number; y: number; height: number };

export function FloatingTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const theme = useTheme();
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  const isDark = (themePref === 'system' ? systemScheme : themePref) === 'dark';

  const [layouts, setLayouts] = useState<Layout[]>([]);
  const layoutsShared = useSharedValue<Layout[]>([]);
  useEffect(() => {
    layoutsShared.value = layouts;
  }, [layouts, layoutsShared]);
  const ready = layouts.length === state.routes.length && layouts.every(Boolean);

  const [barWidth, setBarWidth] = useState(0);
  // Position/hauteur de la rangée de boutons à l'intérieur de la barre : sert à placer la bulle
  // (qui est un sibling en dehors du BlurView, pour pouvoir déborder par-dessus le contour flouté
  // sans être rognée par son `overflow: hidden`).
  const [rowOrigin, setRowOrigin] = useState<RowOrigin>({ x: 0, y: 0, height: 0 });
  const onRowLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setBarWidth(width);
    setRowOrigin((prev) => (prev.x === x && prev.y === y && prev.height === height ? prev : { x, y, height }));
  };

  // Les 4 dimensions de la bulle sont animées indépendamment (et non via un simple `scale`) pour
  // pouvoir avoir une taille de repos strictement plus petite que le contour de la barre, et une
  // taille de pression qui, elle, déborde par-dessus ce contour.
  const pillLeft = useSharedValue(0);
  const pillTop = useSharedValue(0);
  const pillW = useSharedValue(0);
  const pillH = useSharedValue(0);
  const isPressing = useSharedValue(0);
  // -1 = personne ; sinon l'onglet actuellement sous le doigt pendant un appui/glisser.
  const hoverIndex = useSharedValue(-1);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || isPressing.value) return;
    const active = layouts[state.index];
    const barTop = rowOrigin.y - (BAR_PADDING_V + BAR_BORDER);
    const barHeight = rowOrigin.height + 2 * (BAR_PADDING_V + BAR_BORDER);
    const w = active.width + REST_PAD_H;
    const h = barHeight - REST_MARGIN_V * 2;
    pillW.value = withSpring(w, SNAP_SPRING);
    pillH.value = withSpring(h, SNAP_SPRING);
    pillLeft.value = withSpring(rowOrigin.x + active.x + active.width / 2 - w / 2, SNAP_SPRING);
    pillTop.value = withSpring(barTop + REST_MARGIN_V, SNAP_SPRING);
  }, [state.index, ready, layouts, rowOrigin, pillLeft, pillTop, pillW, pillH, isPressing]);

  const pillStyle = useAnimatedStyle(() => ({
    left: pillLeft.value,
    top: pillTop.value,
    width: pillW.value,
    height: pillH.value,
  }));

  const barShiftStyle = useAnimatedStyle(() => ({
    opacity: 1 - tabBarHidden.value * 0.75,
    transform: [{ translateY: tabBarHidden.value * 20 }],
  }));

  const onTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      if (prev[index]?.x === x && prev[index]?.width === width) return prev;
      const next = [...prev];
      next[index] = { x, width };
      return next;
    });
  };

  const activeIndex = state.index;
  const navigateTo = (index: number) => {
    navigation.navigate(state.routes[index].name as never);
  };
  const rowX = rowOrigin.x;
  const rowY = rowOrigin.y;
  const rowH = rowOrigin.height;
  const barTotalWidth = barWidth + 2 * (BAR_PADDING_H + BAR_BORDER);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(0)
      .onBegin((e) => {
        'worklet';
        // Dès que le doigt se pose (pas d'attente, pas de seuil de distance) : on détermine tout
        // de suite l'onglet sous le doigt et on grossit la bulle dessus, pour un démarrage
        // immédiat et fluide du glisser.
        isPressing.value = 1;
        const xs = layoutsShared.value;
        let nearest = activeIndex;
        let best = Infinity;
        for (let i = 0; i < xs.length; i++) {
          const center = xs[i].x + xs[i].width / 2;
          const d = Math.abs(center - e.x);
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        hoverIndex.value = nearest;
        const target = xs[nearest];
        if (!target) return;
        const w = target.width + PRESS_PAD_H;
        const h = rowH + PRESS_OVERFLOW_V * 2;
        const rawLeft = rowX + target.x + target.width / 2 - w / 2;
        const left = Math.max(-EDGE_OVERFLOW_MAX, Math.min(barTotalWidth - w + EDGE_OVERFLOW_MAX, rawLeft));
        pillW.value = withSpring(w, SPRING);
        pillH.value = withSpring(h, SPRING);
        pillLeft.value = withSpring(left, SPRING);
        pillTop.value = withSpring(rowY - PRESS_OVERFLOW_V, SPRING);
        runOnJS(setDragIndex)(nearest);
      })
      .onUpdate((e) => {
        'worklet';
        const xs = layoutsShared.value;
        if (xs.length === 0) return;
        const clampedX = Math.max(0, Math.min(barWidth, e.x));
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < xs.length; i++) {
          const center = xs[i].x + xs[i].width / 2;
          const d = Math.abs(center - clampedX);
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        // La bulle suit le doigt en continu pendant le glisser (pas de ressort ici, pour un
        // suivi 1:1), seule sa largeur s'anime en douceur quand elle change d'onglet survolé.
        // On borne sa position pour qu'elle ne déborde que légèrement du contour de la barre aux
        // extrémités, plutôt que de flotter complètement détachée à côté.
        const rawLeft = rowX + clampedX - pillW.value / 2;
        pillLeft.value = Math.max(-EDGE_OVERFLOW_MAX, Math.min(barTotalWidth - pillW.value + EDGE_OVERFLOW_MAX, rawLeft));
        if (nearest !== hoverIndex.value) {
          hoverIndex.value = nearest;
          pillW.value = withSpring(xs[nearest].width + PRESS_PAD_H, SPRING);
          runOnJS(setDragIndex)(nearest);
        }
      })
      .onFinalize(() => {
        'worklet';
        const xs = layoutsShared.value;
        const nearest = hoverIndex.value === -1 ? activeIndex : hoverIndex.value;
        const target = xs[nearest] ?? xs[activeIndex];
        if (target) {
          const barTop = rowY - (BAR_PADDING_V + BAR_BORDER);
          const barHeight = rowH + 2 * (BAR_PADDING_V + BAR_BORDER);
          const w = target.width + REST_PAD_H;
          const h = barHeight - REST_MARGIN_V * 2;
          pillW.value = withSpring(w, SNAP_SPRING);
          pillH.value = withSpring(h, SNAP_SPRING);
          pillLeft.value = withSpring(rowX + target.x + target.width / 2 - w / 2, SNAP_SPRING);
          pillTop.value = withSpring(barTop + REST_MARGIN_V, SNAP_SPRING);
        }
        isPressing.value = 0;
        hoverIndex.value = -1;
        runOnJS(setDragIndex)(null);
        if (nearest !== activeIndex) runOnJS(navigateTo)(nearest);
      });

    return pan;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, barWidth, rowX, rowY, rowH]);

  // Grammaire de la charte Pensif : violet = interaction, quel que soit le mode. Le contour et le
  // fond de la barre restent un bleu nuit désaturé (pas de violet en fond permanent).
  const pillTint = isDark ? 'rgba(114,87,232,0.16)' : 'rgba(114,87,232,0.10)';
  const pillBorder = isDark ? 'rgba(149,129,242,0.45)' : 'rgba(114,87,232,0.35)';
  const activeColor = '#A78BFA';

  return (
    <Animated.View style={[styles.wrap, barShiftStyle]} pointerEvents="box-none">
      <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={[styles.bar, { borderColor: theme.line }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.tabBarTint }]} />
        <GestureDetector gesture={gesture}>
          <View style={styles.row} onLayout={onRowLayout}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const hovered = dragIndex !== null ? dragIndex === index : focused;
              return (
                <TabBarButton
                  key={route.key}
                  onLayout={onTabLayout(index)}
                  iconName={ICONS[route.name] ?? 'ellipse'}
                  useLogo={LOGO_ROUTES.has(route.name)}
                  hovered={hovered}
                  inactiveColor={theme.inkSoft}
                  activeColor={activeColor}
                  label={LABELS[route.name] ?? route.name}
                />
              );
            })}
          </View>
        </GestureDetector>
      </BlurView>
      {/* Sibling du BlurView (pas un enfant) : peut ainsi déborder par-dessus le contour de la
          barre sans être rogné par son `overflow: hidden`, comme la bulle "Liquid Glass". */}
      {ready && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { backgroundColor: pillTint, borderColor: pillBorder }, pillStyle]}
        />
      )}
    </Animated.View>
  );
}

function TabBarButton({
  onLayout,
  iconName,
  useLogo,
  hovered,
  activeColor,
  inactiveColor,
  label,
}: {
  onLayout: (e: LayoutChangeEvent) => void;
  iconName: keyof typeof Ionicons.glyphMap;
  useLogo?: boolean;
  hovered: boolean;
  activeColor: string;
  inactiveColor: string;
  label: string;
}) {
  const scale = useSharedValue(1);
  // 0 → couleur inactive, 1 → couleur active : on transitionne cette valeur en douceur plutôt que
  // de changer la couleur d'un coup, pour que l'icône "s'allume" progressivement sous la bulle.
  const hoverAmt = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(hovered ? 1.22 : 1, SPRING);
    hoverAmt.value = withTiming(hovered ? 1 : 0, { duration: 220 });
  }, [hovered, scale, hoverAmt]);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // Ionicons est un composant composite (police d'icônes), pas un vrai noeud natif animable —
  // lui passer une couleur via useAnimatedProps plante à l'exécution. On simule donc la
  // transition de couleur avec un fondu croisé entre deux icônes superposées (technique sûre,
  // ne touche que `opacity`, une prop de style standard).
  const activeIconStyle = useAnimatedStyle(() => ({ opacity: hoverAmt.value }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(hoverAmt.value, [0, 1], [inactiveColor, activeColor]),
  }));

  return (
    <View onLayout={onLayout} style={styles.tab} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View style={[styles.tabContent, contentStyle]}>
        {useLogo ? (
          // Silhouette recolorée via tintColor (même principe que le fondu croisé Ionicons
          // ci-dessous, mais tintColor n'étant pas animable, on croise deux images teintées).
          <View>
            <Image source={require('../../assets/logo-mark.png')} style={[styles.logoIcon, { tintColor: inactiveColor }]} resizeMode="contain" />
            <Animated.View style={[StyleSheet.absoluteFill, activeIconStyle]}>
              <Image source={require('../../assets/logo-mark.png')} style={[styles.logoIcon, { tintColor: activeColor }]} resizeMode="contain" />
            </Animated.View>
          </View>
        ) : (
          <View>
            <Ionicons name={iconName} size={22} color={inactiveColor} />
            <Animated.View style={[StyleSheet.absoluteFill, activeIconStyle]}>
              <Ionicons name={iconName} size={22} color={activeColor} />
            </Animated.View>
          </View>
        )}
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </View>
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
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  pill: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabContent: {
    alignItems: 'center',
    gap: 2,
  },
  logoIcon: {
    width: 22,
    height: 22,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
  },
});
