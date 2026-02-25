// Polyfills must be imported first
import './src/polyfills';
import { applyConsoleControl } from './src/utils/consoleControl';

import React, { useEffect, useState } from 'react';
import { Image, Platform } from 'react-native';
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
import { AudioProvider } from './src/contexts/AudioContext';
import { SettingsProvider } from './src/contexts/SettingsContext';
import { AppNavigator } from './src/navigation';
import { Psg1Wrapper } from './src/components/Psg1Wrapper';

applyConsoleControl();

// Critical assets to preload during splash screen (first screens the user sees)
const PRELOAD_ASSETS = [
  require('./assets/ui/backgrounds/loading-background.png'),
  require('./assets/ui/backgrounds/account-background-compact.png'),
  require('./assets/ui/backgrounds/account-background-wide.png'),
  require('./assets/ui/backgrounds/hub-background-compact.png'),
  require('./assets/ui/backgrounds/hub-background-wide.png'),
  require('./assets/ui/panels/paper-panel.png'),
  require('./assets/branding/logo.png'),
];

function prefetchImages(images: number[]): Promise<void> {
  if (Platform.OS === 'web') {
    // Image.resolveAssetSource is not available on web; skip prefetch
    return Promise.resolve();
  }
  return Promise.all(
    images.map((source) => {
      const resolved = Image.resolveAssetSource(source);
      if (resolved?.uri) {
        return Image.prefetch(resolved.uri).catch(() => {});
      }
      return Promise.resolve();
    })
  ).then(() => {});
}

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
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  useEffect(() => {
    prefetchImages(PRELOAD_ASSETS).then(() => setAssetsLoaded(true));
  }, []);

  const isReady = (fontsLoaded || fontError) && assetsLoaded;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <Psg1Wrapper>
      <SafeAreaProvider>
        <SettingsProvider>
        <AudioProvider>
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
        </AudioProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </Psg1Wrapper>
  );
}
