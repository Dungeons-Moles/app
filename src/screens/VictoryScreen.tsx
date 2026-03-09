/**
 * VictoryScreen - Victory screen with level/item unlocks
 * T053: Create VictoryScreen in src/screens/VictoryScreen.tsx (level unlock, item unlock, return to hub)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useInputMode } from '../hooks/useInputMode';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useAudio } from '../contexts/AudioContext';
import { useProfile } from '../contexts/ProfileContext';
import { useScreenVariant } from '../contexts/ScreenVariantContext';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.webp');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.webp');
const BUTTON_GREEN = require('../../assets/ui/buttons/button-green.webp');
const VICTORY_IMAGE = require('../../assets/ui/text/victory.webp');
const TROPHY_ICON = require('../../assets/icons/ui/trophy.webp');

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
  const { playBgm, playSfx } = useAudio();
  const [showUnlock, setShowUnlock] = useState(false);
  const { mode } = useProfile();
  const isCompact = useScreenVariant() === 'compact';

  const isVerticalLayout = height > 768;
  const [summarySize, setSummarySize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    playBgm('victory', { crossfade: true });
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
  }, [fadeAnim, slideAnim, glowAnim, levelUnlocked, itemUnlocked, playBgm]);

  const handleReturnToHub = useCallback(() => {
    playSfx('ui_back');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Hub' }],
    });
  }, [navigation, playSfx]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';

  useControllerAction({ onA: handleReturnToHub, onB: handleReturnToHub }, isController);

  const controllerHints: ButtonHint[] = [
    { button: 'A', label: 'Return to Hub' },
    { button: 'B', label: 'Return to Hub' },
  ];

  const turnsTaken = replay?.combatEnded?.turnsTaken ?? 0;

  // Shared components
  const VictoryHeader = () => (
    <>
      <View style={isVerticalLayout ? styles.iconContainerVertical : styles.iconContainer}>
        <Image
          source={TROPHY_ICON}
          style={isVerticalLayout ? styles.trophyIconVertical : styles.trophyIcon}
          resizeMode="contain"
        />
      </View>
      <Image
        source={VICTORY_IMAGE}
        style={isVerticalLayout ? styles.victoryImageVertical : styles.victoryImage}
        resizeMode="contain"
      />
      <Text style={isVerticalLayout ? styles.subtitleVertical : styles.subtitle}>
        Level {level ?? 1} Complete
      </Text>
    </>
  );

  const StatFrame = ({ label, value }: { label: string; value: string | number }) => (
    <View style={isVerticalLayout ? styles.statItemVertical : styles.statItem}>
      <Text style={isVerticalLayout ? styles.statValueVertical : styles.statValue}>{value}</Text>
      <Text style={isVerticalLayout ? styles.statLabelVertical : styles.statLabel}>{label}</Text>
    </View>
  );

  const RunSummary = () => (
    <View
      style={isVerticalLayout ? styles.summaryContainerVertical : styles.summaryContainer}
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout;
        setSummarySize((prev) =>
          prev.width === Math.round(width) && prev.height === Math.round(h)
            ? prev
            : { width: Math.round(width), height: Math.round(h) }
        );
      }}
    >
      <Image
        source={PAPER_PANEL}
        style={
          Platform.OS === 'web'
            ? styles.summaryPanelBg
            : summarySize.width > 0
              ? {
                  position: 'absolute' as const,
                  width: summarySize.width * 1.2,
                  height: summarySize.height * 1.3,
                  left: -(summarySize.width * 0.1),
                  top: -(summarySize.height * 0.15),
                }
              : styles.summaryPanelBg
        }
        resizeMode="stretch"
      />
      <Text style={isVerticalLayout ? styles.summaryTitleVertical : styles.summaryTitle}>
        Run Summary
      </Text>

      <View style={styles.statsRow}>
        {mode !== 'guest' && <StatFrame label="Level" value={level ?? 1} />}
        <StatFrame label="Total Moves" value={totalMoves ?? 0} />
        <StatFrame label="Combat Turns" value={turnsTaken} />
      </View>
    </View>
  );

  const UnlockDisplays = () => {
    const hasLevel = showUnlock && levelUnlocked;
    const hasItem = showUnlock && itemUnlocked;
    if (!hasLevel && !hasItem) return null;

    return (
      <Animated.View
        style={[
          isVerticalLayout ? styles.unlocksRowVertical : styles.unlocksRow,
          { opacity: glowAnim },
        ]}
      >
        {/* Level Unlock Display */}
        {hasLevel && (
          <View
            style={isVerticalLayout ? styles.unlockContainerVertical : styles.unlockContainer}
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
          </View>
        )}

        {/* Item Unlock Display */}
        {hasItem && (
          <View
            style={isVerticalLayout ? styles.itemUnlockContainerVertical : styles.itemUnlockContainer}
          >
            <Text style={isVerticalLayout ? styles.unlockTitleVertical : styles.unlockTitle}>
              New Item Unlocked!
            </Text>
            <View style={isVerticalLayout ? styles.itemCardVertical : styles.itemCard}>
              {itemUnlocked.image ? (
                <Image
                  source={itemUnlocked.image}
                  style={isVerticalLayout ? styles.itemImageVertical : styles.itemImage}
                  resizeMode="contain"
                />
              ) : (
                <Text style={isVerticalLayout ? styles.itemEmojiVertical : styles.itemEmoji}>
                  {itemUnlocked.emoji ?? '📦'}
                </Text>
              )}
              <Text style={isVerticalLayout ? styles.itemNameVertical : styles.itemName}>
                {itemUnlocked.name ?? 'Mystery Item'}
              </Text>
            </View>
          </View>
        )}
      </Animated.View>
    );
  };

  const ReturnButton = () => (
    <View style={isVerticalLayout ? styles.buttonSlotVertical : styles.buttonSlot}>
      <Pressable style={styles.buttonPressable} onPress={handleReturnToHub}>
        <CachedImageBackground source={BUTTON_GREEN} style={styles.buttonImage} resizeMode="contain">
          <Text
            style={isVerticalLayout ? styles.returnButtonTextVertical : styles.returnButtonText}
          >
            Return to Hub
          </Text>
        </CachedImageBackground>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <CachedImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        {!isCompact && <View pointerEvents="none" style={styles.mobileBackgroundDim} />}
        <View style={styles.mainContent}>
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
      </CachedImageBackground>
      <ControllerHints hints={controllerHints} horizontal />
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
  stainsOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  mobileBackgroundDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  mainContent: {
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
    alignItems: 'center',
    justifyContent: 'center',
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
  trophyIcon: {
    width: 36,
    height: 36,
    tintColor: '#FFD700',
  },
  victoryImage: {
    width: 180,
    height: 80,
    marginBottom: 4,
    tintColor: '#44BB44',
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 20,
    textAlign: 'center',
  },
  summaryContainer: {
    padding: 16,
    width: '100%',
    marginBottom: 12,
    overflow: 'visible',
  },
  summaryPanelBg: {
    position: 'absolute',
    width: '120%',
    height: '130%',
    top: '-15%',
    left: '-10%',
  },
  summaryTitle: {
    fontFamily: Typography.header,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2A1A0A',
    marginBottom: 12,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  statItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#000000',
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#1A1A1A',
    marginTop: 2,
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  unlocksRow: {
    flexDirection: 'row',
    gap: 8,
    width: '140%',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  unlockContainer: {
    backgroundColor: 'rgba(50, 100, 50, 0.9)',
    borderRadius: 10,
    padding: 12,
    flex: 1,
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
    flex: 1,
    borderWidth: 2,
    borderColor: '#8866AA',
    alignItems: 'center',
  },
  itemCard: {
    alignItems: 'center',
    padding: 8,
  },
  itemImage: {
    width: 40,
    height: 40,
    marginBottom: 4,
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
  buttonSlot: {
    width: '70%',
    aspectRatio: 3.2,
  },
  buttonPressable: {
    width: '100%',
    height: '100%',
  },
  buttonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  returnButtonText: {
    fontFamily: Typography.button,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // ==================== VERTICAL LAYOUT (Tall Screens / Portrait) ====================
  contentVertical: {
    alignItems: 'center',
    padding: 32,
    maxWidth: 520,
    width: '100%',
  },
  iconContainerVertical: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  trophyIconVertical: {
    width: 80,
    height: 80,
    tintColor: '#FFD700',
  },
  victoryImageVertical: {
    width: 300,
    height: 120,
    marginBottom: 12,
    tintColor: '#44BB44',
  },
  subtitleVertical: {
    fontFamily: Typography.body,
    fontSize: 22,
    color: '#CCCCCC',
    marginBottom: 80,
  },
  summaryContainerVertical: {
    padding: 20,
    width: '100%',
    marginBottom: 80,
  },
  summaryTitleVertical: {
    fontFamily: Typography.header,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2A1A0A',
    marginBottom: 16,
    textAlign: 'center',
  },
  statItemVertical: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#000000',
  },
  statValueVertical: {
    fontFamily: Typography.number,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  statLabelVertical: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#1A1A1A',
    marginTop: 2,
  },
  unlocksRowVertical: {
    flexDirection: 'row',
    gap: 12,
    width: '130%',
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  unlockContainerVertical: {
    backgroundColor: 'rgba(50, 100, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    flex: 1,
    borderWidth: 2,
    borderColor: '#44AA44',
    alignItems: 'center',
  },
  unlockTitleVertical: {
    fontFamily: Typography.header,
    fontSize: 22,
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
    fontSize: 16,
    color: '#AAFFAA',
  },
  itemUnlockContainerVertical: {
    backgroundColor: 'rgba(80, 60, 100, 0.9)',
    borderRadius: 12,
    padding: 20,
    flex: 1,
    borderWidth: 2,
    borderColor: '#8866AA',
    alignItems: 'center',
  },
  itemCardVertical: {
    alignItems: 'center',
    padding: 12,
  },
  itemImageVertical: {
    width: 56,
    height: 56,
    marginBottom: 8,
  },
  itemEmojiVertical: {
    fontSize: 48,
    marginBottom: 8,
  },
  itemNameVertical: {
    fontFamily: Typography.header,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  buttonSlotVertical: {
    width: '75%',
    aspectRatio: 3.2,
  },
  returnButtonTextVertical: {
    fontFamily: Typography.button,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
