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
import { useDuels } from '@/hooks/useDuels';
import { useSession } from '@/contexts/SessionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { Typography } from '@/theme/typography';
import { DUEL_ENTRY_LAMPORTS } from '@/services/solana/duels';
import { checkSessionExists } from '@/services/solana/sessionList';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');

type DuelsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Duels'>;
};

export function DuelsScreen({ navigation }: DuelsScreenProps) {
  const duels = useDuels();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { activeSessions } = useSession();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const [hasExistingDuelSessionOnChain, setHasExistingDuelSessionOnChain] = useState(false);
  const hasExistingDuelSessionInList = activeSessions.some(
    (session) => session.level === 19
  );
  const hasExistingDuelSession = hasExistingDuelSessionOnChain || hasExistingDuelSessionInList;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    const checkDuelSession = async () => {
      if (!wallet.publicKey) {
        if (!cancelled) setHasExistingDuelSessionOnChain(false);
        return;
      }
      try {
        const exists = await checkSessionExists(connection, wallet.publicKey, 19);
        if (!cancelled) setHasExistingDuelSessionOnChain(exists);
      } catch {
        if (!cancelled) setHasExistingDuelSessionOnChain(false);
      }
    };
    checkDuelSession();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, activeSessions.length]);

  useEffect(() => {
    if (duels.phase === 'queued') {
      navigation.replace('Game');
    }
  }, [duels.phase, navigation]);

  const handleBack = useCallback(() => {
    duels.reset();
    navigation.goBack();
  }, [duels, navigation]);

  const handleEnter = useCallback(async () => {
    const ok = await duels.enterCurrentSessionDuel();
    if (ok) {
      navigation.navigate('Game');
    }
  }, [duels, navigation]);

  const entryFeeSol = DUEL_ENTRY_LAMPORTS / 1_000_000_000;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}> 
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            {duels.phase === 'confirm' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>DUELS</Text>
                <Text style={styles.subtitle}>Async PvP</Text>

                <View style={styles.infoPanel}>
                  <Text style={styles.infoText}>Entry fee: {entryFeeSol} SOL</Text>
                  <Text style={styles.infoTextSmall}>Winner takes 95% of the pot</Text>
                  <Text style={styles.infoTextSmall}>
                    Duel queue is scoped to your current run seed.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleEnter}
                  activeOpacity={0.7}
                  disabled={duels.isLoading}
                >
                  <ImageBackground
                    source={buttonV4Source}
                    style={[styles.actionButton, duels.isLoading && { opacity: 0.6 }]}
                    resizeMode="stretch"
                  >
                    {duels.isLoading ? (
                      <ActivityIndicator color="#1a1a1a" size="small" />
                    ) : (
                      <Text style={styles.buttonTextPrimary}>
                        {hasExistingDuelSession ? 'Resume Duels Session' : 'Enter Duels'}
                      </Text>
                    )}
                  </ImageBackground>
                </TouchableOpacity>

                <View style={styles.buttonRow}>
                  <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonText}>Back</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => navigation.navigate('DuelsHistory')}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonText}>Match History</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {duels.phase === 'error' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>DUELS</Text>
                <Text style={styles.errorText}>{duels.error}</Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonText}>Back</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={duels.reset} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV4Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
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
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  phaseContainer: {
    alignItems: 'center',
    gap: 14,
    maxWidth: 420,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 32,
    color: '#FABC0F',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#d0d0d0',
    textAlign: 'center',
  },
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
  infoTextSmall: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#b8b8b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  waitingText: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#FABC0F',
    textAlign: 'center',
  },
  warningText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#ffc57b',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#ff8f8f',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    width: 180,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  buttonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
  },
});
