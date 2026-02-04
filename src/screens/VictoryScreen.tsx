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
  useWindowDimensions,
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
  const { height } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [showUnlock, setShowUnlock] = useState(false);

  // Use vertical layout for taller screens (portrait or large tablets)
  const isVerticalLayout = height > 768;

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

  // Shared components
  const VictoryHeader = () => (
    <>
      <View style={isVerticalLayout ? styles.iconContainerVertical : styles.iconContainer}>
        <Text style={isVerticalLayout ? styles.victoryEmojiVertical : styles.victoryEmoji}>🏆</Text>
      </View>
      <Text style={isVerticalLayout ? styles.titleVertical : styles.title}>Victory!</Text>
      <Text style={isVerticalLayout ? styles.subtitleVertical : styles.subtitle}>
        Level {level ?? 1} Complete
      </Text>
    </>
  );

  const RunSummary = () => (
    <View style={isVerticalLayout ? styles.summaryContainerVertical : styles.summaryContainer}>
      <Text style={isVerticalLayout ? styles.summaryTitleVertical : styles.summaryTitle}>
        Run Summary
      </Text>

      {isVerticalLayout ? (
        // Vertical layout: row-based stats
        <>
          <View style={styles.statRowVertical}>
            <Text style={styles.statLabelVertical}>Level Completed</Text>
            <Text style={styles.statValueVertical}>{level ?? 1}</Text>
          </View>
          <View style={styles.statRowVertical}>
            <Text style={styles.statLabelVertical}>Total Moves</Text>
            <Text style={styles.statValueVertical}>{totalMoves ?? 0}</Text>
          </View>
          <View style={styles.statRowVertical}>
            <Text style={styles.statLabelVertical}>Final Combat Turns</Text>
            <Text style={styles.statValueVertical}>{turnsTaken}</Text>
          </View>
          <View style={styles.goldRowVertical}>
            <Image source={COIN_ICON} style={styles.coinIconVertical} resizeMode="contain" />
            <Text style={styles.goldValueVertical}>{goldEarned} gold earned</Text>
          </View>
        </>
      ) : (
        // Horizontal layout: grid-based stats
        <>
          {/* First row: Level, Moves, Turns */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{level ?? 1}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalMoves ?? 0}</Text>
              <Text style={styles.statLabel}>Moves</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{turnsTaken}</Text>
              <Text style={styles.statLabel}>Turns</Text>
            </View>
          </View>
          {/* Gold row */}
          <View style={styles.goldRow}>
            <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
            <Text style={styles.goldValue}>{goldEarned} gold</Text>
          </View>
        </>
      )}
    </View>
  );

  const UnlockDisplays = () => (
    <>
      {/* Level Unlock Display */}
      {showUnlock && levelUnlocked && (
        <Animated.View
          style={[
            isVerticalLayout ? styles.unlockContainerVertical : styles.unlockContainer,
            { opacity: glowAnim },
          ]}
        >
          <Text style={isVerticalLayout ? styles.unlockTitleVertical : styles.unlockTitle}>
            Level Unlocked!
          </Text>
          <View style={isVerticalLayout ? styles.unlockBadgeVertical : styles.unlockBadge}>
            <Text style={isVerticalLayout ? styles.unlockLevelVertical : styles.unlockLevel}>
              {levelUnlocked}
            </Text>
          </View>
          <Text style={isVerticalLayout ? styles.unlockTextVertical : styles.unlockText}>
            Level {levelUnlocked} is now available
          </Text>
        </Animated.View>
      )}

      {/* Item Unlock Display */}
      {showUnlock && itemUnlocked && (
        <Animated.View
          style={[
            isVerticalLayout ? styles.itemUnlockContainerVertical : styles.itemUnlockContainer,
            { opacity: glowAnim },
          ]}
        >
          <Text style={isVerticalLayout ? styles.unlockTitleVertical : styles.unlockTitle}>
            New Item Unlocked!
          </Text>
          <View style={isVerticalLayout ? styles.itemCardVertical : styles.itemCard}>
            <Text style={isVerticalLayout ? styles.itemEmojiVertical : styles.itemEmoji}>
              {itemUnlocked.emoji ?? '📦'}
            </Text>
            <Text style={isVerticalLayout ? styles.itemNameVertical : styles.itemName}>
              {itemUnlocked.name ?? 'Mystery Item'}
            </Text>
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
    </>
  );

  const ReturnButton = () => (
    <Pressable
      style={isVerticalLayout ? styles.returnButtonVertical : styles.returnButton}
      onPress={handleReturnToHub}
    >
      <Text style={isVerticalLayout ? styles.returnButtonTextVertical : styles.returnButtonText}>
        Return to Hub
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <Animated.View
            style={[
              isVerticalLayout ? styles.contentVertical : styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {isVerticalLayout ? (
              // Vertical layout (tall screens): stacked components
              <>
                <VictoryHeader />
                <RunSummary />
                <UnlockDisplays />
                <ReturnButton />
              </>
            ) : (
              // Horizontal layout (landscape mobile): side-by-side
              <>
                <View style={styles.leftColumn}>
                  <VictoryHeader />
                  <ReturnButton />
                </View>
                <View style={styles.rightColumn}>
                  <RunSummary />
                  <UnlockDisplays />
                </View>
              </>
            )}
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
    padding: 16,
  },

  // ==================== HORIZONTAL LAYOUT (Landscape Mobile) ====================
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 800,
    gap: 32,
  },
  leftColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    maxWidth: 280,
  },
  rightColumn: {
    flex: 1,
    maxWidth: 320,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  victoryEmoji: {
    fontSize: 32,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 20,
    textAlign: 'center',
  },
  summaryContainer: {
    backgroundColor: 'rgba(40, 40, 50, 0.9)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#444455',
  },
  summaryTitle: {
    fontFamily: Typography.header,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 60,
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(60, 60, 80, 0.5)',
    borderRadius: 8,
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#AAAAAA',
    marginTop: 2,
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  goldRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    gap: 6,
  },
  coinIcon: {
    width: 20,
    height: 20,
  },
  goldValue: {
    fontFamily: Typography.number,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  unlockContainer: {
    backgroundColor: 'rgba(50, 100, 50, 0.9)',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#44AA44',
    alignItems: 'center',
  },
  unlockTitle: {
    fontFamily: Typography.header,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#44FF44',
    marginBottom: 8,
  },
  unlockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#44AA44',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#66CC66',
  },
  unlockLevel: {
    fontFamily: Typography.number,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  unlockText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#AAFFAA',
  },
  itemUnlockContainer: {
    backgroundColor: 'rgba(80, 60, 100, 0.9)',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#8866AA',
    alignItems: 'center',
  },
  itemCard: {
    alignItems: 'center',
    padding: 8,
  },
  itemEmoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  itemName: {
    fontFamily: Typography.header,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  itemStats: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  itemStat: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#AADDFF',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  returnButton: {
    backgroundColor: '#4a6a4a',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6a8a6a',
  },
  returnButtonText: {
    fontFamily: Typography.button,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  // ==================== VERTICAL LAYOUT (Tall Screens / Portrait) ====================
  contentVertical: {
    alignItems: 'center',
    padding: 32,
    maxWidth: 400,
  },
  iconContainerVertical: {
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
  victoryEmojiVertical: {
    fontSize: 42,
  },
  titleVertical: {
    fontFamily: Typography.header,
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitleVertical: {
    fontFamily: Typography.body,
    fontSize: 20,
    color: '#CCCCCC',
    marginBottom: 24,
  },
  summaryContainerVertical: {
    backgroundColor: 'rgba(40, 40, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#444455',
  },
  summaryTitleVertical: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  statRowVertical: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333344',
  },
  statLabelVertical: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#AAAAAA',
  },
  statValueVertical: {
    fontFamily: Typography.number,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  goldRowVertical: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    gap: 8,
  },
  coinIconVertical: {
    width: 24,
    height: 24,
  },
  goldValueVertical: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  unlockContainerVertical: {
    backgroundColor: 'rgba(50, 100, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#44AA44',
    alignItems: 'center',
  },
  unlockTitleVertical: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#44FF44',
    marginBottom: 12,
  },
  unlockBadgeVertical: {
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
  unlockLevelVertical: {
    fontFamily: Typography.number,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  unlockTextVertical: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AAFFAA',
  },
  itemUnlockContainerVertical: {
    backgroundColor: 'rgba(80, 60, 100, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#8866AA',
    alignItems: 'center',
  },
  itemCardVertical: {
    alignItems: 'center',
    padding: 12,
  },
  itemEmojiVertical: {
    fontSize: 48,
    marginBottom: 8,
  },
  itemNameVertical: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  returnButtonVertical: {
    backgroundColor: '#4a6a4a',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6a8a6a',
  },
  returnButtonTextVertical: {
    fontFamily: Typography.button,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
