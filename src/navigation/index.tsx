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

export type RootStackParamList = {
  Loading: undefined;
  Account: undefined;
  Hub: undefined;
  CampaignSelect: undefined;
  ProfileSettings: undefined;
  Game: undefined;
  Combat: undefined;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
