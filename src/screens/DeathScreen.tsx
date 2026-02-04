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
import type { CombatReplay } from '../services/solana/types/combat_events';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const SKULL_ICON = require('../../assets/icons/ui/skull.png');

type DeathScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Death'>;
  route: RouteProp<RootStackParamList, 'Death'>;
};

export function DeathScreen({ navigation, route }: DeathScreenProps) {
  const { replay, totalMoves, level, week, phase, killedBy } = route.params ?? {};
  const { availableRuns } = useProfile();
  const { height } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const isOutOfRuns = availableRuns === 0;
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

  const turnsTaken = replay?.combatEnded?.turnsTaken ?? 0;

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
      <Text style={isVerticalLayout ? styles.titleVertical : styles.title}>You Died</Text>
      <Text style={isVerticalLayout ? styles.deathCauseVertical : styles.deathCause}>
        {getDeathCause()}
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
          <View style={styles.statRow}>
            <Text style={styles.statLabelVertical}>Level</Text>
            <Text style={styles.statValueVertical}>{level ?? 1}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabelVertical}>Week</Text>
            <Text style={styles.statValueVertical}>{week ?? 1}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabelVertical}>Phase</Text>
            <Text style={styles.statValueVertical}>{phase ?? 'Day 1'}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabelVertical}>Total Moves</Text>
            <Text style={styles.statValueVertical}>{totalMoves ?? 0}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabelVertical}>Combat Turns</Text>
            <Text style={styles.statValueVertical}>{turnsTaken}</Text>
          </View>
        </>
      ) : (
        // Horizontal layout: grid-based stats
        <>
          {/* First row: Level, Week, Phase */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{level ?? 1}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{week ?? 1}</Text>
              <Text style={styles.statLabel}>Week</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{phase ?? 'Day 1'}</Text>
              <Text style={styles.statLabel}>Phase</Text>
            </View>
          </View>
          {/* Second row: Moves, Turns (centered) */}
          <View style={styles.statsRowCentered}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalMoves ?? 0}</Text>
              <Text style={styles.statLabel}>Total Moves</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{turnsTaken}</Text>
              <Text style={styles.statLabel}>Combat Turns</Text>
            </View>
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
        <Pressable
          style={isVerticalLayout ? styles.purchaseButtonVertical : styles.purchaseButton}
          onPress={() => navigation.navigate('RunPurchase')}
        >
          <Text
            style={isVerticalLayout ? styles.purchaseButtonTextVertical : styles.purchaseButtonText}
          >
            Purchase Sessions
          </Text>
        </Pressable>
      </View>
    ) : null;

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
  darkOverlay: {
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
  title: {
    fontFamily: Typography.header,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF4444',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  deathCause: {
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
  statsRowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
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
  returnButton: {
    backgroundColor: '#4a4a6a',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6a6a8a',
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
  titleVertical: {
    fontFamily: Typography.header,
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FF4444',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  deathCauseVertical: {
    fontFamily: Typography.body,
    fontSize: 18,
    color: '#CCCCCC',
    marginBottom: 32,
    textAlign: 'center',
  },
  summaryContainerVertical: {
    backgroundColor: 'rgba(40, 40, 50, 0.9)',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 32,
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
  statRow: {
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
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  returnButtonVertical: {
    backgroundColor: '#4a4a6a',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6a6a8a',
  },
  returnButtonTextVertical: {
    fontFamily: Typography.button,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
