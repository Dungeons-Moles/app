import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const sessionPapersSource = require('../../assets/ui/illustrations/session-papers.png');
const rectangleSource = require('../../assets/ui/frames/rectangle.png');

type MarketplaceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Marketplace'>;
};

type Tab = 'skins' | 'items' | 'pve';

export function MarketplaceScreen({ navigation }: MarketplaceScreenProps) {
  const { purchaseRuns, availableRuns } = useProfile();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const [activeTab, setActiveTab] = useState<Tab>('pve');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handlePurchase = useCallback(async () => {
    setIsPurchasing(true);
    setPurchaseError(null);
    try {
      const result = await purchaseRuns();
      if (!result?.success) {
        setPurchaseError(result?.error ?? 'Purchase failed');
      }
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setIsPurchasing(false);
    }
  }, [purchaseRuns]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={backgroundImage}
        style={styles.backgroundImage}
        resizeMode="stretch"
      />

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
            <ImageBackground
              source={buttonV1Source}
              style={[styles.backButton, isCompact && compactStyles.backButton]}
              resizeMode="stretch"
            >
              <Text style={[styles.backButtonText, isCompact && compactStyles.backButtonText]}>
                Back
              </Text>
            </ImageBackground>
          </TouchableOpacity>

          <ImageBackground
            source={buttonV4Source}
            style={[styles.titlePanel, isCompact && compactStyles.titlePanel]}
            resizeMode="stretch"
          >
            <Text style={[styles.title, isCompact && compactStyles.title]}>Marketplace</Text>
          </ImageBackground>

          <View style={[styles.headerSpacer, isCompact && compactStyles.headerSpacer]} />
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, isCompact && compactStyles.tabs]}>
          {(['skins', 'items', 'pve'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab);
                setPurchaseError(null);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  isCompact && compactStyles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab === 'pve' ? 'PvE' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'skins' && (
            <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>
              Coming Soon
            </Text>
          )}
          {activeTab === 'items' && (
            <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>
              Coming Soon
            </Text>
          )}
          {activeTab === 'pve' && (
            <View style={styles.pveContent}>
              <Image
                source={sessionPapersSource}
                style={[styles.sessionImage, isCompact && compactStyles.sessionImage]}
                resizeMode="contain"
              />

              <Text style={[styles.priceText, isCompact && compactStyles.priceText]}>
                Price: 0.005 SOL
              </Text>

              {purchaseError && (
                <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                  {purchaseError}
                </Text>
              )}

              <TouchableOpacity
                onPress={handlePurchase}
                activeOpacity={0.7}
                disabled={isPurchasing}
              >
                <ImageBackground
                  source={buttonV3Source}
                  style={[
                    styles.purchaseButton,
                    isCompact && compactStyles.purchaseButton,
                    isPurchasing && { opacity: 0.6 },
                  ]}
                  resizeMode="stretch"
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#1a1a1a" size={isCompact ? 'large' : 'small'} />
                  ) : (
                    <Text
                      style={[
                        styles.purchaseButtonText,
                        isCompact && compactStyles.purchaseButtonText,
                      ]}
                    >
                      Purchase
                    </Text>
                  )}
                </ImageBackground>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Bottom-right sessions counter — PvE tab only */}
      {activeTab === 'pve' && (
        <View style={[styles.sessionsContainer, isCompact && compactStyles.sessionsContainer]}>
          <ImageBackground
            source={rectangleSource}
            style={[styles.sessionsFrame, isCompact && compactStyles.sessionsFrame]}
            resizeMode="stretch"
          >
            <Text style={[styles.sessionsText, isCompact && compactStyles.sessionsText]}>
              Current: {availableRuns} Sessions
            </Text>
          </ImageBackground>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6d5b8',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    marginBottom: 4,
  },
  titlePanel: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 60,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 20,
  },
  headerSpacer: {
    width: 80,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3d2b1f',
  },
  tabText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#8a7a6a',
  },
  tabTextActive: {
    color: '#3d2b1f',
  },
  tabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#8a7a6a',
  },
  pveContent: {
    alignItems: 'center',
    gap: 12,
    marginTop: -40,
  },
  sessionImage: {
    width: 175,
    height: 112,
  },
  priceText: {
    fontFamily: Typography.number,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3d2b1f',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#a33a3a',
    textAlign: 'center',
  },
  purchaseButton: {
    width: 140,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchaseButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sessionsContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
  },
  sessionsFrame: {
    width: 185,
    height: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionsText: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#1a1a1a',
  },
});

const compactStyles = StyleSheet.create({
  content: {
    paddingTop: 36,
    paddingHorizontal: 28,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    width: 140,
    height: 76,
  },
  backButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titlePanel: {
    width: 320,
    height: 100,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 36,
  },
  headerSpacer: {
    width: 140,
  },
  tabs: {
    gap: 12,
    marginBottom: 32,
  },
  tabText: {
    fontSize: 24,
  },
  comingSoonText: {
    fontSize: 38,
  },
  sessionImage: {
    width: 620,
    height: 397,
  },
  priceText: {
    fontSize: 28,
  },
  errorText: {
    fontSize: 20,
  },
  purchaseButton: {
    width: 240,
    height: 80,
  },
  purchaseButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  sessionsContainer: {
    bottom: 28,
    right: 28,
  },
  sessionsFrame: {
    width: 320,
    height: 90,
  },
  sessionsText: {
    fontSize: 20,
  },
});
