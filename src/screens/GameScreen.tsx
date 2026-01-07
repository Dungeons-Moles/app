import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

/**
 * GameScreen - Container for exploration gameplay
 * Displays the dungeon map and D-pad controls in landscape orientation
 */
export function GameScreen({ navigation }: GameScreenProps) {
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        {/* Map Placeholder */}
        <View style={styles.mapArea}>
          <Text style={styles.placeholderText}>Map Renderer</Text>
        </View>

        {/* Controls Placeholder */}
        <View style={styles.controlsArea}>
          <Text style={styles.placeholderText}>D-Pad Controls</Text>
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
  mapArea: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2a2a30',
  },
  controlsArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#151518',
  },
  placeholderText: {
    fontSize: 14,
    color: '#555555',
  },
});
