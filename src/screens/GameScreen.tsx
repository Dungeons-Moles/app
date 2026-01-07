import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame } from '../contexts/GameContext';

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

export function GameScreen({ navigation }: GameScreenProps) {
  const { state } = useGame();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Dungeon Crawler</Text>
        <Text style={styles.phase}>
          Phase: {state?.phase ?? 'Not Started'}
        </Text>
        <Text style={styles.placeholder}>
          Map and controls will render here
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e0e0e0',
    marginBottom: 16,
  },
  phase: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});
