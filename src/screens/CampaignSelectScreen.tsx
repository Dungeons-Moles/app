import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
  InteractionManager,
} from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { InlineModal } from '../components/InlineModal';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { useSessionIdentity, type SessionStartupState } from '../contexts/SessionContext';
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
import { useAudio } from '../contexts/AudioContext';
import { FocusGlow } from '../components/ui/FocusGlow';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { Skeleton } from '../components/common/Skeleton';
import { ProfileCard } from '../components/profile/ProfileCard';
import { useWallet } from '../contexts/WalletContext';
import { getVrfSeed } from '../services/solana/vrf';
import {
  createSessionSetup,
  resolveSessionSetup,
  rejectSessionSetup,
} from '../utils/sessionSetupSignal';
import type { CampaignLevel } from '../types/solana';

const backgroundImageCompact = require('../../assets/ui/backgrounds/campaign-background-compact.webp');
const backgroundImageWide = require('../../assets/ui/backgrounds/campaign-background-wide.webp');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.webp');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.webp');
const squareSource = require('../../assets/ui/frames/square.webp');
const lockSource = require('../../assets/icons/ui/lock.webp');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.webp');
const iconASource = require('../../assets/ui/control-buttons/a.webp');
const iconBSource = require('../../assets/ui/control-buttons/b.webp');
const iconXSource = require('../../assets/ui/control-buttons/x.webp');
const engineImageSource = require('../../assets/ui/illustrations/engine.webp');

type CampaignSelectScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CampaignSelect'>;
};

const NUM_COLUMNS = 5;
const SESSION_CLEANUP_WAIT_TIMEOUT_MS = 45000;
const SESSION_CLEANUP_POLL_MS = 1000;

