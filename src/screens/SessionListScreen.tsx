/**
 * SessionListScreen - List all active sessions with management options
 * T063: Create SessionListScreen in src/screens/SessionListScreen.tsx (list all sessions)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
  Pressable,
  Animated,
  Alert,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { SessionCard } from '../components/session/SessionCard';
import { useSessionList } from '../hooks/useSessionList';
import { Typography } from '../theme/typography';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');

type SessionListScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'SessionList'>;
};

export function SessionListScreen({ navigation }: SessionListScreenProps) {
  const { activeLevels, sessionCount, isLoading, error, refresh } = useSessionList();
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleContinue = useCallback(
    (level: number) => {
      // Navigate to game screen with session context
      // The game screen will load the appropriate session
      navigation.navigate('Game');
    },
    [navigation]
  );

  const handleAbandon = useCallback(
    (level: number) => {
      Alert.alert(
        'Abandon Session?',
        `This will end your Level ${level} run and use 1 run. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Abandon',
            style: 'destructive',
            onPress: async () => {
              // TODO: Implement abandon via useSessionList
              console.log('[SessionListScreen] Abandoning level', level);
              await refresh();
            },
          },
        ]
      );
    },
    [refresh]
  );

  const handleStartNew = useCallback(() => {
    navigation.navigate('CampaignSelect');
  }, [navigation]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Create mock session data from active levels
  // In a real implementation, this would come from the hook with full session data
  const mockSessions = activeLevels.map((level) => ({
    sessionPda: `session-${level}`,
    level,
    week: 1 as const,
    phase: 0,
    positionX: 0,
    positionY: 0,
    movesRemaining: 30,
    lastPlayedAt: Date.now(),
  }));

  return (
    <View style={styles.container}>
      <ImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.darkOverlay}>
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable style={styles.backButton} onPress={handleBack}>
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.title}>Active Sessions</Text>
              <View style={styles.headerSpacer} />
            </View>

            {/* Session count */}
            <View style={styles.countContainer}>
              <Text style={styles.countText}>
                {sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'}
              </Text>
            </View>

            {/* Error display */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Session list */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />
              }
            >
              {mockSessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📋</Text>
                  <Text style={styles.emptyTitle}>No Active Sessions</Text>
                  <Text style={styles.emptyText}>
                    Start a new campaign to begin your adventure!
                  </Text>
                </View>
              ) : (
                mockSessions.map((session) => (
                  <SessionCard
                    key={session.sessionPda}
                    session={session}
                    onContinue={() => handleContinue(session.level)}
                    onAbandon={() => handleAbandon(session.level)}
                    disabled={isLoading}
                  />
                ))
              )}
            </ScrollView>

            {/* Start new session button */}
            <View style={styles.footer}>
              <Pressable style={styles.startButton} onPress={handleStartNew}>
                <Text style={styles.startButtonText}>Start New Campaign</Text>
              </Pressable>
            </View>
          </Animated.View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  content: {
    flex: 1,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#88AACC',
  },
  title: {
    flex: 1,
    fontFamily: Typography.header,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60, // Match back button width
  },
  countContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  countText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AAAAAA',
  },
  errorContainer: {
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#AA4444',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#FF6666',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: Typography.header,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334455',
  },
  startButton: {
    backgroundColor: '#448844',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#66AA66',
  },
  startButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
