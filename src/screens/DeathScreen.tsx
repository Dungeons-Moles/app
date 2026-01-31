/**
 * DeathScreen - Run summary after player death
 * T047: Create DeathScreen in src/screens/DeathScreen.tsx (run summary, return to hub)
 * T051: Show "Purchase Runs" prompt if player has 0 runs after death
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Animated,
  Image,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { useProfile } from '../contexts/ProfileContext';
import { Typography } from '../theme/typography';
import type { CombatReplay } from '../services/solana/types/combat_events';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const SKULL_ICON = require('../../assets/icons/ui/skull.png');
const COIN_ICON = require('../../assets/icons/ui/coin.png');

type DeathScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Death'>;
  route: RouteProp<RootStackParamList, 'Death'>;
};

export function DeathScreen({ navigation, route }: DeathScreenProps) {
  const { replay, totalMoves, level, week, phase, killedBy } = route.params ?? {};
  const { availableRuns } = useProfile();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const isOutOfRuns = availableRuns === 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleReturnToHub = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Hub' }],
    });
  };

  // Determine death cause description
  const getDeathCause = (): string => {
    if (killedBy) return killedBy;
    if (replay?.isBoss) {
      return `Slain by Week ${replay.bossIntro?.week ?? '?'} Boss`;
    }
    return 'Killed in combat';
  };

  const goldEarned = replay?.combatEnded?.goldEarned ?? 0;
  const turnsTaken = replay?.combatEnded?.turnsTaken ?? 0;

  return (
    <View style={styles.container}>
      <ImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.darkOverlay}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Death Icon */}
            <View style={styles.iconContainer}>
              <Image source={SKULL_ICON} style={styles.skullIcon} resizeMode="contain" />
            </View>

            {/* Title */}
            <Text style={styles.title}>You Died</Text>

            {/* Death cause */}
            <Text style={styles.deathCause}>{getDeathCause()}</Text>

            {/* Run Summary */}
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>Run Summary</Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Level</Text>
                <Text style={styles.statValue}>{level ?? 1}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Week</Text>
                <Text style={styles.statValue}>{week ?? 1}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Phase</Text>
                <Text style={styles.statValue}>{phase ?? 'Day 1'}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total Moves</Text>
                <Text style={styles.statValue}>{totalMoves ?? 0}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Combat Turns</Text>
                <Text style={styles.statValue}>{turnsTaken}</Text>
              </View>

              <View style={styles.goldRow}>
                <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
                <Text style={styles.goldValue}>{goldEarned} gold earned</Text>
              </View>
            </View>

            {/* Out of Runs Warning */}
            {isOutOfRuns && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>You have no sessions remaining!</Text>
                <Pressable
                  style={styles.purchaseButton}
                  onPress={() => navigation.navigate('RunPurchase')}
                >
                  <Text style={styles.purchaseButtonText}>Purchase Sessions</Text>
                </Pressable>
              </View>
            )}

            {/* Return Button */}
            <Pressable style={styles.returnButton} onPress={handleReturnToHub}>
              <Text style={styles.returnButtonText}>Return to Hub</Text>
            </Pressable>
          </Animated.View>
        </View>
      </ImageBackground>
    </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 32,
    maxWidth: 400,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#8B0000',
  },
  skullIcon: {
    width: 48,
    height: 48,
    tintColor: '#FF4444',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FF4444',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  deathCause: {
    fontFamily: Typography.body,
    fontSize: 18,
    color: '#CCCCCC',
    marginBottom: 32,
    textAlign: 'center',
  },
  summaryContainer: {
    backgroundColor: 'rgba(40, 40, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#444455',
  },
  summaryTitle: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333344',
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#AAAAAA',
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  goldRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    gap: 8,
  },
  coinIcon: {
    width: 24,
    height: 24,
  },
  goldValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  warningContainer: {
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#8B0000',
    alignItems: 'center',
    width: '100%',
  },
  warningText: {
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6666',
    marginBottom: 12,
    textAlign: 'center',
  },
  purchaseButton: {
    backgroundColor: '#228B22',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#32CD32',
  },
  purchaseButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  returnButton: {
    backgroundColor: '#4a4a6a',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6a6a8a',
  },
  returnButtonText: {
    fontFamily: Typography.button,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
