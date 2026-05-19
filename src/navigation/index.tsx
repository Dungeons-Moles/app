import React, { useCallback, useRef } from 'react';
import { Platform, View, Text, StyleSheet, Pressable } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { NavigationContainer, type NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Sentry from '@sentry/react-native';
import { sentryNavigationIntegration } from '../utils/sentry';
import { LoadingScreen } from '../screens/LoadingScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { HubScreen } from '../screens/HubScreen';
import { CampaignSelectScreen } from '../screens/CampaignSelectScreen';
import { GameScreen } from '../screens/GameScreen';
import { CombatScreen } from '../screens/CombatScreen';
import { DeathScreen } from '../screens/DeathScreen';
import { VictoryScreen } from '../screens/VictoryScreen';
import { PitDraftScreen } from '../screens/PitDraftScreen';
import { PitDraftHistoryScreen } from '../screens/PitDraftHistoryScreen';
import { DuelsScreen } from '../screens/DuelsScreen';
import { DuelsHistoryScreen } from '../screens/DuelsHistoryScreen';
import { GauntletScreen } from '../screens/GauntletScreen';
import { GauntletHistoryScreen } from '../screens/GauntletHistoryScreen';
import { GauntletRankingScreen } from '../screens/GauntletRankingScreen';
import { MarketplaceScreen } from '../screens/MarketplaceScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { SkinsScreen } from '../screens/SkinsScreen';
import { SessionLoadingScreen } from '../screens/SessionLoadingScreen';
import { BattleSimulatorScreen } from '../screens/BattleSimulatorScreen';
import type {
  ItemStats,
  BossId,
  Gear,
  Tool,
  ItemsetId,
  CombatantState,
} from '../game/engine/types';
import type { EnemyId } from '../game/map/types';

/** Item unlock data for victory screen */
export interface UnlockedItem {
  name: string;
  emoji: string;
  image?: ImageSourcePropType;
  stats?: ItemStats;
}

/** Combat input data for on-chain mode combat replay */
export interface CombatParams {
  /** Player combatant state before combat */
  player: CombatantState;
  /** Enemy combatant state */
  enemy: CombatantState;
  /** RNG seed for deterministic combat resolution */
  seed: number;
  /** Boss ID if fighting a boss */
  bossId?: BossId;
  /** Enemy trait ID for regular enemies */
  enemyId?: EnemyId;
  /** Enemy definition ID (for rewards, image lookup — accepts EnemyId, BossId, or 'pvpOpponent') */
  enemyDefinitionId?: EnemyId | BossId | string;
  /** Enemy tier (1, 2, or 3) */
  enemyTier?: 1 | 2 | 3;
  /** Gold reward for victory */
  goldReward?: number;
  /** Active itemsets */
  activeItemSets?: ItemsetId[];
  /** Player gear */
  playerGear?: Gear[];
  /** Player tool */
  playerTool?: Tool | null;
  /** Enemy active itemsets */
  enemyActiveItemSets?: ItemsetId[];
  /** Player gold */
  playerGold?: number;
  /** Enemy gold (for PvP combat display/effects) */
  enemyGold?: number;
  /** PvP-only final deterministic fallback when all tiebreak stats are identical */
  pvpTieBreakerFavorPlayer?: boolean;
  /** When true, the "player" slot acts first on speed ties (PvP: viewer is on-chain enemy) */
  pvpPlayerActsFirstOnTie?: boolean;
  /** Current week (for final boss/echo detection — gauntlet goes up to 5) */
  week?: number;
  /** Whether this is a boss fight */
  isBossFight?: boolean;
  /** Campaign level being played (1-40) */
  campaignLevel?: number;
  /** Cumulative total moves made in session */
  totalMoves?: number;
  /** Current phase number (on-chain Phase enum) */
  phase?: number;
  /** Authoritative on-chain outcome (fallback when combat log is unavailable) */
  onChainOutcome?: {
    finalPlayerHp: number;
    finalPlayerGold: number;
    finalEnemyGold?: number;
    playerWon: boolean;
  };
  /** True when this combat is a post-run duel replay */
  duelReplay?: boolean;
  /** True when replaying from a history screen (goBack on complete instead of Hub) */
  historyReplay?: boolean;
  /** When true, skip zeroing ARM before log replay (drafted stats already include it) */
  preserveArmor?: boolean;
  /** Enemy gear (for PvP replay panel display) */
  enemyGear?: Gear[];
  /** Enemy tool (for PvP replay panel display) */
  enemyTool?: Tool | null;
  /** Opponent equipped skin pubkey (base58) for PvP replay visuals */
  pvpOpponentSkinPubkey?: string | null;
  /** Local-only simulator flow: return to simulator instead of normal post-combat routing */
  simulatorMode?: boolean;
  /** Run mode (Campaign/Duel/Gauntlet) — preserved for post-combat navigation */
  runMode?: number;
  /** Enemies defeated count from on-chain state */
  enemiesDefeated?: number;
}

export type RootStackParamList = {
  Loading: undefined;
  Account: undefined;
  Hub: undefined;
  BattleSimulator: undefined;
  CampaignSelect: undefined;
  Game: undefined;
  Combat:
    | {
        /** Combat input data for on-chain mode (undefined for guest mode) */
        combatInput?: CombatParams;
      }
    | undefined;
  Death: {
    totalMoves?: number;
    level?: number;
    week?: number;
    phase?: string;
    enemiesDefeated?: number;
    killedBy?: string;
    runMode?: number;
  };
  Victory: {
    level?: number;
    totalMoves?: number;
    enemiesDefeated?: number;
    levelUnlocked?: number;
    itemUnlocked?: UnlockedItem;
    runMode?: number;
    gauntletPoints?: number;
  };
  PitDraft: undefined;
  PitDraftHistory: undefined;
  Duels: undefined;
  DuelsHistory: undefined;
  Gauntlet: undefined;
  GauntletHistory: undefined;
  GauntletRanking: { returnTo?: 'Hub' | 'Gauntlet' } | undefined;
  SessionLoading: { mode: 'campaign' | 'gauntlet' | 'duel'; forceLogo?: boolean } | undefined;
  Marketplace: undefined;
  Items: undefined;
  Skins: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const SCREEN_TITLES: Record<string, string> = {
  Loading: 'Loading',
  Account: 'Sign In',
  Hub: 'Hub',
  BattleSimulator: 'Battle Simulator',
  CampaignSelect: 'Campaign Select',
  Game: 'Game',
  Combat: 'Combat',
  Death: 'Death',
  Victory: 'Victory',
  PitDraft: 'Pit Draft',
  PitDraftHistory: 'Pit Draft History',
  Duels: 'Duels',
  DuelsHistory: 'Duels History',
  Gauntlet: 'Gauntlet',
  GauntletHistory: 'Gauntlet History',
  GauntletRanking: 'Gauntlet Ranking',
  SessionLoading: 'Loading Session',
  Marketplace: 'Marketplace',
  Items: 'Items',
  Skins: 'Skins',
};

function ScreenErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={errorStyles.container}>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.message}>An unexpected error occurred.</Text>
      <Pressable style={errorStyles.button} onPress={resetError}>
        <Text style={errorStyles.buttonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  title: { color: '#e0d5c1', fontSize: 22, fontFamily: 'IMFellEnglish-Regular', marginBottom: 8 },
  message: { color: '#a09080', fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 24 },
  button: { backgroundColor: '#3d2b1f', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 6 },
  buttonText: { color: '#e0d5c1', fontSize: 14, fontFamily: 'Inter-SemiBold' },
});

