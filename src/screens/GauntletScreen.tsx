import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Image,
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
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { useSession } from '@/contexts/SessionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { deriveGauntletSessionPda } from '@/services/solana/constants';
import { GAUNTLET_ENTRY_LAMPORTS } from '@/services/solana/gauntlet';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const GAUNTLET_TITLE = require('../../assets/ui/text/gauntlet.png');
const PVP_MODES_PANEL = require('../../assets/ui/panels/pvp-modes-panel.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV2Source = require('../../assets/ui/buttons/button-v2.png');
const SOL_PILE = require('../../assets/ui/illustrations/sol-pile.png');
const CHEST = require('../../assets/ui/illustrations/chest.png');
const ECHO_FIGHT = require('../../assets/ui/illustrations/echo-fight.png');

type GauntletScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Gauntlet'>;
};

export function GauntletScreen({ navigation }: GauntletScreenProps) {
  const gauntlet = useGauntlet();
  const { activeSessions } = useSession();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isCompact = useScreenVariant() === 'compact';
  const [hasExistingGauntletSessionOnChain, setHasExistingGauntletSessionOnChain] = useState(false);

  const gauntletPdaBase58 = useMemo(() => {
    if (!wallet.publicKey) return null;
    const [pda] = deriveGauntletSessionPda(wallet.publicKey);
    return pda.toBase58();
  }, [wallet.publicKey]);

  const hasExistingGauntletSessionInList = activeSessions.some(
    (session) => session.sessionPda === gauntletPdaBase58
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
        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey);
        const account = await connection.getAccountInfo(gauntletPda);
        if (!cancelled) setHasExistingGauntletSessionOnChain(account !== null);
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
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, isCompact && compactStyles.header]}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={[styles.headerButton, isCompact && compactStyles.headerButton]}
                resizeMode="stretch"
              >
                <Text
                  style={[styles.headerButtonText, isCompact && compactStyles.headerButtonText]}
                >
                  Back
                </Text>
              </ImageBackground>
            </TouchableOpacity>

            <View style={styles.headerSpacer} />

            <TouchableOpacity
              onPress={() => navigation.navigate('GauntletRanking')}
              activeOpacity={0.7}
            >
              <ImageBackground
                source={buttonV2Source}
                style={[styles.headerButton, isCompact && compactStyles.headerButton]}
                resizeMode="stretch"
              >
                <Text
                  style={[styles.headerButtonText, isCompact && compactStyles.headerButtonText]}
                >
                  Ranking
                </Text>
              </ImageBackground>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleRow}>
            <Image
              source={GAUNTLET_TITLE}
              style={[styles.titleImage, isCompact && compactStyles.titleImage]}
              resizeMode="contain"
            />
          </View>

          {/* Panel with all content overlaid */}
          <View style={styles.centerContent}>
            <View style={[styles.panelWrapper, isCompact && compactStyles.panelWrapper]}>
              <Image
                source={PVP_MODES_PANEL}
                style={styles.pvpModesPanel}
                resizeMode="contain"
              />
              <View
                style={[styles.panelOverlay, isCompact && compactStyles.panelOverlay]}
              >
                <View style={[styles.panelRow, styles.panelRowFee, isCompact && compactStyles.panelRowFee]}>
                  <Text style={[styles.panelTextFee, isCompact && compactStyles.panelText]}>
                    Entry fee: {entryFeeSol} SOL
                  </Text>
                  <Image source={SOL_PILE} style={[styles.panelIcon, isCompact && compactStyles.panelIcon]} resizeMode="contain" />
                </View>
                <View style={[styles.panelRow, styles.panelRowPrizes, isCompact && compactStyles.panelRowPrizes]}>
                  <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                    Compete for{'\n'}weekly prizes
                  </Text>
                  <Image source={CHEST} style={[styles.panelIcon, isCompact && compactStyles.panelIcon]} resizeMode="contain" />
                </View>
                <View style={[styles.panelRow, styles.panelRowEcho, isCompact && compactStyles.panelRowEcho]}>
                  <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                    At each week end,{'\n'}fight an echo build
                  </Text>
                  <Image source={ECHO_FIGHT} style={[styles.panelIcon, isCompact && compactStyles.panelIcon]} resizeMode="contain" />
                </View>

                <View
                  style={[styles.panelButtons, isCompact && compactStyles.panelButtons]}
                >
                  <TouchableOpacity
                    onPress={() => navigation.navigate('GauntletHistory')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.panelButtonText,
                        isCompact && compactStyles.panelButtonText,
                      ]}
                    >
                      History
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleEnter}
                    activeOpacity={0.7}
                    disabled={gauntlet.isLoading}
                  >
                    {gauntlet.isLoading ? (
                      <ActivityIndicator color="#3d2b1f" size="small" />
                    ) : (
                      <Text
                        style={[
                          styles.panelButtonText,
                          isCompact && compactStyles.panelButtonText,
                        ]}
                      >
                        {hasExistingGauntletSession ? 'Resume Session' : 'Enter Gauntlet'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  stainsOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  headerSpacer: { flex: 1 },
  headerButton: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  titleRow: {
    alignItems: 'center',
  },
  titleImage: {
    width: 280,
    height: 70,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelWrapper: {
    width: '75%',
    maxWidth: 300,
    aspectRatio: 1.2,
  },
  pvpModesPanel: {
    width: '100%',
    height: '100%',
  },
  panelOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelRowFee: {
    alignSelf: 'flex-start',
    marginLeft: 30,
    marginTop: 9,
  },
  panelRowPrizes: {
    alignSelf: 'flex-end',
    marginRight: 42,
    marginTop: 8,
  },
  panelRowEcho: {
    alignSelf: 'flex-start',
    marginLeft: 34,
    marginTop: 9,
  },
  panelTextFee: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#3d2b1f',
    fontWeight: 'bold',
  },
  panelTextBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#3d2b1f',
  },
  panelIcon: {
    width: 40,
    height: 40,
  },
  panelButtons: {
    flexDirection: 'row',
    gap: 62,
    marginTop: 53,
    marginLeft: 32,
  },
  panelButtonText: {
    fontFamily: Typography.button,
    fontWeight: 'bold',
    fontSize: 18,
    color: '#3d2b1f',
  },
});

const compactStyles = StyleSheet.create({
  header: {
    marginTop: 12,
  },
  headerButton: {
    width: 140,
    height: 76,
  },
  headerButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titleImage: {
    width: 520,
    height: 130,
    marginBottom: 20,
  },
  panelWrapper: {
    width: '95%',
    maxWidth: 900,
    aspectRatio: 1.2,
  },
  panelOverlay: {
    padding: 0,
  },
  panelRowFee: {
    marginTop: 52,
    marginLeft: 140,
    gap: 12,
  },
  panelRowPrizes: {
    marginTop: -20,
    marginRight: 112,
    gap: 72,
  },
  panelRowEcho: {
    marginTop: -18,
    marginLeft: 150,
    gap: 72,
  },
  panelText: {
    fontSize: 36,
  },
  panelIcon: {
    width: 162,
    height: 162,
  },
  panelButtons: {
    marginTop: 150,
    marginLeft: 146,
    gap: 190,
  },
  panelButtonText: {
    fontSize: 52,
  },
});
