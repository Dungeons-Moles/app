import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Alert, Platform } from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { Typography } from '@/theme/typography';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { useProfile } from '../contexts/ProfileContext';
import { getSessionSetupPromise, clearSessionSetup } from '@/utils/sessionSetupSignal';
import { CachedImage as Image } from '../components/common/CachedImage';
import { preloadCriticalImages } from '@/utils/preloadCriticalImages';
import { GAME_PRELOAD_ASSETS } from '@/constants/criticalImages';
import { getUserErrorMessage } from '@/services/solana/errors';
import { usePreventBackNavigation } from '../hooks/usePreventBackNavigation';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.webp');
const MOLE_BONFIRE = require('../../assets/ui/illustrations/mole-bonfire.webp');
const PAPER_PINS = require('../../assets/ui/panels/paper-with-pins.webp');
const CAMPAIGN_TITLE = require('../../assets/ui/text/campaign.webp');
const GAUNTLET_TITLE = require('../../assets/ui/text/gauntlet.webp');
const DUELS_TITLE = require('../../assets/ui/text/duels.webp');

const SESSION_LOADING_IMAGES = [
  BACKGROUND_IMAGE,
  STAINS_BACKGROUND,
  MOLE_BONFIRE,
  PAPER_PINS,
  CAMPAIGN_TITLE,
  GAUNTLET_TITLE,
  DUELS_TITLE,
] as const;

const FLAVOR_TEXTS = [
  'Polishing pickaxe',
  'Preparing backpack',
  'Sharpening claws',
  'Consulting the map',
  'Feeding the moles',
  'Lighting torches',
  'Counting gold coins',
  'Checking for traps',
  'Stretching tunnel legs',
  'Packing emergency snacks',
  'Tuning the compass',
  'Waxing the minecart',
  'Rehearsing battle cries',
  'Dusting off armor',
  'Bribing the dungeon keeper',
];

type SessionLoadingScreenProps = {
  route: RouteProp<RootStackParamList, 'SessionLoading'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'SessionLoading'>;
};

