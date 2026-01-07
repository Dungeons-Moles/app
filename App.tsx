// Polyfills must be imported first
import './src/polyfills';

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WalletProvider } from './src/contexts/WalletContext';
import { ProfileProvider } from './src/contexts/ProfileContext';
import { AppNavigator } from './src/navigation';

export default function App() {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  return (
    <SafeAreaProvider>
      <WalletProvider>
        <ProfileProvider>
          <StatusBar style="light" hidden />
          <AppNavigator />
        </ProfileProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}
