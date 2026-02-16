import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useDuels } from '@/hooks/useDuels';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { Typography } from '@/theme/typography';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const DUELS_TITLE = require('../../assets/ui/text/duels.png');
const HISTORY_TITLE = require('../../assets/ui/text/history.png');
const HISTORY_SCROLL = require('../../assets/ui/illustrations/history-scroll.png');
const RECTANGLE_FRAME = require('../../assets/ui/frames/rectangle.png');
const GREEN_BRUSH = require('../../assets/ui/illustrations/green-brush.png');
const RED_BRUSH = require('../../assets/ui/illustrations/red-brush.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');


type DuelsHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DuelsHistory'>;
};

export function DuelsHistoryScreen({ navigation }: DuelsHistoryScreenProps) {
  const duels = useDuels();
  const isCompact = useScreenVariant() === 'compact';

  useEffect(() => {
    void duels.loadHistory();
  }, []);

  const historyData = duels.history;
  const hasData = useMemo(() => historyData.length > 0, [historyData.length]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  useControllerAction(
    {
      onB: handleBack,
      onA: () => void duels.loadHistory(),
    },
    isController,
  );

  const controllerHints: ButtonHint[] = [
    { button: 'A', label: 'Refresh' },
    { button: 'B', label: 'Back' },
  ];

  const formatDate = (unixTs: number | null) => {
    if (!unixTs) return '—';
    return new Date(unixTs * 1000).toLocaleString();
  };

  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toFixed(3);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, isCompact && compactStyles.header]}>
            {isController ? (
              <View style={[styles.headerButton, isCompact && compactStyles.headerButton]} />
            ) : (
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV1Source}
                  style={[styles.headerButton, isCompact && compactStyles.headerButton]}
                  resizeMode="stretch"
                >
                  <Text
                    style={[styles.headerButtonText, isCompact && compactStyles.headerButtonText]}
                  >
                    Back
                  </Text>
                </ImageBackground>
              </TouchableOpacity>
            )}
            {!isCompact && (
              <View style={styles.titleRow}>
                <Image
                  source={DUELS_TITLE}
                  style={styles.titleImage}
                  resizeMode="contain"
                />
                <Image
                  source={HISTORY_TITLE}
                  style={styles.historyTitleImage}
                  resizeMode="contain"
                />
              </View>
            )}
            {!isCompact && <View style={styles.headerButtonPlaceholder} />}
            {isCompact && <View style={styles.headerSpacer} />}
          </View>

          {/* Title row — compact only (separate from header) */}
          {isCompact && (
            <View style={compactStyles.titleRow}>
              <Image
                source={DUELS_TITLE}
                style={compactStyles.titleImage}
                resizeMode="contain"
              />
              <Image
                source={HISTORY_TITLE}
                style={compactStyles.historyTitleImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Scroll with history data */}
          <View style={[styles.centerContent, isCompact && compactStyles.centerContent]}>
            <View style={[styles.scrollWrapper, isCompact && compactStyles.scrollWrapper]}>
              <Image
                source={HISTORY_SCROLL}
                style={styles.scrollImage}
                resizeMode="stretch"
              />
              <View style={[styles.scrollOverlay, isCompact && compactStyles.scrollOverlay]}>
                {duels.isHistoryLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#000000" size="large" />
                  </View>
                ) : duels.historyError ? (
                  <Text style={styles.errorText}>{duels.historyError}</Text>
                ) : !hasData ? (
                  <View style={styles.emptyWrapper}>
                    <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>No Duels matches found yet.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={historyData}
                    keyExtractor={(item) => item.signature}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                      styles.listContent,
                      isCompact && compactStyles.listContent,
                    ]}
                    renderItem={({ item }) => (
                      <View style={styles.rowOuter}>
                        <Image
                          source={RECTANGLE_FRAME}
                          style={styles.rowFrame}
                          resizeMode="stretch"
                        />
                        <View style={[styles.rowInner, isCompact && compactStyles.rowInner]}>
                          <View style={styles.resultRow}>
                            <View style={styles.brushWrapper}>
                              <Image
                                source={item.isWinner ? GREEN_BRUSH : RED_BRUSH}
                                style={styles.brushImage}
                                resizeMode="stretch"
                              />
                              <Text
                                style={[
                                  styles.resultLabel,
                                  isCompact && compactStyles.resultLabel,
                                ]}
                              >
                                {item.isWinner ? 'WIN' : 'LOSS'}
                              </Text>
                            </View>
                            <Text style={[styles.resultText, isCompact && compactStyles.resultText]}>
                              vs {item.opponentProfileName}
                            </Text>
                          </View>
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaText, isCompact && compactStyles.metaText]}>
                              Payout: {item.isWinner ? formatSol(item.winnerPayoutLamports) : '0.000'} SOL
                            </Text>
                            <Text style={[styles.metaText, isCompact && compactStyles.metaText]}>
                              {formatDate(item.playedAtUnix)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  />
                )}
              </View>
            </View>
          </View>

        </View>
      </ImageBackground>
      <ControllerHints hints={controllerHints} horizontal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  stainsOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  headerButton: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonPlaceholder: {
    width: 90,
  },
  headerSpacer: { flex: 1 },
  headerButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleImage: {
    width: 110,
    height: 35,
  },
  historyTitleImage: {
    width: 125,
    height: 40,
    marginTop: 5,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  scrollWrapper: {
    width: '90%',
    maxWidth: 520,
    flex: 1,
  },
  scrollImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  scrollOverlay: {
    flex: 1,
    paddingHorizontal: 36,
    paddingTop: 24,
    paddingBottom: 16,
  },
  listContent: {
    paddingBottom: 16,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  rowOuter: {
    position: 'relative',
  },
  rowFrame: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  rowInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brushWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  brushImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  resultText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#000000',
  },
  resultLabel: {
    fontFamily: Typography.body,
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaText: {
    fontFamily: Typography.body,
    color: '#000000',
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.body,
    color: '#000000',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    color: '#c0392b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});

const compactStyles = StyleSheet.create({
  header: {
    marginTop: 12,
  },
  headerButton: {
    width: 140,
    height: 76,
  },
  headerButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  titleImage: {
    width: 260,
    height: 80,
  },
  historyTitleImage: {
    width: 290,
    height: 88,
    marginTop: 5,
  },
  centerContent: {
    justifyContent: 'center',
  },
  scrollWrapper: {
    maxWidth: 900,
    maxHeight: 540,
  },
  scrollOverlay: {
    paddingHorizontal: 76,
    paddingTop: 56,
    paddingBottom: 44,
  },
  listContent: {
    gap: 12,
  },
  rowInner: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  resultText: {
    fontSize: 32,
  },
  resultLabel: {
    fontSize: 36,
  },
  metaText: {
    fontSize: 22,
  },
  emptyText: {
    fontSize: 28,
  },
});
