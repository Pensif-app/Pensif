import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { Palette } from '../theme/colors';

/**
 * Le splash natif ne peut afficher qu'une couleur unie + un logo — cet écran prend le relais dès
 * que possible pour donner le fond dégradé demandé, pendant que les données se chargent
 * (Supabase/AsyncStorage). Se referme en fondu une fois `ready`.
 */
export function SplashOverlay({ theme, ready }: { theme: Palette; ready: boolean }) {
  const hiddenNative = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;

  const onLayout = () => {
    if (hiddenNative.current) return;
    hiddenNative.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    if (ready) {
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    }
  }, [ready, opacity]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents={ready ? 'none' : 'auto'}
      onLayout={onLayout}
    >
      <LinearGradient colors={[theme.paper, theme.accentTint, theme.paper]} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 120, height: 120, borderRadius: 28 },
});
