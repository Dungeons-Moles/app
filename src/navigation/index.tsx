import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoadingScreen } from '../screens/LoadingScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { HubScreen } from '../screens/HubScreen';
import { CampaignSelectScreen } from '../screens/CampaignSelectScreen';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen';
import { GameScreen } from '../screens/GameScreen';
import { CombatScreen } from '../screens/CombatScreen';
import { DeathScreen } from '../screens/DeathScreen';
import { VictoryScreen } from '../screens/VictoryScreen';
import { RunPurchaseScreen } from '../screens/RunPurchaseScreen';
import { SessionListScreen } from '../screens/SessionListScreen';
import { ItemCollectionScreen } from '../screens/ItemCollectionScreen';
import type { CombatReplay } from '../services/solana/types/combat_events';
import type { ItemStats } from '../game/engine/types';

/** Item unlock data for victory screen */
export interface UnlockedItem {
  name: string;
  emoji: string;
  stats?: ItemStats;
}

export type RootStackParamList = {
  Loading: undefined;
  Account: undefined;
  Hub: undefined;
  CampaignSelect: undefined;
  ProfileSettings: undefined;
  Game: undefined;
  Combat: undefined;
  Death: {
    replay?: CombatReplay;
    totalMoves?: number;
    level?: number;
    week?: number;
    phase?: string;
    killedBy?: string;
  };
  Victory: {
    replay?: CombatReplay;
    level?: number;
    totalMoves?: number;
    levelUnlocked?: number;
    itemUnlocked?: UnlockedItem;
  };
  RunPurchase: undefined;
  SessionList: undefined;
  ItemCollection: undefined;
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
        <Stack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
        <Stack.Screen name="Game" component={GameScreen} />
        <Stack.Screen name="Combat" component={CombatScreen} />
        <Stack.Screen name="Death" component={DeathScreen} />
        <Stack.Screen name="Victory" component={VictoryScreen} />
        <Stack.Screen name="RunPurchase" component={RunPurchaseScreen} />
        <Stack.Screen name="SessionList" component={SessionListScreen} />
        <Stack.Screen name="ItemCollection" component={ItemCollectionScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
