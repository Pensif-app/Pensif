import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import React from 'react';
import { useColorScheme } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { tabBarHidden } from './tabBarVisibility';
import { navigationRef } from './navigationRef';
import { HomeScreen } from '../screens/HomeScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { PenseesScreen } from '../screens/PenseesScreen';
import { GiftsScreen } from '../screens/GiftsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { FicheScreen } from '../screens/FicheScreen';
import { MessageScreen } from '../screens/MessageScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { PenseeDetailScreen } from '../screens/PenseeDetailScreen';
import { MemorizedPenseesScreen } from '../screens/MemorizedPenseesScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { CaptureDebugScreen } from '../screens/CaptureDebugScreen';
import { FloatingTabBar } from './TabBar';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { RootStackParamList, TabParamList } from './types';
import { useTheme } from '../theme';
import { useStore } from '../data/store';

// Onglets en Material Top Tabs (plutôt que Bottom Tabs) uniquement pour hériter du swipe
// horizontal natif entre écrans — la barre du bas reste la nôtre (FloatingTabBar), le
// tabBar par défaut de material-top-tabs est simplement désactivé.
const Tab = createMaterialTopTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ swipeEnabled: true, animationEnabled: true }}
    >
      <Tab.Screen name="Accueil" component={HomeScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      {/* Ce que l'utilisateur a confié à Pensif — remplace l'ancien onglet Cadeaux/"Pensée" à la
          même position (voir CHANTIER ONGLET PENSÉES V1). Les cadeaux sont désormais une
          destination contextuelle du Stack (voir Stack.Screen "Cadeaux" plus bas). */}
      <Tab.Screen name="Pensées" component={PenseesScreen} />
      {/* Le swipe latéral est ici géré par le calendrier lui-même (mois/semaine précédent-suivant)
          plutôt que par le changement d'onglet, pour éviter que les deux gestes ne se marchent
          dessus. */}
      <Tab.Screen name="Calendrier" component={CalendarScreen} options={{ swipeEnabled: false }} />
    </Tab.Navigator>
  );
}

export function RootNavigator({ onReady }: { onReady?: () => void } = {}) {
  const systemScheme = useColorScheme();
  const { themePref } = useStore();
  const isDark = (themePref === 'system' ? systemScheme : themePref) === 'dark';
  const palette = useTheme();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: palette.paper,
      card: palette.card,
      text: palette.ink,
      border: palette.line,
      primary: palette.accentStrong,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={onReady}
      theme={navTheme}
      // tabBarHidden est une shared value globale (persiste tant que l'app tourne) mise à 1 quand
      // on scrolle vers le bas dans un écran (voir Screen.tsx). Comme Fiche/Quiz/Réglages sont
      // poussés par-dessus Tabs dans la pile plutôt que remonter dedans, revenir dessus (par
      // n'importe quel chemin : bouton retour, "Voir ses idées cadeaux" en fin de quizz, etc.)
      // sans avoir rescrollé jusqu'en haut la laissait parfois bloquée à 1 → barre assombrie en
      // permanence. On la remet donc à 0 à chaque changement de navigation, où qu'il ait lieu.
      onStateChange={() => {
        tabBarHidden.value = withTiming(0, { duration: 150 });
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerTintColor: palette.ink,
          headerStyle: { backgroundColor: palette.paper },
          headerShadowVisible: false,
          headerLeft: () => <HeaderBackButton />,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        {/* Pas de `title` statique ici : FicheScreen appelle navigation.setOptions({title}) lui-même
            (prénom du proche, ou "Nouveau proche") — seule source du titre, voir CHANTIER PROCHES +
            FICHE V1 §6. Un titre par défaut neutre évite un flash avant que l'effet ne s'exécute. */}
        <Stack.Screen name="Fiche" component={FicheScreen} options={{ title: '' }} />
        {/* Destination contextuelle, plus un onglet permanent (voir CHANTIER ONGLET PENSÉES V1) —
            toujours ouvert avec un contactId précis (Accueil, Fiche, Calendrier, notification). */}
        <Stack.Screen name="Cadeaux" component={GiftsScreen} options={{ title: '' }} />
        <Stack.Screen name="Message" component={MessageScreen} options={{ title: '' }} />
        {/* Pas de `title` statique : PenseeDetailScreen fixe lui-même son titre ("Nouvelle pensée"
            vs "Modifier la pensée") — même principe que Fiche (voir CHANTIER PENSÉES V2). */}
        <Stack.Screen name="PenseeDetail" component={PenseeDetailScreen} options={{ title: '' }} />
        {/* CHANTIER PENSÉES V3 — bibliothèque des pensées sans date, ouverte depuis "Voir toutes les
            pensées mémorisées" (PenseesScreen). Titre statique (headerLeft retour déjà par défaut,
            voir screenOptions ci-dessus). */}
        <Stack.Screen name="PenseesMemorisees" component={MemorizedPenseesScreen} options={{ title: 'Pensées mémorisées' }} />
        <Stack.Screen name="Reglages" component={SettingsScreen} options={{ title: 'Réglages' }} />
        {/* Écran plein temps propre (barre de progression + retour maison), sans le header natif. */}
        <Stack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false }} />
        {/* gestureEnabled: false — le swipe-back natif iOS est un reconnaisseur indépendant du
            PanResponder JS du bouton push-to-talk ; un léger décalage du doigt vers le bord pendant
            l'enregistrement le déclenchait sinon, annulant le vocal en cours (voir CaptureScreen).
            Le bouton retour du header reste le seul moyen de quitter, sur tous les états de l'écran. */}
        <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: '', gestureEnabled: false }} />
        {/* CHANTIER "Pré-TestFlight Phase 2 — Hardening release" (2026-09-22) — conservé pour
            diagnostic (chemin micro → backend → JSON brut), plus aucun bouton n'y mène depuis l'app
            (voir HomeScreen/PenseesScreen), remplacé par "Capture" ci-dessus. Le `<Stack.Screen>`
            lui-même est désormais absent de la stack en production/TestFlight (pas seulement un
            bouton masqué) : `__DEV__` est évalué une fois au chargement du module React Native (pas
            une valeur runtime togglable), donc cette condition retire réellement l'écran du bundle de
            navigation en build production, il ne peut jamais être atteint par un nom de route. */}
        {__DEV__ && <Stack.Screen name="CaptureDebug" component={CaptureDebugScreen} options={{ title: 'Capture (debug)' }} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