export function SessionLoadingScreen({ route, navigation }: SessionLoadingScreenProps) {
  usePreventBackNavigation();
  const isCompact = useScreenVariant() === 'compact';
  const { mode: userProfileMode } = useProfile();

  const gameMode = route.params?.mode;
  const forceLogo = route.params?.forceLogo;
  const titleSource =
    userProfileMode === 'guest' && !forceLogo
      ? null
      : gameMode === 'campaign'
        ? CAMPAIGN_TITLE
        : gameMode === 'gauntlet'
          ? GAUNTLET_TITLE
          : gameMode === 'duel'
            ? DUELS_TITLE
            : null;

  const [dotCount, setDotCount] = useState(0);
  const [flavorIndex, setFlavorIndex] = useState(() =>
    Math.floor(Math.random() * FLAVOR_TEXTS.length)
  );
  const flavorOpacity = useRef(new Animated.Value(1)).current;

  const exitWithError = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`${title}\n\n${message}`);
      }
      navigation.goBack();
      return;
    }

    Alert.alert(title, message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
  };

  // Preload game assets in parallel with session setup so they're cached
  // when GameScreen mounts — no secondary loading overlay needed.
  // Initialized eagerly (not inside useEffect) so it's available immediately
  // when the session setup promise effect reads it in the same render cycle.
  const assetPreloadRef = useRef<Promise<void>>(preloadCriticalImages(GAME_PRELOAD_ASSETS));
  useEffect(() => {
    preloadCriticalImages(SESSION_LOADING_IMAGES);
  }, []);

  // Animated dots: cycle 0 → 1 → 2 → 3 → 0 every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Flavor text: cycle every 3s with fade
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(flavorOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setFlavorIndex((prev) => (prev + 1) % FLAVOR_TEXTS.length);
        Animated.timing(flavorOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [flavorOpacity]);

  // Await session setup with a safety timeout. Asset preloading runs in
  // parallel but must not block navigation — a slow/hung image fetch should
  // never produce a false "Session Timed Out" when on-chain setup succeeded.
  useEffect(() => {
    let cancelled = false;
    const promise = getSessionSetupPromise();
    if (!promise) {
      navigation.goBack();
      return;
    }

    const timeout = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        clearSessionSetup();
        exitWithError(
          'Session Timed Out',
          'The session took too long to set up. Please try again.'
        );
      }
    }, 60_000);

    // Session setup is the critical path; asset preload is best-effort.
    promise
      .then(async () => {
        // Give assets a brief window to finish, but don't block on them.
        await Promise.race([
          assetPreloadRef.current,
          new Promise<void>((r) => setTimeout(r, 3_000)),
        ]).catch(() => {});
        if (!cancelled) {
          cancelled = true;
          clearTimeout(timeout);
          clearSessionSetup();
          navigation.replace('Game');
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          cancelled = true;
          clearTimeout(timeout);
          clearSessionSetup();
          console.error('[SessionLoadingScreen] Session setup failed:', err.message, err);
          exitWithError('Session Failed', getUserErrorMessage(err));
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [navigation]);

  const dots = '.'.repeat(dotCount);

  return (
    <View style={styles.container}>
      <CachedImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
          {titleSource && (
            <View style={[styles.titleRow, isCompact && styles.titleRowCompact]}>
              <Image
                source={titleSource}
                style={[styles.titleImage, isCompact && styles.titleImageCompact]}
                resizeMode="contain"
              />
            </View>
          )}

          <View style={[styles.bonfireContainer, isCompact && styles.bonfireContainerCompact]}>
            <Image
              source={MOLE_BONFIRE}
              style={[styles.bonfireImage, isCompact && styles.bonfireImageCompact]}
              resizeMode="contain"
            />
            <View style={[styles.loadingContent, isCompact && styles.loadingContentCompact]}>
              <Text style={[styles.loadingText, { fontSize: isCompact ? 36 : 18 }]}>
                Loading{dots}
              </Text>
            </View>
          </View>

          <View style={[styles.paperPinsContainer, isCompact && styles.paperPinsContainerCompact]}>
            <Image source={PAPER_PINS} style={styles.paperPinsImage} resizeMode="stretch" />
            <View
              style={[
                styles.paperPinsTextContainer,
                isCompact && styles.paperPinsTextContainerCompact,
              ]}
            >
              <Animated.Text
                style={[
                  styles.flavorText,
                  { fontSize: isCompact ? 34 : 18, opacity: flavorOpacity },
                ]}
              >
                {FLAVOR_TEXTS[flavorIndex]}...
              </Animated.Text>
            </View>
          </View>
        </View>
      </CachedImageBackground>
    </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: -8,
  },
  titleRowCompact: {
    marginBottom: 40,
  },
  titleImage: {
    width: 220,
    height: 48,
  },
  titleImageCompact: {
    width: 510,
    height: 105,
    marginBottom: 12,
  },
  bonfireContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 250,
    height: 180,
    marginTop: 0,
  },
  bonfireContainerCompact: {
    width: 500,
    height: 360,
    marginTop: -40,
  },
  bonfireImage: {
    width: '100%',
    height: '100%',
  },
  bonfireImageCompact: {},
  loadingContent: {
    position: 'absolute',
    top: '20%',
    left: '5%',
    width: 140,
    alignItems: 'center',
  },
  loadingContentCompact: {
    width: 280,
  },
  loadingText: {
    fontFamily: Typography.header,
    color: '#3d2b1f',
    textAlign: 'center',
    minWidth: 140, // Keeps width steady
  },
  paperPinsContainer: {
    width: 380,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -10,
  },
  paperPinsContainerCompact: {
    width: 760,
    height: 240,
    marginTop: 20,
  },
  paperPinsImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  paperPinsTextContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  paperPinsTextContainerCompact: {
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  flavorText: {
    fontFamily: Typography.body,
    color: '#000000',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
