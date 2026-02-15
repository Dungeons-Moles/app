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
  useWindowDimensions,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { useProfile } from '../contexts/ProfileContext';
import { Typography } from '../theme/typography';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.png');
const SQUARE_FRAME = require('../../assets/ui/frames/square.png');
const SKULL_ICON = require('../../assets/icons/ui/skull.png');
const BUTTON_BG = require('../../assets/ui/buttons/button.png');
const DEFEAT_IMAGE = require('../../assets/ui/text/defeat.png');

type DeathScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Death'>;
  route: RouteProp<RootStackParamList, 'Death'>;
};

export function DeathScreen({ navigation, route }: DeathScreenProps) {
  const { replay, totalMoves, level, week, phase, combatTurns, killedBy } = route.params ?? {};
  const { availableRuns, mode } = useProfile();
  const { height } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const isOutOfRuns = mode !== 'guest' && availableRuns === 0;
  // Use vertical layout for taller screens (portrait or large tablets)
  const isVerticalLayout = height > 768;

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

  const turnsTaken = replay?.combatEnded?.turnsTaken ?? combatTurns ?? 0;

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
      <Image source={SQUARE_FRAME} style={styles.statFrameBg} resizeMode="stretch" />
      <Text style={isVerticalLayout ? styles.statFrameValueVertical : styles.statFrameValue}>
        {value}
      </Text>
      <Text style={isVerticalLayout ? styles.statFrameLabelVertical : styles.statFrameLabel}>
        {label}
      </Text>
    </View>
  );

  const RunSummary = () => (
    <View style={isVerticalLayout ? styles.summaryContainerVertical : styles.summaryContainer}>
      <Image
        source={PAPER_PANEL}
        style={styles.summaryPanelBg}
        resizeMode="stretch"
      />
      <Text style={isVerticalLayout ? styles.summaryTitleVertical : styles.summaryTitle}>
        Run Summary
      </Text>

      {isVerticalLayout ? (
        <>
          <View style={styles.statsRow}>
            <StatFrame label="Level" value={level ?? 1} />
            <StatFrame label="Week" value={week ?? 1} />
            <StatFrame label="Phase" value={phase ?? 'Day 1'} />
          </View>
          <View style={styles.statsRowCentered}>
            <StatFrame label="Total Moves" value={totalMoves ?? 0} />
            <StatFrame label="Combat Turns" value={turnsTaken} />
          </View>
        </>
      ) : (
        <>
          {/* First row: Level, Week, Phase */}
          <View style={styles.statsRow}>
            <StatFrame label="Level" value={level ?? 1} />
            <StatFrame label="Week" value={week ?? 1} />
            <StatFrame label="Phase" value={phase ?? 'Day 1'} />
          </View>
          {/* Second row: Moves, Turns (centered) */}
          <View style={styles.statsRowCentered}>
            <StatFrame label="Total Moves" value={totalMoves ?? 0} />
            <StatFrame label="Combat Turns" value={turnsTaken} />
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
        <ImageBackground
          source={BUTTON_BG}
          style={styles.buttonImage}
          resizeMode="contain"
        >
          <Text style={isVerticalLayout ? styles.returnButtonTextVertical : styles.returnButtonText}>
            Return to Hub
          </Text>
        </ImageBackground>
      </Pressable>
    </View>
  );


  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
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
  },
  summaryPanelBg: {
    position: 'absolute',
    width: '110%',
    height: '120%',
    top: '-10%',
    left: '-5%',
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
    marginBottom: 8,
    gap: 8,
  },
  statsRowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  statItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statFrameBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'stretch',
  },
  statFrameLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#1A1A1A',
    marginTop: 2,
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
  skullIconVertical: {
    width: 48,
    height: 48,
    tintColor: '#FF4444',
  },
  defeatImageVertical: {
    width: 240,
    height: 100,
    marginBottom: 8,
    tintColor: '#CC4444',
  },
  deathCauseVertical: {
    fontFamily: Typography.body,
    fontSize: 22,
    color: '#CCCCCC',
    marginBottom: 32,
    textAlign: 'center',
  },
  summaryContainerVertical: {
    padding: 20,
    width: '100%',
    marginBottom: 32,
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
