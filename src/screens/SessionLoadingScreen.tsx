import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Text, StyleSheet, ImageBackground, Animated, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Typography } from '@/theme/typography';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { getSessionSetupPromise, clearSessionSetup } from '@/utils/sessionSetupSignal';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');

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
  navigation: NativeStackNavigationProp<RootStackParamList, 'SessionLoading'>;
};

export function SessionLoadingScreen({ navigation }: SessionLoadingScreenProps) {
  const isCompact = useScreenVariant() === 'compact';
  const [dotCount, setDotCount] = useState(0);
  const [flavorIndex, setFlavorIndex] = useState(() => Math.floor(Math.random() * FLAVOR_TEXTS.length));
  const flavorOpacity = useRef(new Animated.Value(1)).current;

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

  // Await the session setup promise with a safety timeout
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
        Alert.alert('Session Timed Out', 'The session took too long to set up. Please try again.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    }, 60_000);

    promise
      .then(() => {
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
          Alert.alert('Session Failed', err.message, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [navigation]);

  const dots = '.'.repeat(dotCount);
  const scale = isCompact ? 2 : 1;

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
          <Text style={[styles.loadingText, { fontSize: 32 * scale }]}>
            Loading{dots}
          </Text>
          <Animated.Text
            style={[
              styles.flavorText,
              { fontSize: 16 * scale, opacity: flavorOpacity },
            ]}
          >
            {FLAVOR_TEXTS[flavorIndex]}...
          </Animated.Text>
        </View>
      </ImageBackground>
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
    gap: 16,
  },
  loadingText: {
    fontFamily: Typography.header,
    color: '#3d2b1f',
    textAlign: 'center',
    // Fixed width to prevent layout jumps from dot count changes
    minWidth: 250,
  },
  flavorText: {
    fontFamily: Typography.body,
    color: '#3d2b1f',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
