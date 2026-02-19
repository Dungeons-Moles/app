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
  Alert,
} from 'react-native';
import { InlineModal } from '../components/InlineModal';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PublicKey } from '@solana/web3.js';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { useMapGenerator, MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useIsFocused } from '@react-navigation/native';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { Skeleton } from '../components/common/Skeleton';
import { ProfileCard } from '../components/profile/ProfileCard';
import { createGameplayStateProgram } from '../services/solana/programs';
import { fetchGameState, getGameStatePda } from '../services/solana/gameplayState';
import { fetchFullSessionState } from '../services/solana/sessionRestore';
import { deriveSessionPda } from '../services/solana/constants';
import { promptTransactionRetry } from '../utils/transaction-alerts';
import { useWallet } from '../contexts/WalletContext';
import { getVrfSeed } from '../services/solana/vrf';
import type { CampaignLevel } from '../types/solana';
import type { GameState as OnChainGameState } from '../services/solana/types/gameplay_state';

const backgroundImageCompact = require('../../assets/ui/backgrounds/campaign-background-compact.png');
const backgroundImageWide = require('../../assets/ui/backgrounds/campaign-background-wide.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const squareSource = require('../../assets/ui/frames/square.png');
const lockSource = require('../../assets/icons/ui/lock.png');
const iconASource = require('../../assets/ui/control-buttons/a.png');
const iconBSource = require('../../assets/ui/control-buttons/b.png');

type CampaignSelectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CampaignSelect'>;
};

const NUM_COLUMNS = 5;

