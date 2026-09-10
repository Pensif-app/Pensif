import React, { useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { tabBarHidden } from '../navigation/tabBarVisibility';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const theme = useTheme();
  const lastY = useRef(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastY.current;
    lastY.current = y;
    if (y < 20) {
      tabBarHidden.value = withTiming(0, { duration: 90 });
    } else if (delta > 6) {
      tabBarHidden.value = withTiming(1, { duration: 220 });
    } else if (delta < -6) {
      tabBarHidden.value = withTiming(0, { duration: 90 });
    }
  };

  if (!scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.paper }]} edges={['top']}>
        <View style={styles.flex}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.paper }]} edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 110 },
});