/** Wrap a screen component with Sentry error boundary for use with React Navigation */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSentryBoundary(Component: React.ComponentType<any>, screenName: string) {
  const Wrapped = Sentry.withErrorBoundary(Component, {
    fallback: ScreenErrorFallback,
    beforeCapture: (scope) => {
      scope.setTag('screen', screenName);
    },
  });
  Wrapped.displayName = `SentryBoundary(${screenName})`;
  return Wrapped;
}

// Pre-wrap all screens with Sentry error boundaries (outside render to avoid remounting)
const SentryLoadingScreen = withSentryBoundary(LoadingScreen, 'Loading');
const SentryAccountScreen = withSentryBoundary(AccountScreen, 'Account');
const SentryHubScreen = withSentryBoundary(HubScreen, 'Hub');
const SentryBattleSimulatorScreen = withSentryBoundary(BattleSimulatorScreen, 'BattleSimulator');
const SentryCampaignSelectScreen = withSentryBoundary(CampaignSelectScreen, 'CampaignSelect');
const SentryGameScreen = withSentryBoundary(GameScreen, 'Game');
const SentryCombatScreen = withSentryBoundary(CombatScreen, 'Combat');
const SentryDeathScreen = withSentryBoundary(DeathScreen, 'Death');
const SentryVictoryScreen = withSentryBoundary(VictoryScreen, 'Victory');
const SentryPitDraftScreen = withSentryBoundary(PitDraftScreen, 'PitDraft');
const SentryPitDraftHistoryScreen = withSentryBoundary(PitDraftHistoryScreen, 'PitDraftHistory');
const SentryDuelsScreen = withSentryBoundary(DuelsScreen, 'Duels');
const SentryDuelsHistoryScreen = withSentryBoundary(DuelsHistoryScreen, 'DuelsHistory');
const SentryGauntletScreen = withSentryBoundary(GauntletScreen, 'Gauntlet');
const SentryGauntletHistoryScreen = withSentryBoundary(GauntletHistoryScreen, 'GauntletHistory');
const SentryGauntletRankingScreen = withSentryBoundary(GauntletRankingScreen, 'GauntletRanking');
const SentrySessionLoadingScreen = withSentryBoundary(SessionLoadingScreen, 'SessionLoading');
const SentryMarketplaceScreen = withSentryBoundary(MarketplaceScreen, 'Marketplace');
const SentryItemsScreen = withSentryBoundary(ItemsScreen, 'Items');
const SentrySkinsScreen = withSentryBoundary(SkinsScreen, 'Skins');

function getActiveRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index];
  if (route.state) return getActiveRouteName(route.state as NavigationState);
  return route.name;
}

export function AppNavigator() {
  const navigationRef = useRef<any>(null);

  const onStateChange = useCallback((state: NavigationState | undefined) => {
    if (Platform.OS !== 'web') return;
    const routeName = getActiveRouteName(state);
    const title = routeName ? (SCREEN_TITLES[routeName] ?? routeName) : '';
    document.title = title ? `Dungeons & Moles - ${title}` : 'Dungeons & Moles';
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        sentryNavigationIntegration.registerNavigationContainer(navigationRef);
      }}
      onStateChange={onStateChange}>
      <Stack.Navigator
        initialRouteName="Loading"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Loading" component={SentryLoadingScreen} />
        <Stack.Screen name="Account" component={SentryAccountScreen} />
        <Stack.Screen name="Hub" component={SentryHubScreen} />
        {__DEV__ && <Stack.Screen name="BattleSimulator" component={SentryBattleSimulatorScreen} />}
        <Stack.Screen name="CampaignSelect" component={SentryCampaignSelectScreen} />
        <Stack.Screen name="Game" component={SentryGameScreen} />
        <Stack.Screen name="Combat" component={SentryCombatScreen} />
        <Stack.Screen name="Death" component={SentryDeathScreen} />
        <Stack.Screen name="Victory" component={SentryVictoryScreen} />
        <Stack.Screen name="PitDraft" component={SentryPitDraftScreen} />
        <Stack.Screen name="PitDraftHistory" component={SentryPitDraftHistoryScreen} />
        <Stack.Screen name="Duels" component={SentryDuelsScreen} />
        <Stack.Screen name="DuelsHistory" component={SentryDuelsHistoryScreen} />
        <Stack.Screen name="Gauntlet" component={SentryGauntletScreen} />
        <Stack.Screen name="GauntletHistory" component={SentryGauntletHistoryScreen} />
        <Stack.Screen name="GauntletRanking" component={SentryGauntletRankingScreen} />
        <Stack.Screen name="SessionLoading" component={SentrySessionLoadingScreen} />
        <Stack.Screen name="Marketplace" component={SentryMarketplaceScreen} />
        <Stack.Screen name="Items" component={SentryItemsScreen} />
        <Stack.Screen name="Skins" component={SentrySkinsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
