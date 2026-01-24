/**
 * VictoryScreen - Victory screen with level/item unlocks
 * T053: Create VictoryScreen in src/screens/VictoryScreen.tsx (level unlock, item unlock, return to hub)
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { Typography } from '../theme/typography';
import type { CombatReplay } from '../services/solana/types/combat_events';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const COIN_ICON = require('../../assets/icons/ui/coin.png');

type VictoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Victory'>;
  route: RouteProp<RootStackParamList, 'Victory'>;
};

export function VictoryScreen({ navigation, route }: VictoryScreenProps) {
  const { replay, level, totalMoves, levelUnlocked, itemUnlocked } = route.params ?? {};
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [showUnlock, setShowUnlock] = useState(false);

  useEffect(() => {
    // Initial fade in
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
    ]).start(() => {
      // Show unlock animation after initial animation
      if (levelUnlocked || itemUnlocked) {
        setTimeout(() => {
          setShowUnlock(true);
          Animated.loop(
            Animated.sequence([
              Animated.timing(glowAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(glowAnim, {
                toValue: 0.5,
                duration: 1000,
                useNativeDriver: true,
              }),
            ])
          ).start();
        }, 500);
      }
    });
  }, [fadeAnim, slideAnim, glowAnim, levelUnlocked, itemUnlocked]);

  const handleReturnToHub = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Hub' }],
    });
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
            {/* Victory Icon */}
            <View style={styles.iconContainer}>
              <Text style={styles.victoryEmoji}>🏆</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>Victory!</Text>
            <Text style={styles.subtitle}>Level {level ?? 1} Complete</Text>

            {/* Run Summary */}
            <View style={styles.summaryContainer}>
              <Text style={styles.summaryTitle}>Run Summary</Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Level Completed</Text>
                <Text style={styles.statValue}>{level ?? 1}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total Moves</Text>
                <Text style={styles.statValue}>{totalMoves ?? 0}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Final Combat Turns</Text>
                <Text style={styles.statValue}>{turnsTaken}</Text>
              </View>

              <View style={styles.goldRow}>
                <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
                <Text style={styles.goldValue}>{goldEarned} gold earned</Text>
              </View>
            </View>

            {/* Level Unlock Display */}
            {showUnlock && levelUnlocked && (
              <Animated.View
                style={[
                  styles.unlockContainer,
                  {
                    opacity: glowAnim,
                  },
                ]}
              >
                <Text style={styles.unlockTitle}>Level Unlocked!</Text>
                <View style={styles.unlockBadge}>
                  <Text style={styles.unlockLevel}>{levelUnlocked}</Text>
                </View>
                <Text style={styles.unlockText}>Level {levelUnlocked} is now available</Text>
              </Animated.View>
            )}

            {/* Item Unlock Display */}
            {showUnlock && itemUnlocked && (
              <Animated.View
                style={[
                  styles.itemUnlockContainer,
                  {
                    opacity: glowAnim,
                  },
                ]}
              >
                <Text style={styles.unlockTitle}>New Item Unlocked!</Text>
                <View style={styles.itemCard}>
                  <Text style={styles.itemEmoji}>{itemUnlocked.emoji ?? '📦'}</Text>
                  <Text style={styles.itemName}>{itemUnlocked.name ?? 'Mystery Item'}</Text>
                  {itemUnlocked.stats && (
                    <View style={styles.itemStats}>
                      {itemUnlocked.stats.atk && (
                        <Text style={styles.itemStat}>+{itemUnlocked.stats.atk} ATK</Text>
                      )}
                      {itemUnlocked.stats.arm && (
                        <Text style={styles.itemStat}>+{itemUnlocked.stats.arm} ARM</Text>
                      )}
                      {itemUnlocked.stats.spd && (
                        <Text style={styles.itemStat}>+{itemUnlocked.stats.spd} SPD</Text>
                      )}
                      {itemUnlocked.stats.dig && (
                        <Text style={styles.itemStat}>+{itemUnlocked.stats.dig} DIG</Text>
                      )}
                    </View>
                  )}
                </View>
              </Animated.View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  victoryEmoji: {
    fontSize: 42,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 20,
    color: '#CCCCCC',
    marginBottom: 24,
  },
  summaryContainer: {
    backgroundColor: 'rgba(40, 40, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
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
  unlockContainer: {
    backgroundColor: 'rgba(50, 100, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#44AA44',
    alignItems: 'center',
  },
  unlockTitle: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#44FF44',
    marginBottom: 12,
  },
  unlockBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#44AA44',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#66CC66',
  },
  unlockLevel: {
    fontFamily: Typography.number,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  unlockText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AAFFAA',
  },
  itemUnlockContainer: {
    backgroundColor: 'rgba(80, 60, 100, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#8866AA',
    alignItems: 'center',
  },
  itemCard: {
    alignItems: 'center',
    padding: 12,
  },
  itemEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  itemName: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  itemStats: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  itemStat: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#AADDFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  returnButton: {
    backgroundColor: '#4a6a4a',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6a8a6a',
  },
  returnButtonText: {
    fontFamily: Typography.button,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
