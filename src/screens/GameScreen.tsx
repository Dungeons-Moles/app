import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { TopBar } from '../components/game';
import { useGame } from '../contexts/GameContext';

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * GameScreen - Container for exploration gameplay
 * Displays the dungeon map and D-pad controls in landscape orientation
 * @see T072: Wire up TopBar to GameScreen
 */
export function GameScreen({ navigation }: GameScreenProps) {
  const { state } = useGame();

  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      {/* Top Bar with week progress and boss preview (T072) */}
      {state?.time && <TopBar time={state.time} />}

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
