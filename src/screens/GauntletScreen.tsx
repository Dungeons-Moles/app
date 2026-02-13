import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Typography } from '@/theme/typography';
import { useGauntlet } from '@/hooks/useGauntlet';
import { useSession } from '@/contexts/SessionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { checkSessionExists } from '@/services/solana/sessionList';
import { GAUNTLET_ENTRY_LAMPORTS } from '@/services/solana/gauntlet';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');

type GauntletScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Gauntlet'>;
};

export function GauntletScreen({ navigation }: GauntletScreenProps) {
  const gauntlet = useGauntlet();
  const { activeSessions } = useSession();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [hasExistingGauntletSessionOnChain, setHasExistingGauntletSessionOnChain] = useState(false);
  const hasExistingGauntletSessionInList = activeSessions.some(
    (session) => session.level === 18
  );
  const hasExistingGauntletSession =
    hasExistingGauntletSessionOnChain || hasExistingGauntletSessionInList;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    const checkGauntletSession = async () => {
      if (!wallet.publicKey) {
        if (!cancelled) setHasExistingGauntletSessionOnChain(false);
        return;
      }
      try {
        const exists = await checkSessionExists(connection, wallet.publicKey, 18);
        if (!cancelled) setHasExistingGauntletSessionOnChain(exists);
      } catch {
        if (!cancelled) setHasExistingGauntletSessionOnChain(false);
      }
    };
    checkGauntletSession();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, activeSessions.length]);

  const handleBack = useCallback(() => {
    gauntlet.reset();
    navigation.goBack();
  }, [gauntlet, navigation]);

  const handleEnter = useCallback(async () => {
    const ok = await gauntlet.enterGauntlet();
    if (ok) {
      navigation.navigate('Game');
    }
  }, [gauntlet, navigation]);

  const entryFeeSol = GAUNTLET_ENTRY_LAMPORTS / 1_000_000_000;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            {gauntlet.phase === 'confirm' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>GAUNTLET</Text>
                <Text style={styles.subtitle}>5-week async PvP</Text>

                <View style={styles.infoPanel}>
                  <Text style={styles.infoText}>Entry fee: {entryFeeSol} SOL</Text>
                  <Text style={styles.infoTextSmall}>Play in a random seed with fixed difficulty.</Text>
                  <Text style={styles.infoTextSmall}>At each week end, fight a random echo build.</Text>
                </View>

                <TouchableOpacity onPress={handleEnter} activeOpacity={0.7} disabled={gauntlet.isLoading}>
                  <ImageBackground
                    source={buttonV4Source}
                    style={[styles.actionButton, gauntlet.isLoading && { opacity: 0.6 }]}
                    resizeMode="stretch"
                  >
                    {gauntlet.isLoading ? (
                      <ActivityIndicator color="#1a1a1a" size="small" />
                    ) : (
                      <Text style={styles.buttonTextPrimary}>
                        {hasExistingGauntletSession ? 'Resume Gauntlet Session' : 'Enter Gauntlet'}
                      </Text>
                    )}
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                  <ImageBackground source={buttonV1Source} style={styles.actionButton} resizeMode="stretch">
                    <Text style={styles.buttonText}>Back</Text>
                  </ImageBackground>
                </TouchableOpacity>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('GauntletHistory')}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonText}>History</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('GauntletRanking')}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonText}>Ranking</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {gauntlet.phase === 'error' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>GAUNTLET</Text>
                <Text style={styles.errorText}>{gauntlet.error}</Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                    <ImageBackground source={buttonV1Source} style={styles.actionButton} resizeMode="stretch">
                      <Text style={styles.buttonText}>Back</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={gauntlet.reset} activeOpacity={0.7}>
                    <ImageBackground source={buttonV4Source} style={styles.actionButton} resizeMode="stretch">
                      <Text style={styles.buttonTextPrimary}>Try Again</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  phaseContainer: { alignItems: 'center', gap: 14, maxWidth: 420 },
  title: { fontFamily: Typography.header, fontSize: 32, color: '#FABC0F', textAlign: 'center' },
  subtitle: { fontFamily: Typography.body, fontSize: 16, color: '#d0d0d0', textAlign: 'center' },
  infoPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    padding: 16,
    gap: 8,
    width: '100%',
  },
  infoText: {
    fontFamily: Typography.number,
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  infoTextSmall: { fontFamily: Typography.body, fontSize: 13, color: '#b8b8b8', textAlign: 'center', lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionButton: { width: 180, height: 52, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontFamily: Typography.button, fontSize: 14, color: '#3d2b1f', marginBottom: 4 },
  buttonTextPrimary: { fontFamily: Typography.button, fontSize: 14, color: '#1a1a1a', marginBottom: 4 },
  errorText: { fontFamily: Typography.body, fontSize: 14, color: '#ff8f8f', textAlign: 'center' },
});
