import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ImageBackground,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useMapGenerator, MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { Skeleton } from '../components/common/Skeleton';
import { ProfileCard } from '../components/profile/ProfileCard';
import type { CampaignLevel } from '../types/solana';

const backgroundImageSource = require('../../assets/hub/campaign-background.png');
const buttonV1Source = require('../../assets/hub/button-v1.png');
const buttonV4Source = require('../../assets/hub/button-v4.png');
const squareSource = require('../../assets/campaign/square.png');
const lockSource = require('../../assets/campaign/lock.png');

type CampaignSelectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CampaignSelect'>;
};

const NUM_COLUMNS = 5;

export function CampaignSelectScreen({ navigation }: CampaignSelectScreenProps) {
  const { profile, mode } = useProfile();
  const {
    startGame: startSessionOnChain,
    mapSeed,
    isLoading: sessionLoading,
    gameplayState,
  } = useSession();
  const { state: gameState, dispatch } = useGame();
  const {
    getCampaignLevels,
    fetchMapConfig: refreshConfig,
    isLoading: mapLoading,
    error: mapError,
  } = useMapGenerator();

  const [levels, setLevels] = useState<CampaignLevel[]>([]);
  const [isLoadingLevels, setIsLoadingLevels] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const isGuestMode = mode === 'guest';
  const isCachedMode = mode === 'cached';

  // Fetch campaign levels on mount
  useEffect(() => {
    async function loadLevels() {
      setIsLoadingLevels(true);

      // In guest mode, create basic unlocked levels without on-chain data
      if (isGuestMode) {
        const guestLevels: CampaignLevel[] = [];
        // In guest mode, only first 10 levels are unlocked for demo
        for (let level = 0; level <= MAX_CAMPAIGN_LEVEL; level++) {
          guestLevels.push({
            level,
            isUnlocked: level < 10, // Only first 10 levels in guest mode
            isCompleted: false,
            seed: null, // Will use random seed
          });
        }
        setLevels(guestLevels);
        setIsLoadingLevels(false);
        return;
      }

      const playerLevel = profile?.currentLevel ?? 0;
      const campaignLevels = await getCampaignLevels(playerLevel);
      setLevels(campaignLevels);
      setIsLoadingLevels(false);
    }
    loadLevels();
  }, [getCampaignLevels, profile?.currentLevel, isGuestMode]);

  const onRefresh = useCallback(async () => {
    if (isGuestMode || isCachedMode) {
      return;
    }
    setRefreshing(true);
    await refreshConfig();
    const playerLevel = profile?.currentLevel ?? 0;
    const campaignLevels = await getCampaignLevels(playerLevel);
    setLevels(campaignLevels);
    setRefreshing(false);
  }, [isGuestMode, isCachedMode, refreshConfig, getCampaignLevels, profile?.currentLevel]);

  const handleLevelSelect = useCallback(
    async (level: CampaignLevel) => {
      console.log('[CampaignSelect] handleLevelSelect called', {
        level: level.level,
        isUnlocked: level.isUnlocked,
        isStartingGame,
        isGuestMode,
        mode,
      });

      if (!level.isUnlocked || isStartingGame) {
        console.log('[CampaignSelect] Early return - locked or already starting');
        return;
      }

      setSelectedLevel(level.level);
      setIsStartingGame(true);

      try {
        let seed: number;
        let result;

        // In guest mode, skip on-chain session and use random seed
        if (isGuestMode) {
          console.log('[CampaignSelect] Guest mode - using random seed');
          seed = Math.floor(Math.random() * 2147483647);
        } else {
          console.log('[CampaignSelect] Online mode - calling startSessionOnChain...');
          // Start on-chain session for this level
          result = await startSessionOnChain(level.level);
          console.log('[CampaignSelect] startSessionOnChain result:', result);

          // Determine seed to use
          if (result.success && mapSeed !== null) {
            // Convert BigInt seed to a 32-bit number for the game engine
            seed = Number(mapSeed % BigInt(2147483647));
            console.log('[CampaignSelect] Using on-chain seed:', seed);
          } else if (level.seed !== null) {
            // Use the level's seed from getCampaignLevels
            seed = Number(level.seed % BigInt(2147483647));
            console.log('[CampaignSelect] Using level seed:', seed);
          } else {
            // Fallback to random seed if on-chain session fails
            seed = Math.floor(Math.random() * 2147483647);
            console.log('[CampaignSelect] Fallback to random seed:', seed);
            if (!result.success && result.error) {
              if (result.error === 'Session counter not initialized') {
                console.log(
                  '[CampaignSelect] Falling back to offline mode (Session counter missing)'
                );
              } else {
                console.warn('On-chain session start failed, using offline mode:', result.error);
              }
            }
          }
        }

        // Reset game state if needed
        if (gameState?.phase === GamePhase.Defeat || gameState?.phase === GamePhase.Victory) {
          dispatch({ type: 'RETURN_TO_MENU' });
        }

        // Use returned state if available (restored), otherwise fallback to context state
        // If result.gameState is present, it means we are reusing an existing session and fetched its state
        let stateToRestore = result?.gameState;
        let restorePayload = undefined;

        if (stateToRestore) {
          // Map ServiceGameState (flat) to EngineGameState (nested)
          // Note: On-chain state is partial compared to client state (missing inventory, tools)
          // We use 'any' cast here because we are merging partial player data,
          // and the reducer will merge this with the default initialized player.
          restorePayload = {
            player: {
              position: {
                x: stateToRestore.positionX,
                y: stateToRestore.positionY,
              },
              stats: {
                hp: stateToRestore.hp,
                maxHp: stateToRestore.maxHp,
                atk: stateToRestore.atk,
                arm: stateToRestore.arm,
                spd: stateToRestore.spd,
                dig: stateToRestore.dig,
                gold: 0,
              },
              baseStats: {
                hp: stateToRestore.maxHp,
                maxHp: stateToRestore.maxHp,
                atk: stateToRestore.atk,
                arm: stateToRestore.arm,
                spd: stateToRestore.spd,
                dig: stateToRestore.dig,
                gold: 0,
              },
            } as any,
          };
          console.log(
            '[CampaignSelect] Restoring state with position:',
            restorePayload.player.position
          );
        }

        // Start the game with the seed and potentially restored state
        dispatch({
          type: 'START_GAME',
          seed,
          restore: restorePayload,
        });

        // Navigate to the game screen
        console.log('[CampaignSelect] Navigating to Game screen...');
        navigation.navigate('Game');
      } catch (error) {
        console.error('[CampaignSelect] Error starting game:', error);
      } finally {
        setIsStartingGame(false);
        setSelectedLevel(null);
      }
    },
    [
      dispatch,
      navigation,
      gameState?.phase,
      startSessionOnChain,
      mapSeed,
      isStartingGame,
      isGuestMode,
    ]
  );

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderLevelItem = useCallback(
    ({ item }: { item: CampaignLevel }) => {
      const isSelected = selectedLevel === item.level;
      const isCurrentLevel = item.level === (profile?.currentLevel ?? 0);

      return (
        <TouchableOpacity
          style={styles.levelCell}
          onPress={() => handleLevelSelect(item)}
          disabled={!item.isUnlocked || isStartingGame}
          activeOpacity={item.isUnlocked ? 0.7 : 1}
        >
          <ImageBackground
            source={squareSource}
            style={styles.levelCellBackground}
            resizeMode="stretch"
          >
            {/* Dark overlay for locked levels */}
            {!item.isUnlocked && <View style={styles.lockedOverlay} />}

            {/* Completed overlay */}
            {item.isCompleted && <View style={styles.completedOverlay} />}

            {/* Current level border highlight */}
            {isCurrentLevel && <View style={styles.currentLevelBorder} />}

            {/* Selected state overlay */}
            {isSelected && <View style={styles.selectedOverlay} />}

            {/* Level number */}
            <Text
              style={[
                styles.levelNumber,
                item.isUnlocked ? styles.levelNumberUnlocked : styles.levelNumberLocked,
                item.isCompleted && styles.levelNumberCompleted,
                isCurrentLevel && styles.levelNumberCurrent,
              ]}
            >
              {item.level + 1}
            </Text>

            {/* Completed checkmark */}
            {item.isCompleted && <Text style={styles.checkmark}>&#10003;</Text>}

            {/* Lock icon for locked levels */}
            {!item.isUnlocked && (
              <Image source={lockSource} style={styles.lockIcon} resizeMode="contain" />
            )}

            {/* Loading indicator */}
            {isSelected && isStartingGame && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            )}
          </ImageBackground>
        </TouchableOpacity>
      );
    },
    [handleLevelSelect, isStartingGame, selectedLevel, profile?.currentLevel]
  );

  const keyExtractor = useCallback((item: CampaignLevel) => `level-${item.level}`, []);

  const isLoading = isLoadingLevels || mapLoading;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImageSource} style={styles.backgroundImage} resizeMode="stretch" />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
            <ImageBackground source={buttonV1Source} style={styles.backButton} resizeMode="stretch">
              <Text style={styles.backButtonText}>Back</Text>
            </ImageBackground>
          </TouchableOpacity>

          <ImageBackground source={buttonV4Source} style={styles.titlePanel} resizeMode="stretch">
            <Text style={styles.title}>Campaign</Text>
            <Text style={styles.subtitle}>
              {isGuestMode
                ? 'Guest Mode (1-10)'
                : isCachedMode
                  ? `Cached - Level ${(profile?.currentLevel ?? 0) + 1}`
                  : `Level ${(profile?.currentLevel ?? 0) + 1} / ${MAX_CAMPAIGN_LEVEL + 1}`}
            </Text>
          </ImageBackground>

          {/* Mode indicator */}
          {(isGuestMode || isCachedMode) && (
            <View style={styles.modeIndicator}>
              <Text style={styles.modeIndicatorText}>{isGuestMode ? 'GUEST' : 'OFFLINE'}</Text>
            </View>
          )}

          {!isGuestMode && !isCachedMode && <View style={styles.headerSpacer} />}
        </View>

        {/* Level Grid */}
        {isLoading ? (
          <View style={styles.gridContent}>
            <View style={styles.loadingGrid}>
              {Array.from({ length: 15 }).map((_, index) => (
                <View key={`skeleton-${index}`} style={styles.levelCellSkeleton}>
                  <Skeleton width="100%" height="100%" borderRadius={8} />
                </View>
              ))}
            </View>
            <Text style={styles.loadingText}>Loading levels...</Text>
          </View>
        ) : mapError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{mapError}</Text>
            <TouchableOpacity onPress={handleBack} style={styles.errorButton}>
              <Text style={styles.errorButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={levels}
            renderItem={renderLevelItem}
            keyExtractor={keyExtractor}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FABC0F" />
            }
          />
        )}
      </View>

      {profile && (
        <View style={styles.statsContainer}>
          <ProfileCard profile={profile} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6d5b8',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    marginBottom: 4,
  },
  titlePanel: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    height: 60,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 20,
  },
  subtitle: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#888888',
    marginBottom: 4,
  },
  headerSpacer: {
    width: 80,
  },
  statsContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
  },
  modeIndicator: {
    backgroundColor: 'rgba(163, 58, 58, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  modeIndicatorText: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#888888',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#a33a3a',
    textAlign: 'center',
  },
  errorButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3d2b1f',
    borderRadius: 8,
  },
  errorButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#ffffff',
  },
  gridContent: {
    paddingBottom: 24,
    alignItems: 'center',
  },
  levelCell: {
    width: 56,
    height: 56,
    margin: 6,
  },
  levelCellBackground: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  completedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 85, 34, 0.35)',
  },
  currentLevelBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: '#FABC0F',
    borderRadius: 4,
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 188, 15, 0.3)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelUnlocked: {
    backgroundColor: 'rgba(61, 43, 31, 0.8)',
    borderColor: '#5c4033',
  },
  levelLocked: {
    backgroundColor: 'rgba(40, 40, 40, 0.6)',
    borderColor: '#333333',
  },
  levelCompleted: {
    backgroundColor: 'rgba(34, 85, 34, 0.8)',
    borderColor: '#228B22',
  },
  levelCurrent: {
    borderColor: '#FABC0F',
    borderWidth: 3,
  },
  levelSelected: {
    backgroundColor: 'rgba(250, 188, 15, 0.3)',
  },
  levelNumber: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
  },
  levelNumberUnlocked: {
    color: '#c8c8c8',
  },
  levelNumberLocked: {
    color: '#555555',
  },
  levelNumberCompleted: {
    color: '#90EE90',
  },
  levelNumberCurrent: {
    color: '#FABC0F',
  },
  checkmark: {
    position: 'absolute',
    top: 2,
    right: 4,
    fontSize: 12,
    color: '#228B22',
  },
  lockIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    opacity: 0.8,
  },
  loadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    width: (56 + 12) * 5, // width of 5 columns
  },
  levelCellSkeleton: {
    width: 56,
    height: 56,
    margin: 6,
  },
});