export function CampaignSelectScreen({ navigation }: CampaignSelectScreenProps) {
  const { profile, mode, availableRuns, highestLevelUnlocked } = useProfile();
  const { wallet, disconnect } = useWallet();
  const { connection } = useSolanaConnection();
  const {
    startGame: startSessionOnChain,
    overrideCampaignSession,
    overrideAndStartGame,
    hasSessionForLevel,
    activeSessions,
    hasPendingCleanups,
    processPendingCleanups,
    switchToSession,
    ensureSessionVrfReady,
    getSessionPdaForLevel,
  } = useSessionIdentity();
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
  const [showSessionInitializingModal, setShowSessionInitializingModal] = useState(false);
  const [attemptedLevel, setAttemptedLevel] = useState<number | null>(null);
  const [pendingLevelWithSession, setPendingLevelWithSession] = useState<CampaignLevel | null>(
    null
  );
  const [pendingSessionStartupState, setPendingSessionStartupState] =
    useState<SessionStartupState | null>(null);
  const [sessionInitStatusMessage, setSessionInitStatusMessage] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const { playSfx } = useAudio();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const isGuestMode = mode === 'guest';
  const isCachedMode = mode === 'cached';

  const resumeSession = useCallback(
    async (level: CampaignLevel) => {
      setIsStartingGame(true);
      setSelectedLevel(level.level);

      // Navigate to loading screen immediately
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'campaign' });
      let navigatedToLoading = true;

      try {
        if (!connection || !wallet.publicKey) {
          rejectSessionSetup('Wallet or connection not available.');
          return;
        }

        // Use switchToSession to set up gameStatePda, recover sessionSigner wallet,
        // and fetch map seed — without creating a new session.
        // This avoids the "SessionSigner wallet missing" error that startGame hits
        // when the sessionSigner hasn't been loaded from SecureStore yet.
        const sessionPda = await getSessionPdaForLevel(level.level);
        let resumedSessionPda = sessionPda;
        if (sessionPda) {
          console.log('[CampaignSelect] Switching to existing session...');
          const switchResult = await switchToSession(sessionPda, {
            requirePoiVrfReady: false,
          });
          if (!switchResult.success) {
            // Delegation-propagation errors are non-blocking: session exists on-chain,
            // ER just hasn't replicated accounts yet. Continue to GameScreen.
            const switchErrMsg = (switchResult.error ?? '').toLowerCase();
            const isDelegationPropagationError =
              switchErrMsg.includes('delegation not fully propagated') ||
              switchErrMsg.includes('failed to delegate session to rollup') ||
              switchErrMsg.includes('delegategameplayaccounts') ||
              switchErrMsg.includes('access violation');
            if (isDelegationPropagationError) {
              console.warn(
                '[CampaignSelect] switchToSession delegation propagation slow — continuing:',
                switchResult.error
              );
            } else {
              console.warn('[CampaignSelect] switchToSession failed:', switchResult.error);
              rejectSessionSetup(switchResult.error ?? 'Failed to resume session.');
              return;
            }
          }
        }

        // If switchToSession didn't work (no PDA found or failed),
        // fall back to startSessionOnChain which handles the reuse path
        if (!sessionPda) {
          console.log('[CampaignSelect] No session PDA found, trying startSessionOnChain...');
          const result = await startSessionOnChain(level.level);
          if (result && !result.success) {
            rejectSessionSetup(result.error ?? 'Failed to resume session.');
            return;
          }
          resumedSessionPda = result?.sessionPda ?? null;
        }

        const sessionPdaBase58 = resumedSessionPda ?? (await getSessionPdaForLevel(level.level));
        if (!sessionPdaBase58) {
          rejectSessionSetup('No session found for this level.');
          return;
        }
        dispatch({ type: 'RESET_GAME' });
        resolveSessionSetup();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resume the session.';
        if (navigatedToLoading) {
          rejectSessionSetup(message);
        } else {
          setErrorMessage(message);
          setShowErrorModal(true);
        }
      } finally {
        setIsStartingGame(false);
        setSelectedLevel(null);
        setPendingLevelWithSession(null);
      }
    },
    [
      connection,
      dispatch,
      getSessionPdaForLevel,
      navigation,
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
      playSfx('ui_click');
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
        // If deferred cleanup is still running for a previous run, wait until
        // the level session slot is truly free before trying to start again.
        if (hasPendingCleanups) {
          setSelectedLevel(level.level);
          setIsStartingGame(true);
          const startWait = Date.now();
          try {
            while (Date.now() - startWait < SESSION_CLEANUP_WAIT_TIMEOUT_MS) {
              await processPendingCleanups().catch((err) => {
                console.warn(
                  '[CampaignSelect] processPendingCleanups during start wait failed:',
                  err
                );
              });
              const stillExists = await hasSessionForLevel(level.level);
              if (!stillExists) {
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, SESSION_CLEANUP_POLL_MS));
            }

            const stillExistsAfterWait = await hasSessionForLevel(level.level);
            if (stillExistsAfterWait) {
              // Cleanup couldn't clear the session (e.g. session signer lost).
              // Show the override modal so the user can force-override with wallet signature.
              setPendingLevelWithSession(level);
              setPendingSessionStartupState(null);
              setSessionInitStatusMessage(null);
              setShowSessionExistsModal(true);
              setShowSessionInitializingModal(false);
              return;
            }
          } finally {
            setIsStartingGame(false);
            setSelectedLevel(null);
          }
        }

        // Always check current on-chain nonce namespace instead of local cached list.
        // This avoids reopening the modal right after override when React state is stale.
        const hasExistingSession = !isCachedMode && (await hasSessionForLevel(level.level));

        if (hasExistingSession) {
          setPendingLevelWithSession(level);
          setPendingSessionStartupState(null);
          setSessionInitStatusMessage(null);
          setShowSessionExistsModal(true);
          setShowSessionInitializingModal(false);
          return;
        }
      }

      setSelectedLevel(level.level);
      setIsStartingGame(true);
      let navigatedToLoading = false;

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
          // onCommitted callback fires right after wallet tx confirms (before delegation/VRF)
          try {
            result = await startSessionOnChain(level.level, () => {
              if (navigatedToLoading) return;
              createSessionSetup();
              navigation.navigate('SessionLoading', { mode: 'campaign' });
              navigatedToLoading = true;
            });
            console.log('[CampaignSelect] startSessionOnChain result:', {
              ...result,
              mapSeed: result?.mapSeed?.toString() ?? null,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start session.';
            if (navigatedToLoading) {
              rejectSessionSetup(message);
            } else {
              setErrorMessage(message);
              setShowErrorModal(true);
            }
            return;
          }

          if (!result?.success) {
            // Delegation-propagation errors are non-blocking: the session was created
            // on-chain and delegated to ER, but ER hasn't replicated the accounts yet.
            // Continue to on-chain state fetch — it will wait for ER to propagate.
            const errMsg = (result?.error ?? '').toLowerCase();
            const isDelegationPropagationError =
              errMsg.includes('delegation not fully propagated') ||
              errMsg.includes('failed to delegate session to rollup') ||
              errMsg.includes('delegategameplayaccounts') ||
              errMsg.includes('access violation');
            if (!isDelegationPropagationError) {
              if (navigatedToLoading) {
                rejectSessionSetup(result?.error ?? 'Failed to start session.');
              } else {
                setErrorMessage(result?.error ?? 'Failed to start session.');
                setShowErrorModal(true);
              }
              return;
            }
            console.warn(
              '[CampaignSelect] Delegation propagation slow — continuing with on-chain fetch:',
              result?.error
            );
          }

          // Determine seed to use — prefer the seed returned directly from startGame
          // (React state via mapSeed may not have updated yet).
          // NEVER fall back to offline mode — the on-chain session is the source of truth.
          const returnedSeed = result?.mapSeed ?? null;
          if (returnedSeed !== null) {
            seed = Number(returnedSeed % BigInt(2147483647));
            console.log('[CampaignSelect] Using on-chain seed:', seed);
          } else {
            // Private sessions do not expose the map seed to the client.
            // Use a placeholder until on-chain session restore fills runtime state.
            seed = 0;
            console.log('[CampaignSelect] Seed intentionally unavailable in private mode');
          }
        }

        // Reset game state if needed
        if (gameState?.phase === GamePhase.Defeat || gameState?.phase === GamePhase.Victory) {
          dispatch({ type: 'RETURN_TO_MENU' });
        }

        if (!isGuestMode && result) {
          dispatch({ type: 'RESET_GAME' });
          resolveSessionSetup();
          return;
        }

        // Guest mode only: start with frontend-generated map.
        // Non-guest flows MUST go through the on-chain state fetch above — never offline.
        if (!isGuestMode) {
          console.error(
            '[CampaignSelect] BUG: non-guest flow reached offline dispatch. This should never happen.'
          );
          setErrorMessage('Failed to load on-chain session state. Please try again.');
          setShowErrorModal(true);
          return;
        }
        if (gameState?.phase !== GamePhase.MainMenu) {
          dispatch({ type: 'RETURN_TO_MENU' });
        }
        dispatch({
          type: 'START_GAME',
          seed,
        });

        // Route through SessionLoadingScreen so game assets get preloaded
        console.log('[CampaignSelect] Guest mode — navigating through SessionLoadingScreen...');
        if (!navigatedToLoading) {
          createSessionSetup();
          navigation.navigate('SessionLoading', { mode: 'campaign' });
          navigatedToLoading = true;
        }
        resolveSessionSetup();
      } catch (error) {
        console.error('[CampaignSelect] Error starting game:', error);
        const message = error instanceof Error ? error.message : 'Failed to start game.';
        if (navigatedToLoading) {
          rejectSessionSetup(message);
        } else {
          setErrorMessage(message);
          setShowErrorModal(true);
        }
      } finally {
        setIsStartingGame(false);
        setSelectedLevel(null);
      }
    },
    [
      activeSessions,
      availableRuns,
      connection,
      hasPendingCleanups,
      dispatch,
      navigation,
      gameState?.phase,
      hasSessionForLevel,
      highestLevelUnlocked,
      isCachedMode,
      getSessionPdaForLevel,
      processPendingCleanups,
      startSessionOnChain,
      isStartingGame,
      isGuestMode,
      mode,
      wallet.publicKey,
    ]
  );

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    navigation.goBack();
  }, [navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isScreenFocused = useIsFocused();
  const [cursorIdx, setCursorIdx] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const didRunCleanupThisFocusRef = useRef(false);

  const anyModalOpen =
    showNoRunsModal ||
    showLockedModal ||
    showSessionExistsModal ||
    showSessionInitializingModal ||
    showErrorModal;

  useEffect(() => {
    if (!isScreenFocused) {
      didRunCleanupThisFocusRef.current = false;
      return;
    }
    if (!hasPendingCleanups) {
      return;
    }
    if (didRunCleanupThisFocusRef.current) {
      return;
    }
    didRunCleanupThisFocusRef.current = true;
    console.log('[CampaignSelect] Screen focused -> triggering processPendingCleanups');
    const task = InteractionManager.runAfterInteractions(() => {
      processPendingCleanups().catch((err) => {
        console.warn('[CampaignSelect] Failed to run pending cleanup processing:', err);
      });
    });
    return () => {
      task.cancel();
    };
  }, [hasPendingCleanups, isScreenFocused, processPendingCleanups]);

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

  const handleResumeExistingSession = useCallback(async () => {
    if (!pendingLevelWithSession) {
      return;
    }
    setSessionInitStatusMessage(null);
    setShowSessionExistsModal(false);
    await resumeSession(pendingLevelWithSession);
  }, [pendingLevelWithSession, resumeSession]);

  const handleRetryPendingSessionVrf = useCallback(async () => {
    if (!pendingLevelWithSession) {
      return;
    }
    setIsStartingGame(true);
    try {
      const sessionPda = await getSessionPdaForLevel(pendingLevelWithSession.level);
      if (!sessionPda) {
        setSessionInitStatusMessage('Session not found. Try creating a new one.');
        return;
      }
      const vrfReady = await ensureSessionVrfReady(sessionPda);
      if (!vrfReady.success) {
        setSessionInitStatusMessage(
          vrfReady.error ?? 'VRF is still pending for this session. Please try again shortly.'
        );
        return;
      }
      setSessionInitStatusMessage(null);
      setShowSessionInitializingModal(false);
      await resumeSession(pendingLevelWithSession);
    } catch (error) {
      setSessionInitStatusMessage(
        error instanceof Error ? error.message : 'Failed to retry VRF for this session.'
      );
    } finally {
      setIsStartingGame(false);
    }
  }, [ensureSessionVrfReady, getSessionPdaForLevel, pendingLevelWithSession, resumeSession]);

  const handleOverrideExistingSession = useCallback(async () => {
    const targetLevel = pendingLevelWithSession;
    console.log('[CampaignSelect] handleOverrideExistingSession called', {
      hasPendingLevel: !!targetLevel,
      pendingLevel: targetLevel?.level ?? null,
    });

    if (!targetLevel) {
      setErrorMessage('No pending session level selected for override. Select the level again.');
      setShowErrorModal(true);
      return;
    }

    if (mode !== 'guest' && availableRuns <= 0) {
      setShowNoRunsModal(true);
      return;
    }

    setIsStartingGame(true);
    let navigatedToLoading = false;

    try {
      const overrideResult = await overrideAndStartGame(targetLevel.level, () => {
        if (navigatedToLoading) return;
        createSessionSetup();
        navigation.navigate('SessionLoading', { mode: 'campaign' });
        navigatedToLoading = true;
      });
      console.log('[CampaignSelect] overrideAndStartGame result', overrideResult);
      if (!overrideResult.success) {
        if (navigatedToLoading) {
          rejectSessionSetup(overrideResult.error ?? 'Failed to override session slot.');
        } else {
          setErrorMessage(overrideResult.error ?? 'Failed to override session slot.');
          setShowErrorModal(true);
        }
        return;
      }

      setShowSessionExistsModal(false);
      setShowSessionInitializingModal(false);
      setSessionInitStatusMessage(null);
      if (!navigatedToLoading) {
        createSessionSetup();
        navigation.navigate('SessionLoading', { mode: 'campaign' });
      }
      dispatch({ type: 'RESET_GAME' });
      resolveSessionSetup();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to override session slot.';
      if (navigatedToLoading) {
        rejectSessionSetup(message);
      } else {
        setErrorMessage(message);
        setShowErrorModal(true);
      }
    } finally {
      setIsStartingGame(false);
    }
  }, [pendingLevelWithSession, navigation, overrideAndStartGame, dispatch]);

  const modalActions = anyModalOpen
    ? {
        onA: showSessionInitializingModal
          ? handleRetryPendingSessionVrf
          : showSessionExistsModal
            ? () => {
                if (pendingLevelWithSession) {
                  setShowSessionExistsModal(false);
                  resumeSession(pendingLevelWithSession);
                }
              }
            : () => {
                setShowNoRunsModal(false);
                setShowLockedModal(false);
                setShowErrorModal(false);
              },
        onB: () => {
          playSfx('ui_back');
          setShowNoRunsModal(false);
          setShowLockedModal(false);
          setShowSessionExistsModal(false);
          setShowSessionInitializingModal(false);
          setShowErrorModal(false);
        },
        onX:
          showSessionExistsModal || showSessionInitializingModal
            ? handleOverrideExistingSession
            : undefined,
      }
    : undefined;

  useControllerAction(
    modalActions ?? {
      onB: handleBack,
      onStart: () => setShowSettingsModal(true),
      onA: () => {
        if (levels[cursorIdx]) handleLevelSelect(levels[cursorIdx]);
      },
      onDPadLeft: () => setCursorIdx((p) => Math.max(0, p - 1)),
      onDPadRight: () => setCursorIdx((p) => Math.min(levels.length - 1, p + 1)),
      onDPadUp: () => setCursorIdx((p) => Math.max(0, p - NUM_COLUMNS)),
      onDPadDown: () => setCursorIdx((p) => Math.min(levels.length - 1, p + NUM_COLUMNS)),
    },
    isController && isScreenFocused && !showSettingsModal
  );

  const controllerHints: ButtonHint[] = anyModalOpen
    ? [
        {
          button: 'A',
          label: showSessionInitializingModal
            ? 'Retry VRF'
            : showSessionExistsModal
              ? 'Resume'
              : 'OK',
        },
        { button: 'B', label: 'Cancel' },
        ...(showSessionExistsModal || showSessionInitializingModal
          ? [{ button: 'X' as const, label: 'Override' }]
          : []),
      ]
    : [
        { button: 'DPad', label: 'Navigate' },
        { button: 'A', label: 'Select Level' },
        { button: 'B', label: 'Back' },
      ];

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
          <CachedImageBackground
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
              <View
                style={[styles.currentLevelBorder, isCompact && compactStyles.currentLevelBorder]}
              />
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
          </CachedImageBackground>
        </TouchableOpacity>
      );

      return isCursorItem ? <FocusGlow active>{cell}</FocusGlow> : cell;
    },
    [
      handleLevelSelect,
      isStartingGame,
      selectedLevel,
      profile?.currentLevel,
      isController,
      cursorIdx,
    ]
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

      {!isCompact && !isController && (
        <View style={styles.topRight}>
          <TouchableOpacity
            onPress={() => {
              playSfx('ui_click');
              setShowSettingsModal(true);
            }}
            activeOpacity={0.7}
          >
            <CachedImageBackground
              source={buttonV1Source}
              style={styles.settingsBtn}
              resizeMode="stretch"
            >
              <Image
                source={engineImageSource}
                style={styles.settingsIconImage}
                resizeMode="contain"
              />
            </CachedImageBackground>
          </TouchableOpacity>
        </View>
      )}

      {!isCompact && !isController && (
        <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.backButtonAbsolute}>
          <CachedImageBackground source={buttonV1Source} style={styles.backButtonMobile} resizeMode="stretch">
            <Text style={styles.backButtonTextMobile}>Back</Text>
          </CachedImageBackground>
        </TouchableOpacity>
      )}

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {isCompact ? (
            isController ? (
              <View style={[styles.backButton, compactStyles.backButton]} />
            ) : (
              <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                <CachedImageBackground
                  source={buttonV1Source}
                  style={[styles.backButton, compactStyles.backButton]}
                  resizeMode="stretch"
                >
                  <Text style={[styles.backButtonText, compactStyles.backButtonText]}>
                    Back
                  </Text>
                </CachedImageBackground>
              </TouchableOpacity>
            )
          ) : (
            <View style={styles.backButton} />
          )}

          <CachedImageBackground
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
          </CachedImageBackground>

          {/* Mode indicator */}
          {(isGuestMode || isCachedMode) && (
            <View style={[styles.modeIndicator, isCompact && compactStyles.modeIndicator]}>
              <Text
                style={[styles.modeIndicatorText, isCompact && compactStyles.modeIndicatorText]}
              >
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
          <CachedImageBackground
            source={PAPER_PANEL}
            resizeMode="stretch"
            style={[styles.modalContent, isCompact && compactStyles.modalContent]}
          >
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
                  <Image
                    source={iconASource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>OK</Text>
                </View>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowNoRunsModal(false)}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              </View>
            )}
          </CachedImageBackground>
        </View>
      </InlineModal>

      <InlineModal
        visible={showSessionInitializingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionInitializingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <CachedImageBackground
            source={PAPER_PANEL}
            resizeMode="stretch"
            style={[
              styles.modalContent,
              isCompact && compactStyles.modalContent,
            ]}
          >
            <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
              Session Initializing Randomness
            </Text>
            <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
              {pendingSessionStartupState === 'created'
                ? 'Your session exists but has not finished delegation to the rollup yet.'
                : pendingSessionStartupState === 'delegated'
                  ? 'Your session is delegated but not fully propagated on ER yet.'
                  : 'Your session exists, but POI VRF is still pending. You cannot enter gameplay until VRF is fulfilled.'}
            </Text>
            {sessionInitStatusMessage ? (
              <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
                {sessionInitStatusMessage}
              </Text>
            ) : null}
            {isCompact ? (
              <View style={compactStyles.modalHintRow}>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconBSource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Cancel</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconXSource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Override</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconASource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Retry VRF</Text>
                </View>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowSessionInitializingModal(false)}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOverrideExistingSession}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Override</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRetryPendingSessionVrf}>
                  <CachedImageBackground
                    source={buttonV4Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Retry VRF</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              </View>
            )}
          </CachedImageBackground>
        </View>
      </InlineModal>

      {/* T065: Session Already Exists Modal */}
      <InlineModal
        visible={showSessionExistsModal}
        transparent
        animationType="fade"
        onRequestClose={handleOverrideExistingSession}
      >
        <View style={styles.modalOverlay}>
          <CachedImageBackground
            source={PAPER_PANEL}
            resizeMode="stretch"
            style={[
              styles.modalContent,
              isCompact && compactStyles.modalContent,
            ]}
          >
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
                  <Image
                    source={iconBSource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Cancel</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconXSource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Override</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconASource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Resume</Text>
                </View>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowSessionExistsModal(false)}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOverrideExistingSession}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Override</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResumeExistingSession}>
                  <CachedImageBackground
                    source={buttonV4Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Resume</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              </View>
            )}
          </CachedImageBackground>
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
          <CachedImageBackground
            source={PAPER_PANEL}
            resizeMode="stretch"
            style={[styles.modalContent, isCompact && compactStyles.modalContent]}
          >
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
                  <Image
                    source={iconASource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>OK</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowLockedModal(false)}>
                <CachedImageBackground
                  source={buttonV4Source}
                  resizeMode="stretch"
                  style={styles.modalButtonBg}
                >
                  <Text style={styles.modalButtonTextPrimary}>OK</Text>
                </CachedImageBackground>
              </TouchableOpacity>
            )}
          </CachedImageBackground>
        </View>
      </InlineModal>
      {/* Error Modal */}
      <InlineModal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <CachedImageBackground
            source={PAPER_PANEL}
            resizeMode="stretch"
            style={[styles.modalContent, isCompact && compactStyles.modalContent]}
          >
            <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
              Request Failed
            </Text>
            <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
              {errorMessage || 'The request failed, please try again.'}
            </Text>
            {isCompact ? (
              <View style={compactStyles.modalHintRow}>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconASource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>OK</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowErrorModal(false)}>
                <CachedImageBackground
                  source={buttonV4Source}
                  resizeMode="stretch"
                  style={styles.modalButtonBg}
                >
                  <Text style={styles.modalButtonTextPrimary}>OK</Text>
                </CachedImageBackground>
              </TouchableOpacity>
            )}
          </CachedImageBackground>
        </View>
      </InlineModal>
      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={handleDisconnect}
      />
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
  topRight: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
  },
  settingsBtn: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIconImage: {
    width: 30,
    height: 30,
    marginBottom: 4,
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
  backButtonAbsolute: {
    position: 'absolute',
    top: 24,
    left: 16,
    zIndex: 10,
  },
  backButtonMobile: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonTextMobile: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
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
    width: 360,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#3d2b1f',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonBg: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1f2f1a',
    textAlign: 'center',
  },
  modalButtonTextSecondary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
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
    width: 860,
    padding: 50,
  },
  modalTitle: {
    fontSize: 52,
    marginBottom: 16,
  },
  modalText: {
    fontSize: 34,
    lineHeight: 46,
    marginBottom: 22,
  },
  modalHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    marginTop: 8,
  },
  modalHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHintIcon: {
    width: 72,
    height: 72,
  },
  modalHintLabel: {
    fontFamily: Typography.button,
    fontSize: 28,
    color: '#3d2b1f',
  },
});
