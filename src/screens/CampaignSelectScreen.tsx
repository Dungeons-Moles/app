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
  Modal,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PublicKey } from '@solana/web3.js';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { useMapGenerator, MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { Skeleton } from '../components/common/Skeleton';
import { ProfileCard } from '../components/profile/ProfileCard';
import { createGameplayStateProgram } from '../services/solana/programs';
import { fetchGameState, getGameStatePda } from '../services/solana/gameplayState';
import { promptTransactionRetry } from '../utils/transaction-alerts';
import type { CampaignLevel } from '../types/solana';
import type { GameState as OnChainGameState } from '../services/solana/types/gameplay_state';

const backgroundImageSource = require('../../assets/ui/backgrounds/campaign-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const squareSource = require('../../assets/ui/frames/square.png');
const lockSource = require('../../assets/icons/ui/lock.png');

type CampaignSelectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CampaignSelect'>;
};

const NUM_COLUMNS = 5;

export function CampaignSelectScreen({ navigation }: CampaignSelectScreenProps) {
  const { profile, mode, availableRuns, highestLevelUnlocked } = useProfile();
  const { connection } = useSolanaConnection();
  const {
    startGame: startSessionOnChain,
    mapSeed,
    hasSessionForLevel,
    activeSessions,
    switchToSession,
    getSessionPdaForLevel,
    getMapSeedForLevel,
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
  const [showNoRunsModal, setShowNoRunsModal] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [showSessionExistsModal, setShowSessionExistsModal] = useState(false);
  const [attemptedLevel, setAttemptedLevel] = useState<number | null>(null);
  const [pendingLevelWithSession, setPendingLevelWithSession] = useState<CampaignLevel | null>(
    null
  );
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

  const createRestorePayload = useCallback((stateToRestore?: OnChainGameState | null) => {
    if (!stateToRestore) {
      return undefined;
    }

    return {
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
  }, []);

  const resumeSession = useCallback(
    async (level: CampaignLevel) => {
      setIsStartingGame(true);
      setSelectedLevel(level.level);

      try {
        let shouldRetry = true;

        while (shouldRetry) {
          shouldRetry = false;

          try {
            const sessionPda = await getSessionPdaForLevel(level.level);
            if (!sessionPda) {
              Alert.alert('Session Not Found', 'No active session was found for this level.');
              return;
            }

            const switchResult = await switchToSession(sessionPda);
            if (!switchResult.success) {
              Alert.alert(
                'Unable to Resume',
                switchResult.error ?? 'Failed to switch to the selected session.'
              );
              return;
            }

            const seedFromChain = await getMapSeedForLevel(level.level);
            let seed: number;

            if (seedFromChain !== null) {
              seed = Number(seedFromChain % BigInt(2147483647));
            } else if (level.seed !== null) {
              seed = Number(level.seed % BigInt(2147483647));
            } else {
              seed = Math.floor(Math.random() * 2147483647);
            }

            let stateToRestore: OnChainGameState | null = null;
            if (connection) {
              const program = createGameplayStateProgram(connection);
              const [gameStatePda] = getGameStatePda(new PublicKey(sessionPda));
              stateToRestore = await fetchGameState(program, gameStatePda);
            }

            const restorePayload = createRestorePayload(stateToRestore);

            dispatch({
              type: 'START_GAME',
              seed,
              restore: restorePayload,
            });

            navigation.navigate('Game');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Failed to resume the session.';
            shouldRetry = await promptTransactionRetry({
              title: 'Resume Failed',
              message,
            });
          }
        }
      } finally {
        setIsStartingGame(false);
        setSelectedLevel(null);
        setPendingLevelWithSession(null);
      }
    },
    [
      connection,
      createRestorePayload,
      dispatch,
      getMapSeedForLevel,
      getSessionPdaForLevel,
      navigation,
      switchToSession,
    ]
  );

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
        availableRuns,
        highestLevelUnlocked,
      });

      if (isStartingGame) {
        console.log('[CampaignSelect] Early return - already starting');
        return;
      }

      // T021: Check if level is locked
      if (!level.isUnlocked) {
        console.log('[CampaignSelect] Level is locked');
        setAttemptedLevel(level.level);
        setShowLockedModal(true);
        return;
      }

      // T017/T020: Validate available runs (only for non-guest mode)
      if (!isGuestMode && availableRuns <= 0) {
        // Check if there's already a session for this level (resuming doesn't cost a run)
        const hasExisting = activeSessions.some((s) => s.level === level.level);
        if (!hasExisting) {
          console.log('[CampaignSelect] No runs available');
          setShowNoRunsModal(true);
          return;
        }
        console.log('[CampaignSelect] Resuming existing session - no run cost');
      }

      if (!isGuestMode) {
        const localSession = activeSessions.find((session) => session.level === level.level);
        const hasExistingSession = localSession
          ? true
          : !isCachedMode && (await hasSessionForLevel(level.level));

        if (hasExistingSession) {
          setPendingLevelWithSession(level);
          setShowSessionExistsModal(true);
          return;
        }
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
          let shouldRetry = true;

          while (shouldRetry) {
            shouldRetry = false;
            try {
              result = await startSessionOnChain(level.level);
              console.log('[CampaignSelect] startSessionOnChain result:', result);

              if (result && !result.success) {
                const message = result.error ?? 'Failed to start session.';
                shouldRetry = await promptTransactionRetry({
                  title: 'Session Start Failed',
                  message,
                  retryLabel: 'Retry',
                  cancelLabel: 'Continue Offline',
                });
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to start session.';
              shouldRetry = await promptTransactionRetry({
                title: 'Session Start Failed',
                message,
                retryLabel: 'Retry',
                cancelLabel: 'Continue Offline',
              });
            }
          }

          // Determine seed to use
          if (result?.success && mapSeed !== null) {
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
            if (result && !result.success && result.error) {
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
        const stateToRestore = result?.gameState ?? null;
        const restorePayload = createRestorePayload(stateToRestore);

        if (stateToRestore && restorePayload) {
          console.log('[CampaignSelect] Restoring state with position:', {
            x: stateToRestore.positionX,
            y: stateToRestore.positionY,
          });
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
      activeSessions,
      availableRuns,
      createRestorePayload,
      dispatch,
      navigation,
      gameState?.phase,
      hasSessionForLevel,
      highestLevelUnlocked,
      isCachedMode,
      startSessionOnChain,
      mapSeed,
      isStartingGame,
      isGuestMode,
      mode,
    ]
  );

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleResumeExistingSession = useCallback(async () => {
    if (!pendingLevelWithSession) {
      return;
    }
    setShowSessionExistsModal(false);
    await resumeSession(pendingLevelWithSession);
  }, [pendingLevelWithSession, resumeSession]);

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

      {/* T020: No Runs Available Modal */}
      <Modal
        visible={showNoRunsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNoRunsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>No Runs Available</Text>
            <Text style={styles.modalText}>
              You need at least 1 run to start a new game.{'\n'}
              Purchase more runs to continue playing.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={() => setShowNoRunsModal(false)}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={() => {
                  setShowNoRunsModal(false);
                  navigation.navigate('RunPurchase');
                }}
              >
                <Text style={styles.modalButtonTextPrimary}>Purchase Runs</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* T065: Session Already Exists Modal */}
      <Modal
        visible={showSessionExistsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionExistsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Session Already Exists</Text>
            <Text style={styles.modalText}>
              You already have an active session for level{' '}
              {(pendingLevelWithSession?.level ?? 0) + 1}. Resume it to continue your run.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={() => setShowSessionExistsModal(false)}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={handleResumeExistingSession}
              >
                <Text style={styles.modalButtonTextPrimary}>Resume</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* T021: Level Locked Modal */}
      <Modal
        visible={showLockedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Level Locked</Text>
            <Text style={styles.modalText}>
              Level {(attemptedLevel ?? 0) + 1} is not yet unlocked.{'\n'}
              Complete level {highestLevelUnlocked} to progress.
            </Text>
            <TouchableOpacity
              style={styles.modalButtonPrimary}
              onPress={() => setShowLockedModal(false)}
            >
              <Text style={styles.modalButtonTextPrimary}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#3d2b1f',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#5c4033',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#FABC0F',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#c8c8c8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonPrimary: {
    backgroundColor: '#FABC0F',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
  },
  modalButtonSecondary: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5c4033',
    minWidth: 100,
  },
  modalButtonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  modalButtonTextSecondary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#c8c8c8',
    textAlign: 'center',
  },
});
