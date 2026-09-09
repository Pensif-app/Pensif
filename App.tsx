import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/data/store';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NamePromptModal } from './src/components/NamePromptModal';

function AppShell() {
  const { userName, namePromptOpen, setUserName } = useStore();
  return (
    <>
      <RootNavigator />
      <NamePromptModal visible={!userName || namePromptOpen} initialValue={userName ?? ''} onSubmit={setUserName} />
      <StatusBar style="auto" />
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
