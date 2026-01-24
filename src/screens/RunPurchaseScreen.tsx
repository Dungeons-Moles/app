/**
 * RunPurchaseScreen - Purchase runs flow
 * T068: Create RunPurchaseScreen in src/screens/RunPurchaseScreen.tsx (pricing, confirm, success)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useProfile } from '../contexts/ProfileContext';
import { Typography } from '../theme/typography';
import { promptTransactionRetry } from '../utils/transaction-alerts';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');

const RUN_PRICE_SOL = 0.001;
const RUNS_PER_PURCHASE = 20;

type RunPurchaseScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RunPurchase'>;
};

export function RunPurchaseScreen({ navigation }: RunPurchaseScreenProps) {
  const { profile, purchaseRuns } = useProfile();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handlePurchase = async () => {
    let shouldRetry = true;

    while (shouldRetry) {
      shouldRetry = false;
      setIsPurchasing(true);
      setError(null);

      try {
        if (!purchaseRuns) {
          throw new Error('Purchase not available');
        }

        const result = await purchaseRuns();
        if (result?.success) {
          navigation.goBack();
          return;
        }

        const message = result?.error ?? 'Purchase failed';
        setError(message);
        shouldRetry = await promptTransactionRetry({
          title: 'Purchase Failed',
          message,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Purchase failed';
        setError(message);
        shouldRetry = await promptTransactionRetry({
          title: 'Purchase Failed',
          message,
        });
      } finally {
        setIsPurchasing(false);
      }
    }
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  const currentRuns = profile?.availableRuns ?? 0;

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            <Text style={styles.title}>Purchase Runs</Text>

            <View style={styles.infoContainer}>
              <Text style={styles.currentRunsLabel}>Current Runs</Text>
              <Text style={styles.currentRunsValue}>{currentRuns}</Text>
            </View>

            <View style={styles.purchaseCard}>
              <View style={styles.purchaseHeader}>
                <Text style={styles.runsAmount}>{RUNS_PER_PURCHASE}</Text>
                <Text style={styles.runsLabel}>Runs</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Price</Text>
                <Text style={styles.priceValue}>{RUN_PRICE_SOL} SOL</Text>
              </View>

              <Text style={styles.afterPurchase}>
                After purchase: {currentRuns + RUNS_PER_PURCHASE} runs
              </Text>
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
                disabled={isPurchasing}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.button,
                  styles.purchaseButton,
                  isPurchasing && styles.buttonDisabled,
                ]}
                onPress={handlePurchase}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.purchaseButtonText}>Purchase</Text>
                )}
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 32,
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  currentRunsLabel: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AAAAAA',
  },
  currentRunsValue: {
    fontFamily: Typography.number,
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  purchaseCard: {
    backgroundColor: 'rgba(40, 60, 80, 0.9)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#4488AA',
    alignItems: 'center',
  },
  purchaseHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  runsAmount: {
    fontFamily: Typography.number,
    fontSize: 56,
    fontWeight: 'bold',
    color: '#44AAFF',
  },
  runsLabel: {
    fontFamily: Typography.body,
    fontSize: 18,
    color: '#88CCFF',
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: '#4488AA',
    marginVertical: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  priceLabel: {
    fontFamily: Typography.body,
    fontSize: 18,
    color: '#AAAAAA',
  },
  priceValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  afterPurchase: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#88CC88',
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(139, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#AA4444',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#FF6666',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(80, 80, 80, 0.8)',
    borderWidth: 1,
    borderColor: '#666666',
  },
  purchaseButton: {
    backgroundColor: '#4488AA',
    borderWidth: 2,
    borderColor: '#66AACC',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#CCCCCC',
  },
  purchaseButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
