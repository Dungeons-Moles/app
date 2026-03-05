import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useWallet } from '../contexts/WalletContext';
import { useProfile } from '../contexts/ProfileContext';
import { useScreenVariant } from '../contexts/ScreenVariantContext';

// All images to prefetch during loading — grouped by screen
const PREFETCH_IMAGES = [
  // Backgrounds
  require('../../assets/ui/backgrounds/hub-background-compact.webp'),
  require('../../assets/ui/backgrounds/hub-background-wide.webp'),
  require('../../assets/ui/backgrounds/account-background-compact.webp'),
  require('../../assets/ui/backgrounds/account-background-wide.webp'),
  require('../../assets/ui/backgrounds/book-compact.webp'),
  require('../../assets/ui/backgrounds/book-wide.webp'),
  require('../../assets/ui/backgrounds/campaign-background-compact.webp'),
  require('../../assets/ui/backgrounds/campaign-background-wide.webp'),
  require('../../assets/ui/backgrounds/combat-background.webp'),
  require('../../assets/ui/backgrounds/loading-background.webp'),
  // Panels
  require('../../assets/ui/panels/paper-panel.webp'),
  require('../../assets/ui/panels/wooden-panel.webp'),
  require('../../assets/ui/panels/sidebar.webp'),
  // Map tiles
  require('../../assets/world/tiles/floor-v1.webp'),
  require('../../assets/world/tiles/floor-v2.webp'),
  require('../../assets/world/tiles/floor-v3.webp'),
  require('../../assets/world/tiles/floor-v4.webp'),
  require('../../assets/world/tiles/floor-v5.webp'),
  require('../../assets/world/tiles/rock-v1.webp'),
  require('../../assets/world/tiles/rock-v2.webp'),
  require('../../assets/world/tiles/rock-v3.webp'),
  require('../../assets/world/tiles/rock-v4.webp'),
  require('../../assets/world/markers/question-mark.webp'),
  // POIs
  require('../../assets/world/pois/mole-den.webp'),
  require('../../assets/world/pois/supply-cache.webp'),
  require('../../assets/world/pois/tool-crate.webp'),
  require('../../assets/world/pois/tool-oil-rack.webp'),
  require('../../assets/world/pois/rest-alcove.webp'),
  require('../../assets/world/pois/survey-beacon.webp'),
  require('../../assets/world/pois/seismic-scanner.webp'),
  require('../../assets/world/pois/rail-waypoint.webp'),
  require('../../assets/world/pois/smuggler-hatch.webp'),
  require('../../assets/world/pois/rusty-anvil.webp'),
  require('../../assets/world/pois/rune-kiln.webp'),
  require('../../assets/world/pois/geode-vault.webp'),
  require('../../assets/world/pois/counter-cache.webp'),
  require('../../assets/world/pois/scrap-chute.webp'),
  // Field enemies
  require('../../assets/entities/enemies/field/tunnel-rat.webp'),
  require('../../assets/entities/enemies/field/cave-bat.webp'),
  require('../../assets/entities/enemies/field/spore-slime.webp'),
  require('../../assets/entities/enemies/field/rust-mite-swarm.webp'),
  require('../../assets/entities/enemies/field/collapsed-miner.webp'),
  require('../../assets/entities/enemies/field/shard-beetle.webp'),
  require('../../assets/entities/enemies/field/tunnel-warden.webp'),
  require('../../assets/entities/enemies/field/burrow-ambusher.webp'),
  require('../../assets/entities/enemies/field/frost-wisp.webp'),
  require('../../assets/entities/enemies/field/powder-tick.webp'),
  require('../../assets/entities/enemies/field/coin-slug.webp'),
  require('../../assets/entities/enemies/field/blood-mosquito.webp'),
  // Characters
  require('../../assets/entities/characters/default-mole.webp'),
  // Combat UI
  require('../../assets/ui/frames/square.webp'),
  require('../../assets/icons/stats/ATK.webp'),
  require('../../assets/icons/stats/speed.webp'),
  require('../../assets/icons/stats/DIG.webp'),
  require('../../assets/icons/stats/HP.webp'),
  require('../../assets/icons/stats/ARM.webp'),
  require('../../assets/icons/ui/coin.webp'),
  // Buttons
  require('../../assets/ui/buttons/button-v1.webp'),
  require('../../assets/ui/buttons/button-v2.webp'),
  require('../../assets/ui/buttons/button-v3.webp'),
  require('../../assets/ui/buttons/button-v4.webp'),
];

type LoadingScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Loading'>;
};

export function LoadingScreen({ navigation }: LoadingScreenProps) {
  const { wallet, isRestoringConnection } = useWallet();
  const { profile, isInitialLoadComplete } = useProfile();
  const isCompact = useScreenVariant() === 'compact';
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [hasNavigated, setHasNavigated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);

  const backgroundImage = require('../../assets/ui/backgrounds/loading-background.webp');

  // Pulsing animation for logo and bar
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Progress bar animation
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  // Prefetch all critical images into expo-image cache
  useEffect(() => {
    Image.prefetch(PREFETCH_IMAGES).then(() => {
      setImagesReady(true);
    }).catch(() => {
      // If prefetch fails, don't block — just proceed
      setImagesReady(true);
    });
  }, []);

  // Wait for wallet restoration + profile load, or timeout
  useEffect(() => {
    if (!isRestoringConnection && isInitialLoadComplete) {
      setIsReady(true);
      return;
    }

    const fallback = setTimeout(() => {
      setIsReady(true);
    }, 3000);

    return () => clearTimeout(fallback);
  }, [isRestoringConnection, isInitialLoadComplete]);

  // Navigate once ready AND images are prefetched (min 2s display)
  useEffect(() => {
    if (!isReady || !imagesReady || hasNavigated) return;

    // Minimum 2s display ensures images have time to cache
    const timer = setTimeout(() => {
      setHasNavigated(true);
      if (wallet.isConnected && profile) {
        navigation.replace('Hub');
      } else {
        navigation.replace('Account');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isReady, imagesReady, hasNavigated, wallet.isConnected, profile, navigation]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Image source={backgroundImage} style={styles.backgroundImage} contentFit="fill" />
      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, isCompact && { width: '80%', maxWidth: 600 }, { opacity: pulseAnim }]}>
          <Image
            source={require('../../assets/branding/logo.webp')}
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.loadingBarContainer, isCompact && { width: '65%', maxWidth: 450 }, { opacity: pulseAnim }]}>
          <View style={[styles.loadingBarBackground, isCompact && { height: 12 }]}>
            <Animated.View style={[styles.loadingBarFill, { width: progressWidth }]} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0DD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  logoContainer: {
    width: '60%',
    maxWidth: 400,
    aspectRatio: 2,
    marginBottom: 40,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  loadingBarContainer: {
    width: '50%',
    maxWidth: 300,
  },
  loadingBarBackground: {
    height: 8,
    backgroundColor: '#d4cfb3',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#b8b299',
  },
  loadingBarFill: {
    height: '100%',
    backgroundColor: '#8b7355',
    borderRadius: 3,
  },
});
