/**
 * DeathScreen - Run summary after player death
 * T047: Create DeathScreen in src/screens/DeathScreen.tsx (run summary, return to hub)
 * T051: Show "Purchase Runs" prompt if player has 0 runs after death
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
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
import { useProfile } from '../contexts/ProfileContext';
import { Typography } from '../theme/typography';
import { useInputMode } from '../hooks/useInputMode';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useAudio } from '../contexts/AudioContext';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { CANVAS_HEIGHT } from '../components/ScaledCanvas';
import { RunMode } from '../services/solana/types/gameplay_state';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.webp');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.webp');
const SKULL_ICON = require('../../assets/icons/ui/skull.webp');
const BUTTON_BG = require('../../assets/ui/buttons/button.webp');
const DEFEAT_IMAGE = require('../../assets/ui/text/defeat.webp');

type DeathScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Death'>;
  route: RouteProp<RootStackParamList, 'Death'>;
};

export function DeathScreen({ navigation, route }: DeathScreenProps) {
  const { totalMoves, level, week, phase, enemiesDefeated, killedBy, runMode } =
    route.params ?? {};
  const { availableRuns, mode } = useProfile();
  const { height: windowHeight } = useWindowDimensions();
  const isCompact = useScreenVariant() === 'compact';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const { playBgm, playSfx } = useAudio();

  const isOutOfRuns = mode !== 'guest' && availableRuns === 0;
  const [summarySize, setSummarySize] = useState({ width: 0, height: 0 });
  // Use vertical layout for taller screens (portrait or large tablets).
  // On the compact variant the app renders inside the 1240x1080 ScaledCanvas;
  // useWindowDimensions() reports the smaller real device size on the PSG1,
  // which would incorrectly pick the horizontal layout. Size against the
  // virtual canvas instead so the vertical layout activates.
  const effectiveHeight = isCompact ? CANVAS_HEIGHT : windowHeight;
  const isVerticalLayout = effectiveHeight > 768;

  useEffect(() => {
    playBgm('defeat', { crossfade: true });
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
  }, [fadeAnim, slideAnim, playBgm]);

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

  const formatEnemyName = (id: string): string =>
    id
      .split(/[_\-\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

  // Determine death cause description
  const getDeathCause = (): string => {
    if (killedBy) return formatEnemyName(killedBy);
    return 'Killed in combat';
  };

  const defeated = enemiesDefeated ?? 0;

  // Shared components
  const DeathHeader = () => (
    <>
      <View style={isVerticalLayout ? styles.iconContainerVertical : styles.iconContainer}>
        <Image
          source={SKULL_ICON}
          style={isVerticalLayout ? styles.skullIconVertical : styles.skullIcon}
          resizeMode="contain"
        />
      </View>
      <Image
        source={DEFEAT_IMAGE}
        style={isVerticalLayout ? styles.defeatImageVertical : styles.defeatImage}
        resizeMode="contain"
      />
      <Text style={isVerticalLayout ? styles.deathCauseVertical : styles.deathCause}>
        {getDeathCause()}
      </Text>
    </>
  );

  const StatFrame = ({ label, value }: { label: string; value: string | number }) => (
    <View style={isVerticalLayout ? styles.statItemVertical : styles.statItem}>
      <Text style={isVerticalLayout ? styles.statFrameValueVertical : styles.statFrameValue}>
        {value}
      </Text>
      <Text style={isVerticalLayout ? styles.statFrameLabelVertical : styles.statFrameLabel}>
        {label}
      </Text>
    </View>
  );

  const RunSummary = () => (
    <View
      style={isVerticalLayout ? styles.summaryContainerVertical : styles.summaryContainer}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSummarySize((prev) =>
          prev.width === Math.round(width) && prev.height === Math.round(height)
            ? prev
            : { width: Math.round(width), height: Math.round(height) }
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

      {mode === 'guest' ? (
        <>
          <View style={styles.statsRow}>
            <StatFrame label="Week" value={week ?? 1} />
            <StatFrame label="Phase" value={phase ?? 'Day 1'} />
          </View>
          <View style={styles.statsRowCentered}>
            <StatFrame label="Total Moves" value={totalMoves ?? 0} />
            <StatFrame label="Enemies Defeated" value={defeated} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.statsRow}>
            {runMode === RunMode.Gauntlet ? (
              <StatFrame label="Mode" value="Gauntlet" />
            ) : runMode === RunMode.Duel ? (
              <StatFrame label="Mode" value="Duels" />
            ) : (
              <StatFrame label="Level" value={level ?? 1} />
            )}
            <StatFrame label="Week" value={week ?? 1} />
            <StatFrame label="Phase" value={phase ?? 'Day 1'} />
          </View>
          <View style={styles.statsRowCentered}>
            <StatFrame label="Total Moves" value={totalMoves ?? 0} />
            <StatFrame label="Enemies Defeated" value={defeated} />
          </View>
        </>
      )}
    </View>
  );

  const OutOfRunsWarning = () =>
    isOutOfRuns ? (
      <View style={isVerticalLayout ? styles.warningContainerVertical : styles.warningContainer}>
        <Text style={isVerticalLayout ? styles.warningTextVertical : styles.warningText}>
          {isVerticalLayout ? 'You have no sessions remaining!' : 'No sessions remaining!'}
        </Text>
      </View>
    ) : null;

  const ReturnButton = () => (
    <View style={isVerticalLayout ? styles.buttonSlotVertical : styles.buttonSlot}>
      <Pressable style={styles.buttonPressable} onPress={handleReturnToHub}>
        <CachedImageBackground source={BUTTON_BG} style={styles.buttonImage} resizeMode="contain">
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
                <DeathHeader />
                <RunSummary />
                <OutOfRunsWarning />
                <ReturnButton />
              </>
            ) : (
              // Horizontal layout (landscape mobile): side-by-side
              <>
                <View style={styles.leftColumn}>
                  <DeathHeader />
                  <ReturnButton />
                </View>
                <View style={styles.rightColumn}>
                  <RunSummary />
                  <OutOfRunsWarning />
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
  mainContent: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#8B0000',
  },
  skullIcon: {
    width: 36,
    height: 36,
    tintColor: '#FF4444',
  },
  defeatImage: {
    width: 180,
    height: 80,
    marginBottom: 4,
    tintColor: '#CC4444',
  },
  deathCause: {
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
    marginBottom: 12,
    gap: 12,
  },
  statsRowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  statItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  statFrameLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#1A1A1A',
    marginTop: 2,
    textAlign: 'center',
  },
  statFrameValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  warningContainer: {
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#8B0000',
    alignItems: 'center',
    width: '100%',
  },
  warningText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FF6666',
    marginBottom: 8,
    textAlign: 'center',
  },
  purchaseButton: {
    backgroundColor: '#228B22',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#32CD32',
  },
  purchaseButtonText: {
    fontFamily: Typography.button,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonSlot: {
    width: '70%',
    aspectRatio: 3.2,
  },
  buttonSlotVertical: {
    width: '75%',
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
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#8B0000',
  },
  skullIconVertical: {
    width: 80,
    height: 80,
    tintColor: '#FF4444',
  },
  defeatImageVertical: {
    width: 300,
    height: 120,
    marginBottom: 12,
    tintColor: '#CC4444',
  },
  deathCauseVertical: {
    fontFamily: Typography.body,
    fontSize: 22,
    color: '#CCCCCC',
    marginBottom: 80,
    textAlign: 'center',
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
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
  },
  statFrameValueVertical: {
    fontFamily: Typography.number,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  statFrameLabelVertical: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#1A1A1A',
    marginTop: 2,
    textAlign: 'center',
  },
  warningContainerVertical: {
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#8B0000',
    alignItems: 'center',
    width: '100%',
  },
  warningTextVertical: {
    fontFamily: Typography.body,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6666',
    marginBottom: 12,
    textAlign: 'center',
  },
  purchaseButtonVertical: {
    backgroundColor: '#228B22',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#32CD32',
  },
  purchaseButtonTextVertical: {
    fontFamily: Typography.button,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
