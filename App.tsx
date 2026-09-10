import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/data/store';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NamePromptModal } from './src/components/NamePromptModal';
import { SplashOverlay } from './src/components/SplashOverlay';
import { useTheme } from './src/theme';

// Empêche le splash natif de se refermer tout seul dès que le JS démarre — on le referme nous-
// mêmes une fois notre écran de chargement (dégradé + logo) prêt à prendre le relais.
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppShell() {
  const { ready, userName, namePromptOpen, setUserName } = useStore();
  const theme = useTheme();
  return (
    <>
      <RootNavigator />
      {/* `ready` évite d'afficher brièvement la modale au lancement avant que le prénom déjà
          enregistré n'ait fini de se charger (AsyncStorage/Supabase). */}
      <NamePromptModal visible={ready && (!userName || namePromptOpen)} initialValue={userName ?? ''} onSubmit={setUserName} />
      <StatusBar style="auto" />
      <SplashOverlay theme={theme} ready={ready} />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <AppShell />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
