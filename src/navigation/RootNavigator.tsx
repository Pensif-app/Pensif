import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import React from 'react';
import { useColorScheme } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { GiftsScreen } from '../screens/GiftsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { FicheScreen } from '../screens/FicheScreen';
import { MessageScreen } from '../screens/MessageScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
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
      <Tab.Screen name="Cadeaux" component={GiftsScreen} />
      <Tab.Screen name="Calendrier" component={CalendarScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
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
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: palette.ink,
          headerStyle: { backgroundColor: palette.paper },
          headerShadowVisible: false,
          headerLeft: () => <HeaderBackButton />,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Fiche" component={FicheScreen} options={{ title: 'Fiche contact' }} />
        <Stack.Screen name="Message" component={MessageScreen} options={{ title: '' }} />
        <Stack.Screen name="Reglages" component={SettingsScreen} options={{ title: 'Réglages' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
