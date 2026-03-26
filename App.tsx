// Polyfills must be imported first
import './src/polyfills';

import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import * as Sentry from '@sentry/react-native';
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
import { AudioProvider } from './src/contexts/AudioContext';
import { SettingsProvider } from './src/contexts/SettingsContext';
import { AppNavigator } from './src/navigation';
import { Psg1Wrapper } from './src/components/Psg1Wrapper';
import { preloadCriticalImages } from './src/utils/preloadCriticalImages';
import { Analytics } from '@vercel/analytics/react';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  environment: __DEV__ ? 'development' : 'production',
});

// Critical assets to preload during splash screen (first screens the user sees)
const PRELOAD_ASSETS = [
  require('./assets/ui/backgrounds/loading-background.webp'),
  require('./assets/ui/backgrounds/account-background-compact.webp'),
  require('./assets/ui/backgrounds/account-background-wide.webp'),
  require('./assets/ui/backgrounds/hub-background-compact.webp'),
  require('./assets/ui/backgrounds/hub-background-wide.webp'),
  require('./assets/ui/panels/paper-panel.webp'),
  require('./assets/branding/logo.webp'),
] as const;

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function App() {
  const [fontsLoaded, fontError] = useFonts({
    'IMFellEnglish-Regular': IMFellEnglish_400Regular,
    'IMFellEnglish-Italic': IMFellEnglish_400Regular_Italic,
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {
      // Some mobile browsers do not support orientation locking.
    });

    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  useEffect(() => {
    preloadCriticalImages(PRELOAD_ASSETS).then(() => setAssetsLoaded(true));
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
                        <StatusBar style="light" hidden />
                        <AppNavigator />
                        {Platform.OS === 'web' && <Analytics />}
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

export default Sentry.wrap(App);
