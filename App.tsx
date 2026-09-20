import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/data/store';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { NamePromptModal } from './src/components/NamePromptModal';
import { SplashOverlay } from './src/components/SplashOverlay';
import { AuthGateScreen } from './src/components/AuthGateScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useTheme } from './src/theme';
import { registerNotificationTapHandler } from './src/lib/notifications';

// Empêche le splash natif de se refermer tout seul dès que le JS démarre — on le referme nous-
// mêmes une fois notre écran de chargement (dégradé + logo) prêt à prendre le relais.
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppShell() {
  const { ready, userName, namePromptOpen, setUserName, contacts, pensees, authGate } = useStore();
  const theme = useTheme();

  // Toujours lire les contacts/pensées À JOUR au moment du tap (pas ceux du rendu où le listener a
  // été enregistré) — le listener lui-même n'est branché qu'une fois, voir
  // registerNotificationTapHandler. `penseesRef` sert à resolveNotificationAction pour vérifier
  // qu'une pensée existe encore avant d'y naviguer (CHANTIER NAVIGATION NOTIFICATION PENSÉES V2).
  const contactsRef = useRef(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
  const penseesRef = useRef(pensees);
  useEffect(() => {
    penseesRef.current = pensees;
  }, [pensees]);

  // Distinct de `ready` (store) : le NavigationContainer a son propre cycle de montage, signalé par
  // son `onReady` (voir RootNavigator). Une navigation reçue avant que les DEUX ne soient prêts (cas
  // "app fermée → ouverte par un tap") est mise en attente par registerNotificationTapHandler et
  // résolue avec les données live dès que possible, jamais avec un état vide figé au démarrage.
  const [navReady, setNavReady] = useState(false);
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  // `isReady()` est un getter appelé bien après le montage de cet effet (potentiellement des
  // secondes plus tard) — il doit lire un ref, jamais capturer `navReady` directement dans la
  // closure de l'effet ci-dessous, qui ne s'exécute qu'une fois (deps: []).
  const navReadyRef = useRef(navReady);
  useEffect(() => {
    navReadyRef.current = navReady;
  }, [navReady]);
  const tapHandlerRef = useRef<ReturnType<typeof registerNotificationTapHandler> | null>(null);

  useEffect(() => {
    function safeNavigate(name: string, params?: object) {
      if (navigationRef.isReady()) {
        (navigationRef.navigate as (n: string, p?: object) => void)(name, params);
      }
    }
    tapHandlerRef.current = registerNotificationTapHandler(
      safeNavigate,
      () => contactsRef.current,
      () => navReadyRef.current && navigationRef.isReady() && readyRef.current,
      () => penseesRef.current,
    );
    return tapHandlerRef.current.unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dès que la navigation ET le store deviennent prêts, retente une navigation restée en attente.
  useEffect(() => {
    tapHandlerRef.current?.retryPending();
  }, [navReady, ready]);

  return (
    <>
      <RootNavigator onReady={() => setNavReady(true)} />
      {/* `ready` évite d'afficher brièvement la modale au lancement avant que le prénom déjà
          enregistré n'ait fini de se charger (AsyncStorage/Supabase). CHANTIER "Data Safety P0-1"
          (2026-09-20) — `authGate === 'none'` en plus : jamais la modale prénom PAR-DESSUS l'auth
          gate (aucune donnée/session à ce stade, rien à nommer). */}
      <NamePromptModal visible={ready && authGate === 'none' && (!userName || namePromptOpen)} initialValue={userName ?? ''} onSubmit={setUserName} />
      <StatusBar style="auto" />
      <SplashOverlay theme={theme} ready={ready} />
      {/* CHANTIER "Data Safety P0-1" (2026-09-20) — overlay plein écran, sibling de RootNavigator
          (jamais inséré dans la pile de navigation, voir AuthGateScreen.tsx) : affiché UNIQUEMENT si
          Supabase est configuré ET qu'aucune session n'existe (store.tsx ne crée jamais de compte
          anonyme automatiquement dans ce cas). Rendu APRÈS SplashOverlay dans le JSX pour rester
          au-dessus une fois le splash retiré. */}
      {ready && authGate === 'choice' && <AuthGateScreen />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StoreProvider>
            <AppShell />
          </StoreProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
