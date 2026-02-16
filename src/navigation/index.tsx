import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import type { CombatReplay, BackendCombatLogEntry } from '../services/solana/types/combat_events';
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
  /** Enemy definition ID (for rewards calculation) */
  enemyDefinitionId?: EnemyId;
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
  /** Player gold */
  playerGold?: number;
  /** Enemy gold (for PvP combat display/effects) */
  enemyGold?: number;
  /** Current week (for final boss detection) */
  week?: 1 | 2 | 3;
  /** Whether this is a boss fight */
  isBossFight?: boolean;
  /** Campaign level being played (1-40) */
  campaignLevel?: number;
  /** Cumulative total moves made in session */
  totalMoves?: number;
  /** Current phase number (on-chain Phase enum) */
  phase?: number;
  /** Combat log entries from on-chain (skip local resolver if present) */
  combatLog?: BackendCombatLogEntry[];
  /** Authoritative on-chain outcome (fallback when combat log is unavailable) */
  onChainOutcome?: {
    finalPlayerHp: number;
    finalPlayerGold: number;
    finalEnemyGold?: number;
    playerWon: boolean;
  };
  /** True when this combat is a post-run duel replay */
  duelReplay?: boolean;
  /** When true, skip zeroing ARM before log replay (drafted stats already include it) */
  preserveArmor?: boolean;
}

export type RootStackParamList = {
  Loading: undefined;
  Account: undefined;
  Hub: undefined;
  CampaignSelect: undefined;
  Game: undefined;
  Combat:
    | {
        /** Combat input data for on-chain mode (undefined for guest mode) */
        combatInput?: CombatParams;
      }
    | undefined;
  Death: {
    replay?: CombatReplay;
    totalMoves?: number;
    level?: number;
    week?: number;
    phase?: string;
    combatTurns?: number;
    killedBy?: string;
  };
  Victory: {
    replay?: CombatReplay;
    level?: number;
    totalMoves?: number;
    levelUnlocked?: number;
    itemUnlocked?: UnlockedItem;
  };
  PitDraft: undefined;
  PitDraftHistory: undefined;
  Duels: undefined;
  DuelsHistory: undefined;
  Gauntlet: undefined;
  GauntletHistory: undefined;
  GauntletRanking: undefined;
  Marketplace: undefined;
  Items: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Loading"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Loading" component={LoadingScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="Hub" component={HubScreen} />
        <Stack.Screen name="CampaignSelect" component={CampaignSelectScreen} />
        <Stack.Screen name="Game" component={GameScreen} />
        <Stack.Screen name="Combat" component={CombatScreen} />
        <Stack.Screen name="Death" component={DeathScreen} />
        <Stack.Screen name="Victory" component={VictoryScreen} />
        <Stack.Screen name="PitDraft" component={PitDraftScreen} />
        <Stack.Screen name="PitDraftHistory" component={PitDraftHistoryScreen} />
        <Stack.Screen name="Duels" component={DuelsScreen} />
        <Stack.Screen name="DuelsHistory" component={DuelsHistoryScreen} />
        <Stack.Screen name="Gauntlet" component={GauntletScreen} />
        <Stack.Screen name="GauntletHistory" component={GauntletHistoryScreen} />
        <Stack.Screen name="GauntletRanking" component={GauntletRankingScreen} />
        <Stack.Screen name="Marketplace" component={MarketplaceScreen} />
        <Stack.Screen name="Items" component={ItemsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
