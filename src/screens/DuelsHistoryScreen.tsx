import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useDuels } from '@/hooks/useDuels';
import { Typography } from '@/theme/typography';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');

type DuelsHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DuelsHistory'>;
};

export function DuelsHistoryScreen({ navigation }: DuelsHistoryScreenProps) {
  const duels = useDuels();

  useEffect(() => {
    void duels.loadHistory();
  }, [duels.loadHistory]);

  const hasData = useMemo(() => duels.history.length > 0, [duels.history.length]);

  const formatDate = (unixTs: number | null) => {
    if (!unixTs) return 'Unknown date';
    return new Date(unixTs * 1000).toLocaleString();
  };

  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toFixed(3);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            <Text style={styles.title}>DUELS HISTORY</Text>

            {duels.isHistoryLoading ? (
              <ActivityIndicator color="#FABC0F" size="large" />
            ) : duels.historyError ? (
              <Text style={styles.errorText}>{duels.historyError}</Text>
            ) : !hasData ? (
              <Text style={styles.emptyText}>No Duels matches found yet.</Text>
            ) : (
              <FlatList
                data={duels.history}
                keyExtractor={(item) => item.signature}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={styles.resultText}>
                      {item.isWinner ? 'WIN' : 'LOSS'} vs {item.opponentProfileName}
                    </Text>
                    <Text style={styles.metaText}>Seed: {item.seed.toString()}</Text>
                    <Text style={styles.metaText}>Resolution: {item.resolution}</Text>
                    <Text style={styles.metaText}>Turns: {item.turnsTaken ?? '-'}</Text>
                    <Text style={styles.metaText}>
                      Payout: {formatSol(item.winnerPayoutLamports)} SOL
                    </Text>
                    <Text style={styles.metaText}>{formatDate(item.playedAtUnix)}</Text>
                  </View>
                )}
              />
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ImageBackground source={buttonV1Source} style={styles.actionButton} resizeMode="stretch">
                  <Text style={styles.buttonText}>Back</Text>
                </ImageBackground>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void duels.loadHistory()} activeOpacity={0.7}>
                <ImageBackground source={buttonV4Source} style={styles.actionButton} resizeMode="stretch">
                  <Text style={styles.buttonTextPrimary}>Refresh</Text>
                </ImageBackground>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerContent: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 30,
    color: '#FABC0F',
    marginBottom: 16,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 420,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
  },
  listContent: {
    padding: 12,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
  },
  resultText: {
    fontFamily: Typography.body,
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: '700',
  },
  metaText: {
    fontFamily: Typography.body,
    color: '#c0c0c0',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: Typography.body,
    color: '#bdbdbd',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    color: '#ff8f8f',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    width: 140,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  buttonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
  },
});
