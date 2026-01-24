import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useWallet } from '../contexts/WalletContext';
import { useProfile } from '../contexts/ProfileContext';

type LoadingScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Loading'>;
};

export function LoadingScreen({ navigation }: LoadingScreenProps) {
  const { wallet } = useWallet();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [hasNavigated, setHasNavigated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const backgroundImage = require('../../assets/ui/backgrounds/loading-background.png');

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
      duration: 2000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  // Wait for initial load or timeout
  useEffect(() => {
    // If profile is not loading, we're ready
    if (!isProfileLoading) {
      setIsReady(true);
      return;
    }

    // Fallback: after 3 seconds, consider ready regardless
    const fallback = setTimeout(() => {
      setIsReady(true);
    }, 3000);

    return () => clearTimeout(fallback);
  }, [isProfileLoading]);

  // Navigate once ready
  useEffect(() => {
    if (!isReady || hasNavigated) return;

    // Minimum display time for smooth UX
    const timer = setTimeout(() => {
      setHasNavigated(true);
      if (wallet.isConnected && profile) {
        navigation.replace('Hub');
      } else {
        navigation.replace('Account');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isReady, hasNavigated, wallet.isConnected, profile, navigation]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Image source={backgroundImage} style={styles.backgroundImage} resizeMode="stretch" />
      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, { opacity: pulseAnim }]}>
          <Image
            source={require('../../assets/branding/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.loadingBarContainer, { opacity: pulseAnim }]}>
          <View style={styles.loadingBarBackground}>
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
