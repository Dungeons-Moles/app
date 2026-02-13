import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { parseGauntletEvents } from '@/services/solana/gauntlet';
import { GAMEPLAY_STATE_PROGRAM_ID } from '@/services/solana/constants';
import { Typography } from '@/theme/typography';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');

const PAGE_SIZE = 60;
const MAX_PAGES = 8;
const DEFAULT_MATCHES = 25;

type GauntletHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GauntletHistory'>;
};

interface GauntletHistoryItem {
  signature: string;
  playedAtUnix: number | null;
  week: number;
  result: 'WIN' | 'LOSS';
  turnsTaken: number;
  sourceLabel: string;
  completedRun: boolean;
}

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}..${wallet.slice(-4)}`;
}

export function GauntletHistoryScreen({ navigation }: GauntletHistoryScreenProps) {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const [items, setItems] = useState<GauntletHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = useCallback((unixTs: number | null) => {
    if (!unixTs) return 'Unknown date';
    return new Date(unixTs * 1000).toLocaleString();
  }, []);

  const loadHistory = useCallback(async () => {
    if (!wallet.publicKey) {
      setError('Connect a wallet to view gauntlet history.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ourKey = wallet.publicKey.toBase58();
      const signaturesById = new Map<string, { signature: string; slot: number; blockTime: number | null }>();
      const [walletSigs, programSigs] = await Promise.all([
        connection.getSignaturesForAddress(wallet.publicKey, { limit: PAGE_SIZE }, 'confirmed'),
        connection.getSignaturesForAddress(GAMEPLAY_STATE_PROGRAM_ID, { limit: PAGE_SIZE * MAX_PAGES }, 'confirmed'),
      ]);

      for (const sig of [...walletSigs, ...programSigs]) {
        if (!signaturesById.has(sig.signature)) {
          signaturesById.set(sig.signature, {
            signature: sig.signature,
            slot: sig.slot ?? 0,
            blockTime: sig.blockTime ?? null,
          });
        }
      }

      const ordered = Array.from(signaturesById.values()).sort((a, b) => b.slot - a.slot);
      const history: GauntletHistoryItem[] = [];

      for (const sigInfo of ordered) {
        const events = await parseGauntletEvents(connection, sigInfo.signature);
        const visual = events.combatVisual;
        if (!visual) continue;
        if (visual.player.toBase58() !== ourKey) continue;

        const source = events.weekEchoSelected?.sourcePlayer
          ? `Echo: ${shortWallet(events.weekEchoSelected.sourcePlayer.toBase58())}`
          : 'Echo: Bootstrap';

        const completedRun = Boolean(
          events.weekAdvanced?.completed || events.runEnded?.completed
        );

        history.push({
          signature: sigInfo.signature,
          playedAtUnix: sigInfo.blockTime ?? null,
          week: visual.week,
          result: visual.playerWon ? 'WIN' : 'LOSS',
          turnsTaken: visual.turnsTaken,
          sourceLabel: source,
          completedRun,
        });

        if (history.length >= DEFAULT_MATCHES) break;
      }

      setItems(history);
    } catch (err) {
      console.error('[GauntletHistory] Failed to load history:', err);
      setError('Failed to load gauntlet history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const hasData = useMemo(() => items.length > 0, [items.length]);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            <Text style={styles.title}>GAUNTLET HISTORY</Text>

            {isLoading ? (
              <ActivityIndicator color="#FABC0F" size="large" />
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : !hasData ? (
              <Text style={styles.emptyText}>No gauntlet fights found yet.</Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item.signature}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={styles.resultText}>
                      {item.result} - Week {item.week}
                    </Text>
                    <Text style={styles.metaText}>{item.sourceLabel}</Text>
                    <Text style={styles.metaText}>Turns: {item.turnsTaken}</Text>
                    <Text style={styles.metaText}>
                      Run Completed: {item.completedRun ? 'Yes' : 'No'}
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
              <TouchableOpacity onPress={() => void loadHistory()} activeOpacity={0.7} disabled={isLoading}>
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
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
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
  listContent: { padding: 12 },
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
