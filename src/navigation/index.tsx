import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountScreen } from '../screens/AccountScreen';
import { HubScreen } from '../screens/HubScreen';

export type RootStackParamList = {
  Account: undefined;
  Hub: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Account"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0f0f1a' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="Hub" component={HubScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