export function CampaignSelectScreen({ navigation }: CampaignSelectScreenProps) {
  const { profile, mode, availableRuns, highestLevelUnlocked } = useProfile();
  const { wallet } = useWallet();
  const { connection, gameplayConnection, erConnection } = useSolanaConnection();
  const {
    startGame: startSessionOnChain,
    hasSessionForLevel,
    activeSessions,
    processPendingCleanups,
    getMapSeedForLevel,
    switchToSession,
    getSessionPdaForLevel,
    setGameStatePda,
  } = useSession();
  const { state: gameState, dispatch } = useGame();
  const {
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

  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
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
            if (!connection || !wallet.publicKey) {
              Alert.alert('Connection Error', 'Wallet or connection not available.');
              return;
            }

            // Use switchToSession to set up gameStatePda, recover sessionSigner wallet,
            // and fetch map seed — without creating a new session.
            // This avoids the "SessionSigner wallet missing" error that startGame hits
            // when the sessionSigner hasn't been loaded from SecureStore yet.
            const sessionPda = await getSessionPdaForLevel(level.level);
            if (sessionPda) {
              console.log('[CampaignSelect] Switching to existing session...');
              const switchResult = await switchToSession(sessionPda);
              if (!switchResult.success) {
                console.warn('[CampaignSelect] switchToSession failed:', switchResult.error);
                const message = switchResult.error ?? 'Failed to resume session.';
                shouldRetry = await promptTransactionRetry({
                  title: 'Resume Failed',
                  message,
                });
                continue;
              }
            }

            // If switchToSession didn't work (no PDA found or failed),
            // fall back to startSessionOnChain which handles the reuse path
            if (!sessionPda) {
              console.log('[CampaignSelect] No session PDA found, trying startSessionOnChain...');
              const result = await startSessionOnChain(level.level);
              if (result && !result.success) {
                const message = result.error ?? 'Failed to resume session.';
                shouldRetry = await promptTransactionRetry({
                  title: 'Resume Failed',
                  message,
                });
                continue;
              }
            }

            const onChainLevel = level.level + 1;
            const [sessionPdaKey] = deriveSessionPda(wallet.publicKey, onChainLevel);

            // Determine seed
            const seedFromChain = await getMapSeedForLevel(level.level);
            let seed: number;
            if (seedFromChain !== null) {
              seed = Number(seedFromChain % BigInt(2147483647));
            } else if (level.seed !== null) {
              seed = Number(level.seed % BigInt(2147483647));
            } else {
              seed = await getVrfSeed();
            }

            // Full on-chain restore: fetch all accounts and build complete GameState.
            // Use erConnection directly because delegated accounts live on the ER,
            // and the gameplayConnection closure may still point to base chain.
            console.log('[CampaignSelect] Restoring session from on-chain data...');
            const restoredState = await fetchFullSessionState(erConnection, sessionPdaKey, seed);

            if (restoredState) {
              console.log('[CampaignSelect] Full session restore successful');
              // Set the gameStatePda so gameplay hooks can interact with the blockchain
              const [derivedGameStatePda] = getGameStatePda(sessionPdaKey);
              setGameStatePda(derivedGameStatePda);
              dispatch({ type: 'RESTORE_GAME', state: restoredState });
              navigation.navigate('Game');
              return;
            }

            // Fallback: partial restore from GameState only
            console.warn('[CampaignSelect] Full restore failed, falling back to partial restore');
            const program = createGameplayStateProgram(erConnection);
            const [gameStatePdaFallback] = getGameStatePda(sessionPdaKey);
            setGameStatePda(gameStatePdaFallback);
            const stateToRestore = await fetchGameState(program, gameStatePdaFallback);
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
      erConnection,
      createRestorePayload,
      dispatch,
      getMapSeedForLevel,
      getSessionPdaForLevel,
      navigation,
      setGameStatePda,
      startSessionOnChain,
      switchToSession,
      wallet.publicKey,
    ]
  );

  // Build campaign levels synchronously from profile data (no RPC needed for grid)
  useEffect(() => {
    const playerLevel = profile?.currentLevel ?? 0;
    const builtLevels: CampaignLevel[] = [];

    for (let level = 0; level <= MAX_CAMPAIGN_LEVEL; level++) {
      if (isGuestMode) {
        builtLevels.push({
          level,
          isUnlocked: level < 10,
          isCompleted: false,
          seed: null,
        });
      } else {
        builtLevels.push({
          level,
          isUnlocked: level <= playerLevel,
          isCompleted: level < playerLevel,
          seed: null, // Seeds fetched on-demand when starting a game
        });
      }
    }

    setLevels(builtLevels);
    setIsLoadingLevels(false);
  }, [profile?.currentLevel, isGuestMode]);

  const onRefresh = useCallback(async () => {
    if (isGuestMode || isCachedMode) {
      return;
    }
    setRefreshing(true);
    // Pre-fetch map config in background so seeds are cached for game start
    await refreshConfig();
    setRefreshing(false);
  }, [isGuestMode, isCachedMode, refreshConfig]);

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

        // In guest mode, skip on-chain session and use secure/VRF-backed seed
        if (isGuestMode) {
          console.log('[CampaignSelect] Guest mode - using secure/VRF-backed seed');
          seed = await getVrfSeed();
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

          // Determine seed to use — prefer the seed returned directly from startGame
          // (React state via mapSeed may not have updated yet)
          const returnedSeed = result?.mapSeed ?? null;
          if (result?.success && returnedSeed !== null) {
            // Convert BigInt seed to a 32-bit number for the game engine
            seed = Number(returnedSeed % BigInt(2147483647));
            console.log('[CampaignSelect] Using on-chain seed:', seed);
          } else if (level.seed !== null) {
            // Use the level's seed from getCampaignLevels
            seed = Number(level.seed % BigInt(2147483647));
            console.log('[CampaignSelect] Using level seed:', seed);
          } else {
            // Fallback to secure/VRF-backed seed if on-chain session fails
            seed = await getVrfSeed();
            console.log('[CampaignSelect] Fallback to secure seed:', seed);
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

        // For on-chain sessions (resumed or new), always fetch full state from chain.
        // Use erConnection directly: delegated accounts are on the ER, and
        // gameplayConnection may still be stale (base chain) in this closure.
        // Fall back to base connection if ER hasn't received the accounts yet.
        if (!isGuestMode && result?.success && connection && wallet.publicKey) {
          console.log('[CampaignSelect] On-chain session active, fetching full state from chain...');
          const onChainLevel = level.level + 1; // Convert 0-indexed frontend to 1-indexed on-chain
          const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
          const restoredState =
            (await fetchFullSessionState(erConnection, sessionPda, seed)) ??
            (await fetchFullSessionState(connection, sessionPda, seed));

          if (restoredState) {
            console.log('[CampaignSelect] Full on-chain state fetch successful');
            // Set the gameStatePda so gameplay hooks can interact with the blockchain
            const [derivedPda] = getGameStatePda(sessionPda);
            setGameStatePda(derivedPda);
            dispatch({ type: 'RESTORE_GAME', state: restoredState });
            navigation.navigate('Game');
            return;
          }
          console.warn('[CampaignSelect] On-chain state fetch failed, falling back to START_GAME');
        }

        // Guest mode or fallback: start with frontend-generated map
        dispatch({
          type: 'START_GAME',
          seed,
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
      connection,
      erConnection,
      gameplayConnection,
      dispatch,
      navigation,
      gameState?.phase,
      hasSessionForLevel,
      highestLevelUnlocked,
      isCachedMode,
      setGameStatePda,
      startSessionOnChain,
      isStartingGame,
      isGuestMode,
      mode,
      wallet.publicKey,
    ]
  );

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isScreenFocused = useIsFocused();
  const [cursorIdx, setCursorIdx] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const didRunCleanupThisFocusRef = useRef(false);

  const anyModalOpen = showNoRunsModal || showLockedModal || showSessionExistsModal;

  useEffect(() => {
    if (!isScreenFocused) {
      didRunCleanupThisFocusRef.current = false;
      return;
    }
    if (didRunCleanupThisFocusRef.current) {
      return;
    }
    didRunCleanupThisFocusRef.current = true;
    console.log('[CampaignSelect] Screen focused -> triggering processPendingCleanups');
    processPendingCleanups().catch((err) => {
      console.warn('[CampaignSelect] Failed to run pending cleanup processing:', err);
    });
  }, [isScreenFocused, processPendingCleanups]);

  // Auto-scroll FlatList to keep cursor visible
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      flatListRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: true,
      });
    },
    []
  );

  useEffect(() => {
    if (isController && flatListRef.current && levels.length > 0 && cursorIdx < levels.length) {
      try {
        flatListRef.current.scrollToIndex({
          index: cursorIdx,
          animated: true,
          viewOffset: 50,
        });
      } catch {
        // Fallback: estimate offset from row height
        const rowHeight = isCompact ? 88 + 16 : 56 + 12;
        const row = Math.floor(cursorIdx / NUM_COLUMNS);
        flatListRef.current.scrollToOffset({ offset: row * rowHeight, animated: true });
      }
    }
  }, [cursorIdx, isController, levels.length, isCompact]);

  const modalActions = anyModalOpen
    ? {
        onA: showSessionExistsModal
          ? () => {
              if (pendingLevelWithSession) {
                setShowSessionExistsModal(false);
                resumeSession(pendingLevelWithSession);
              }
            }
          : () => {
              setShowNoRunsModal(false);
              setShowLockedModal(false);
            },
        onB: () => {
          setShowNoRunsModal(false);
          setShowLockedModal(false);
          setShowSessionExistsModal(false);
        },
      }
    : undefined;

  useControllerAction(
    modalActions ?? {
      onB: handleBack,
      onA: () => {
        if (levels[cursorIdx]) handleLevelSelect(levels[cursorIdx]);
      },
      onDPadLeft: () => setCursorIdx((p) => Math.max(0, p - 1)),
      onDPadRight: () => setCursorIdx((p) => Math.min(levels.length - 1, p + 1)),
      onDPadUp: () => setCursorIdx((p) => Math.max(0, p - NUM_COLUMNS)),
      onDPadDown: () => setCursorIdx((p) => Math.min(levels.length - 1, p + NUM_COLUMNS)),
    },
    isController && isScreenFocused
  );

  const controllerHints: ButtonHint[] = anyModalOpen
    ? [
        { button: 'A', label: showSessionExistsModal ? 'Resume' : 'OK' },
        { button: 'B', label: 'Cancel' },
      ]
    : [
        { button: 'DPad', label: 'Navigate' },
        { button: 'A', label: 'Select Level' },
        { button: 'B', label: 'Back' },
      ];

  const handleResumeExistingSession = useCallback(async () => {
    if (!pendingLevelWithSession) {
      return;
    }
    setShowSessionExistsModal(false);
    await resumeSession(pendingLevelWithSession);
  }, [pendingLevelWithSession, resumeSession]);

  const renderLevelItem = useCallback(
    ({ item, index }: { item: CampaignLevel; index: number }) => {
      const isSelected = selectedLevel === item.level;
      const isCurrentLevel = item.level === (profile?.currentLevel ?? 0);
      const isCursorItem = isController && index === cursorIdx;

      const cell = (
        <TouchableOpacity
          style={[styles.levelCell, isCompact && compactStyles.levelCell]}
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
            {isCurrentLevel && (
              <View style={[styles.currentLevelBorder, isCompact && compactStyles.currentLevelBorder]} />
            )}

            {/* Selected state overlay */}
            {isSelected && <View style={styles.selectedOverlay} />}

            {/* Level number */}
            <Text
              style={[
                styles.levelNumber,
                isCompact && compactStyles.levelNumber,
                item.isUnlocked ? styles.levelNumberUnlocked : styles.levelNumberLocked,
                item.isCompleted && styles.levelNumberCompleted,
                isCurrentLevel && styles.levelNumberCurrent,
              ]}
            >
              {item.level + 1}
            </Text>

            {/* Completed checkmark */}
            {item.isCompleted && (
              <Text style={[styles.checkmark, isCompact && compactStyles.checkmark]}>&#10003;</Text>
            )}

            {/* Lock icon for locked levels */}
            {!item.isUnlocked && (
              <Image
                source={lockSource}
                style={[styles.lockIcon, isCompact && compactStyles.lockIcon]}
                resizeMode="contain"
              />
            )}

            {/* Loading indicator */}
            {isSelected && isStartingGame && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size={isCompact ? 'large' : 'small'} color="#ffffff" />
              </View>
            )}
          </ImageBackground>
        </TouchableOpacity>
      );

      return isCursorItem ? <FocusGlow active>{cell}</FocusGlow> : cell;
    },
    [handleLevelSelect, isStartingGame, selectedLevel, profile?.currentLevel, isController, cursorIdx]
  );

  const keyExtractor = useCallback((item: CampaignLevel) => `level-${item.level}`, []);

  const isLoading = isLoadingLevels || mapLoading;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={isCompact ? backgroundImageCompact : backgroundImageWide}
        style={styles.backgroundImage}
        resizeMode="stretch"
      />

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {isController ? (
            <View style={[styles.backButton, isCompact && compactStyles.backButton]} />
          ) : (
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={[styles.backButton, isCompact && compactStyles.backButton]}
                resizeMode="stretch"
              >
                <Text style={[styles.backButtonText, isCompact && compactStyles.backButtonText]}>
                  Back
                </Text>
              </ImageBackground>
            </TouchableOpacity>
          )}

          <ImageBackground
            source={buttonV4Source}
            style={[styles.titlePanel, isCompact && compactStyles.titlePanel]}
            resizeMode="stretch"
          >
            <Text style={[styles.title, isCompact && compactStyles.title]}>Campaign</Text>
            <Text style={[styles.subtitle, isCompact && compactStyles.subtitle]}>
              {isGuestMode
                ? 'Guest Mode (1-10)'
                : isCachedMode
                  ? `Cached - Level ${(profile?.currentLevel ?? 0) + 1}`
                  : `Level ${(profile?.currentLevel ?? 0) + 1} / ${MAX_CAMPAIGN_LEVEL + 1}`}
            </Text>
          </ImageBackground>

          {/* Mode indicator */}
          {(isGuestMode || isCachedMode) && (
            <View style={[styles.modeIndicator, isCompact && compactStyles.modeIndicator]}>
              <Text style={[styles.modeIndicatorText, isCompact && compactStyles.modeIndicatorText]}>
                {isGuestMode ? 'GUEST' : 'OFFLINE'}
              </Text>
            </View>
          )}

          {!isGuestMode && !isCachedMode && (
            <View style={[styles.headerSpacer, isCompact && compactStyles.headerSpacer]} />
          )}
        </View>

        {/* Level Grid */}
        {isLoading ? (
          <View style={styles.gridContent}>
            <View style={[styles.loadingGrid, isCompact && compactStyles.loadingGrid]}>
              {Array.from({ length: 15 }).map((_, index) => (
                <View
                  key={`skeleton-${index}`}
                  style={[styles.levelCellSkeleton, isCompact && compactStyles.levelCellSkeleton]}
                >
                  <Skeleton width="100%" height="100%" borderRadius={8} />
                </View>
              ))}
            </View>
            <Text style={[styles.loadingText, isCompact && compactStyles.loadingText]}>
              Loading levels...
            </Text>
          </View>
        ) : mapError ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>{mapError}</Text>
            <TouchableOpacity onPress={handleBack} style={styles.errorButton}>
              <Text style={[styles.errorButtonText, isCompact && compactStyles.errorButtonText]}>
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={levels}
            renderItem={renderLevelItem}
            keyExtractor={keyExtractor}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContent}
            onScrollToIndexFailed={onScrollToIndexFailed}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FABC0F" />
            }
          />
        )}
      </View>

      {profile && (
        <View style={[styles.statsContainer, isCompact && compactStyles.statsContainer]}>
          <ProfileCard profile={profile} />
        </View>
      )}

      {/* T020: No Runs Available Modal */}
      <InlineModal
        visible={showNoRunsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNoRunsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isCompact && compactStyles.modalContent]}>
            <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
              No Sessions Available
            </Text>
            <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
              You need at least 1 session to start a new game.{'\n'}
              Purchase more sessions to continue playing.
            </Text>
            {isCompact ? (
              <View style={compactStyles.modalHintRow}>
                <View style={compactStyles.modalHintItem}>
                  <Image source={iconASource} style={compactStyles.modalHintIcon} resizeMode="contain" />
                  <Text style={compactStyles.modalHintLabel}>OK</Text>
                </View>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonSecondary}
                  onPress={() => setShowNoRunsModal(false)}
                >
                  <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </InlineModal>

      {/* T065: Session Already Exists Modal */}
      <InlineModal
        visible={showSessionExistsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionExistsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isCompact && compactStyles.modalContent]}>
            <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
              Session Already Exists
            </Text>
            <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
              You already have an active session for level{' '}
              {(pendingLevelWithSession?.level ?? 0) + 1}. Resume it to continue your run.
            </Text>
            {isCompact ? (
              <View style={compactStyles.modalHintRow}>
                <View style={compactStyles.modalHintItem}>
                  <Image source={iconBSource} style={compactStyles.modalHintIcon} resizeMode="contain" />
                  <Text style={compactStyles.modalHintLabel}>Cancel</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image source={iconASource} style={compactStyles.modalHintIcon} resizeMode="contain" />
                  <Text style={compactStyles.modalHintLabel}>Resume</Text>
                </View>
              </View>
            ) : (
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
            )}
          </View>
        </View>
      </InlineModal>

      {/* T021: Level Locked Modal */}
      <InlineModal
        visible={showLockedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isCompact && compactStyles.modalContent]}>
            <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
              Level Locked
            </Text>
            <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
              Level {(attemptedLevel ?? 0) + 1} is not yet unlocked.{'\n'}
              Complete level {highestLevelUnlocked} to progress.
            </Text>
            {isCompact ? (
              <View style={compactStyles.modalHintRow}>
                <View style={compactStyles.modalHintItem}>
                  <Image source={iconASource} style={compactStyles.modalHintIcon} resizeMode="contain" />
                  <Text style={compactStyles.modalHintLabel}>OK</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={() => setShowLockedModal(false)}
              >
                <Text style={styles.modalButtonTextPrimary}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </InlineModal>
      <ControllerHints hints={controllerHints} horizontal />
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

const compactStyles = StyleSheet.create({
  content: {
    paddingTop: 36,
    paddingHorizontal: 28,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    width: 140,
    height: 76,
  },
  backButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titlePanel: {
    width: 280,
    height: 100,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 36,
  },
  subtitle: {
    fontSize: 20,
    marginBottom: 6,
  },
  headerSpacer: {
    width: 140,
  },
  modeIndicator: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  modeIndicatorText: {
    fontSize: 20,
  },
  levelCell: {
    width: 88,
    height: 88,
    margin: 8,
  },
  levelNumber: {
    fontSize: 30,
  },
  currentLevelBorder: {
    borderWidth: 4,
    borderRadius: 6,
  },
  checkmark: {
    top: 3,
    right: 5,
    fontSize: 18,
  },
  lockIcon: {
    bottom: 5,
    right: 5,
    width: 22,
    height: 22,
  },
  loadingGrid: {
    width: (88 + 16) * 5,
  },
  levelCellSkeleton: {
    width: 88,
    height: 88,
    margin: 8,
  },
  loadingText: {
    fontSize: 26,
  },
  errorText: {
    fontSize: 22,
  },
  errorButtonText: {
    fontSize: 26,
  },
  statsContainer: {
    bottom: 28,
    right: 28,
  },
  modalContent: {
    maxWidth: 560,
    padding: 40,
    borderRadius: 16,
    borderWidth: 3,
  },
  modalTitle: {
    fontSize: 36,
    marginBottom: 20,
  },
  modalText: {
    fontSize: 24,
    lineHeight: 34,
    marginBottom: 28,
  },
  modalHintRow: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'center',
  },
  modalHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHintIcon: {
    width: 32,
    height: 32,
  },
  modalHintLabel: {
    fontFamily: Typography.button,
    fontSize: 24,
    color: '#c8c8c8',
  },
});
