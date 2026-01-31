// Polyfills must be imported first
import './src/polyfills';

import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import {
  useFonts,
  IMFellEnglish_400Regular,
  IMFellEnglish_400Regular_Italic,
} from '@expo-google-fonts/im-fell-english';
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { ProfileProvider } from './src/contexts/ProfileContext';
import { SessionProvider } from './src/contexts/SessionContext';
import { WalletProvider } from './src/contexts/WalletContext';
import { SolanaConnectionProvider } from './src/contexts/SolanaConnectionContext';
import { GameProvider } from './src/contexts/GameContext';
import { GameplayStateProvider } from './src/contexts/GameplayStateContext';
import { CombatReplayProvider } from './src/contexts/CombatReplayContext';
import { AppNavigator } from './src/navigation';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'IMFellEnglish-Regular': IMFellEnglish_400Regular,
    'IMFellEnglish-Italic': IMFellEnglish_400Regular_Italic,
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <WalletProvider>
        <SolanaConnectionProvider>
          <ProfileProvider>
            <SessionProvider>
              <GameplayStateProvider>
                <GameProvider>
                  <CombatReplayProvider>
                  <StatusBar style="light" hidden />
                  <AppNavigator />
                  </CombatReplayProvider>
                </GameProvider>
              </GameplayStateProvider>
            </SessionProvider>
          </ProfileProvider>
        </SolanaConnectionProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}
