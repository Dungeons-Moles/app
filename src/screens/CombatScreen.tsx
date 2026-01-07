import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * CombatScreen - Container for combat gameplay
 * Displays the combat arena, player/enemy panels, and combat log in landscape orientation
 */
export function CombatScreen({ navigation }: CombatScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      <View style={styles.content}>
        {/* Player Panel Placeholder */}
        <View style={styles.sidePanel}>
          <Text style={styles.placeholderText}>Player Panel</Text>
        </View>

        {/* Combat Arena Placeholder */}
        <View style={styles.arenaArea}>
          <Text style={styles.placeholderText}>Combat Arena</Text>
        </View>

        {/* Enemy Panel Placeholder */}
        <View style={styles.sidePanel}>
          <Text style={styles.placeholderText}>Enemy Panel</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  sidePanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#151518',
    borderColor: '#2a2a30',
    borderWidth: 1,
  },
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#555555',
  },
});
