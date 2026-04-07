import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
  ScrollView,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useProfile } from '../contexts/ProfileContext';
import { useWallet } from '../contexts/WalletContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { useNftMarketplace } from '../hooks/useNftMarketplace';
import { useAudio } from '../contexts/AudioContext';
import { NftCard } from '../components/marketplace/NftCard';
import { PriceInput } from '../components/marketplace/PriceInput';
import { InlineModal } from '../components/InlineModal';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MetaplexCoreAsset, ListingWithAsset } from '../types/solana';
import { findNftItemInfo } from '../data/nftItems';
import { getSkinImage } from '../data/skinImages';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.webp');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.webp');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.webp');
const sessionPapersSource = require('../../assets/ui/illustrations/session-papers.webp');
const rectangleSource = require('../../assets/ui/frames/rectangle.webp');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.webp');
const iconL1Source = require('../../assets/ui/control-buttons/l1.webp');
const iconR1Source = require('../../assets/ui/control-buttons/r1.webp');
const arrowIcon = require('../../assets/icons/ui/normal-speed.webp');
const engineImageSource = require('../../assets/ui/illustrations/engine.webp');
const yellowBrushSource = require('../../assets/ui/illustrations/yellow-brush.webp');
const marketplaceTitleSource = require('../../assets/ui/text/marketplace.webp');

type MarketplaceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Marketplace'>;
};

type Tab = 'skins' | 'items' | 'pve';

export function MarketplaceScreen({ navigation }: MarketplaceScreenProps) {
  const { purchaseRuns, availableRuns, profile } = useProfile();
  const { disconnect } = useWallet();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const { height: windowHeight } = useWindowDimensions();
  // Scale session image based on screen height — full size at 412dp (Seeker), smaller on shorter screens
  const sessionImageScale = isCompact ? 1 : Math.min(1, windowHeight / 412);
  const sessionImageWidth = Math.round(262 * sessionImageScale);
  const sessionImageHeight = Math.round(168 * sessionImageScale);
  const [activeTab, setActiveTab] = useState<Tab>('pve');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    userSkins,
    userNftItems,
    listings,
    marketplaceConfig,
    isLoading: marketplaceLoading,
    error: marketplaceError,
    fetchUserAssets,
    fetchListings,
    listNft,
    cancelListing,
    buyNft,
    refresh: refreshMarketplace,
  } = useNftMarketplace();
  const { playSfx } = useAudio();

  const [showPriceInput, setShowPriceInput] = useState(false);
  const [selectedNft, setSelectedNft] = useState<{
    asset: MetaplexCoreAsset;
    collection: any;
  } | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (activeTab === 'skins' || activeTab === 'items') {
      refreshMarketplace();
    }
  }, [activeTab]);

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    navigation.goBack();
  }, [navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  const handlePurchaseDirect = useCallback(async () => {
    playSfx('ui_click');
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
  }, [purchaseRuns, playSfx]);

  const handlePurchase = useCallback(async () => {
    await handlePurchaseDirect();
  }, [handlePurchaseDirect]);

  const handleListForSale = useCallback(
    (asset: MetaplexCoreAsset, collection: any) => {
      playSfx('ui_click');
      setSelectedNft({ asset, collection });
      setShowPriceInput(true);
    },
    [playSfx]
  );

  const handleConfirmListing = useCallback(
    async (priceSol: number) => {
      playSfx('ui_click');
      if (!selectedNft) return;
      const priceLamports = Math.round(priceSol * LAMPORTS_PER_SOL);
      await listNft(selectedNft.asset.address, selectedNft.collection, priceLamports);
      setShowPriceInput(false);
      setSelectedNft(null);
    },
    [listNft, selectedNft, playSfx]
  );

  const handleCancelListing = useCallback(
    async (listing: ListingWithAsset) => {
      playSfx('ui_click');
      await cancelListing(listing.listing.asset, listing.listing.collection);
    },
    [cancelListing, playSfx]
  );

  const handleBuyNft = useCallback(
    async (listing: ListingWithAsset) => {
      playSfx('ui_click');
      await buyNft(listing);
    },
    [buyNft, playSfx]
  );

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isFocused = useIsFocused();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const TABS: Tab[] = ['skins', 'items', 'pve'];
  const [nftFocus, setNftFocus] = useState(0);
  const [sectionFocus, setSectionFocus] = useState<0 | 1>(0); // 0 = My, 1 = For Sale

  const cycleTab = useCallback(
    (dir: -1 | 1) => {
      playSfx('ui_hover');
      setActiveTab((prev) => {
        const idx = TABS.indexOf(prev);
        const next = idx + dir;
        if (next < 0 || next >= TABS.length) return prev;
        setPurchaseError(null);
        setNftFocus(0);
        setSectionFocus(0);
        return TABS[next];
      });
    },
    [playSfx]
  );

  // Sort skins: equipped first, then the rest
  const equippedSkinKey = profile?.equippedSkin?.toBase58() ?? null;
  const sortedSkins =
    activeTab === 'skins'
      ? [...userSkins].sort((a, b) => {
          const aEq = a.address.toBase58() === equippedSkinKey ? 0 : 1;
          const bEq = b.address.toBase58() === equippedSkinKey ? 0 : 1;
          return aEq - bEq;
        })
      : [];

  // Split listings by collection
  const skinsCollectionKey = marketplaceConfig?.skinsCollection?.toBase58() ?? null;
  const itemsCollectionKey = marketplaceConfig?.itemsCollection?.toBase58() ?? null;
  const skinListings = listings.filter(
    (l) => skinsCollectionKey && l.listing.collection.toBase58() === skinsCollectionKey
  );
  const itemListings = listings.filter(
    (l) => itemsCollectionKey && l.listing.collection.toBase58() === itemsCollectionKey
  );

  // Active section items for focus tracking
  const mySkinsCount = sortedSkins.length;
  const forSaleSkinsCount = skinListings.length;
  const myItemsCount = userNftItems.length;
  const forSaleItemsCount = itemListings.length;

  const activeSectionCount =
    activeTab === 'skins'
      ? sectionFocus === 0
        ? mySkinsCount
        : forSaleSkinsCount
      : activeTab === 'items'
        ? sectionFocus === 0
          ? myItemsCount
          : forSaleItemsCount
        : 0;

  const hasSections = activeTab === 'skins' || activeTab === 'items';

  const handleNftAction = useCallback(() => {
    if (activeTab === 'skins') {
      if (sectionFocus === 0) {
        const skin = sortedSkins[nftFocus];
        if (!skin) return;
        const isListed = skinListings.some((l) => l.listing.asset.equals(skin.address));
        const isEquipped = profile?.equippedSkin?.equals(skin.address) ?? false;
        if (!isListed && !isEquipped) handleListForSale(skin, skin.collection);
      } else {
        const listing = skinListings[nftFocus];
        if (!listing) return;
        const isOwnListing = userSkins.some((s) => s.address.equals(listing.listing.asset));
        if (isOwnListing) handleCancelListing(listing);
        else handleBuyNft(listing);
      }
    } else if (activeTab === 'items') {
      if (sectionFocus === 0) {
        const item = userNftItems[nftFocus];
        if (!item) return;
        const isListed = itemListings.some((l) => l.listing.asset.equals(item.address));
        if (!isListed) handleListForSale(item, item.collection);
      } else {
        const listing = itemListings[nftFocus];
        if (!listing) return;
        const isOwnListing = userNftItems.some((i) => i.address.equals(listing.listing.asset));
        if (isOwnListing) handleCancelListing(listing);
        else handleBuyNft(listing);
      }
    }
  }, [
    activeTab,
    sectionFocus,
    nftFocus,
    sortedSkins,
    skinListings,
    itemListings,
    userSkins,
    userNftItems,
    profile,
    handleListForSale,
    handleCancelListing,
    handleBuyNft,
  ]);

  useControllerAction(
    showPriceInput || showSettingsModal
      ? {} // Modals have their own controller handlers
      : {
          onB: handleBack,
          onStart: () => setShowSettingsModal(true),
          onA:
            activeTab === 'pve' && !isPurchasing
              ? handlePurchase
              : activeSectionCount > 0
                ? handleNftAction
                : undefined,
          onL1: () => cycleTab(-1),
          onR1: () => cycleTab(1),
          onDPadUp: hasSections
            ? () => {
                setSectionFocus((p) => {
                  if (p === 0) return p;
                  setNftFocus(0);
                  return 0;
                });
              }
            : undefined,
          onDPadDown: hasSections
            ? () => {
                setSectionFocus((p) => {
                  if (p === 1) return p;
                  setNftFocus(0);
                  return 1;
                });
              }
            : undefined,
          onDPadLeft:
            activeTab === 'pve'
              ? undefined
              : activeSectionCount > 0
                ? () => setNftFocus((p) => Math.max(0, p - 1))
                : undefined,
          onDPadRight:
            activeTab === 'pve'
              ? undefined
              : activeSectionCount > 0
                ? () => setNftFocus((p) => Math.min(activeSectionCount - 1, p + 1))
                : undefined,
        },
    isController && isFocused
  );

  const controllerHints: ButtonHint[] = [
    { button: 'L1R1', label: 'Switch Tab' },
    ...(activeTab === 'pve'
      ? [
          { button: 'A' as const, label: 'Purchase' },
        ]
      : [
          ...(hasSections ? [{ button: 'DPadUpDown' as const, label: 'Section' }] : []),
          ...(activeSectionCount > 0
            ? [
                { button: 'DPadLeftRight' as const, label: 'Navigate' },
                { button: 'A' as const, label: 'Select' },
              ]
            : []),
        ]),
    { button: 'B', label: 'Back' },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImage} style={styles.backgroundImage} resizeMode="stretch" />

      {!isCompact && !isController && (
        <View style={styles.topRight}>
          <TouchableOpacity
            onPress={() => {
              playSfx('ui_click');
              setShowSettingsModal(true);
            }}
            activeOpacity={0.7}
          >
            <CachedImageBackground
              source={buttonV1Source}
              style={styles.settingsBtn}
              resizeMode="stretch"
            >
              <Image
                source={engineImageSource}
                style={styles.settingsIconImage}
                resizeMode="contain"
              />
            </CachedImageBackground>
          </TouchableOpacity>
        </View>
      )}

      {!isCompact && !isController && (
        <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.backButtonAbsolute}>
          <CachedImageBackground source={buttonV1Source} style={styles.backButtonMobileSized} resizeMode="stretch">
            <Text style={styles.backButtonTextMobile}>Back</Text>
          </CachedImageBackground>
        </TouchableOpacity>
      )}

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {isCompact ? (
            <>
              {isController ? (
                <View style={[styles.backButton, compactStyles.backButton]} />
              ) : (
                <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    style={[styles.backButton, compactStyles.backButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.backButtonText, compactStyles.backButtonText]}>
                      Back
                    </Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              )}

              <Image
                source={marketplaceTitleSource}
                style={[styles.titleImage, compactStyles.titleImage]}
                resizeMode="contain"
              />

              <View style={[styles.headerSpacer, compactStyles.headerSpacer]} />
            </>
          ) : (
            <>
              <View style={styles.backButton} />

              <Image
                source={marketplaceTitleSource}
                style={styles.titleImage}
                resizeMode="contain"
              />

              <View style={styles.headerSpacer} />
            </>
          )}
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, isCompact && compactStyles.tabs]}>
          {isController ? (
            <Image
              source={iconL1Source}
              style={[styles.tabShoulderIcon, isCompact && compactStyles.tabShoulderIcon]}
              resizeMode="contain"
            />
          ) : !isCompact ? (
            <TouchableOpacity onPress={() => cycleTab(-1)} activeOpacity={0.7}>
              <Image
                source={arrowIcon}
                style={[styles.tabArrowIcon, styles.tabArrowLeft]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : null}
          {(['skins', 'items', 'pve'] as const).map((tab) => {
            const tabEl = (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => {
                  playSfx('ui_click');
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
            );
            return isController && activeTab === tab ? (
              <FocusGlow key={tab} active>
                {tabEl}
              </FocusGlow>
            ) : (
              tabEl
            );
          })}
          {isController ? (
            <Image
              source={iconR1Source}
              style={[styles.tabShoulderIcon, isCompact && compactStyles.tabShoulderIcon]}
              resizeMode="contain"
            />
          ) : !isCompact ? (
            <TouchableOpacity onPress={() => cycleTab(1)} activeOpacity={0.7}>
              <Image
                source={arrowIcon}
                style={styles.tabArrowIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tab Content */}
        <View style={[styles.tabContent, isCompact && compactStyles.tabContent]}>
          {activeTab === 'skins' && (
            <View style={styles.comingSoonContainer}>
              <View style={styles.comingSoonBanner}>
                <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>
                  COMING SOON
                </Text>
              </View>
            </View>
          )}
          {activeTab === 'items' && (
            <View style={styles.comingSoonContainer}>
              <View style={styles.comingSoonBanner}>
                <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>
                  COMING SOON
                </Text>
              </View>
            </View>
          )}
          {activeTab === 'pve' && (
            <View style={[styles.pveContent, isCompact && compactStyles.pveContent]}>
              <Image
                source={sessionPapersSource}
                style={[styles.sessionImage, isCompact && compactStyles.sessionImage, !isCompact && { width: sessionImageWidth, height: sessionImageHeight }]}
                resizeMode="contain"
              />
              <View style={[styles.priceContainer, isCompact && compactStyles.priceContainer]}>
                <Image
                  source={yellowBrushSource}
                  style={[styles.priceBrush, isCompact && compactStyles.priceBrush]}
                  resizeMode="stretch"
                />
                <Text style={[styles.priceText, isCompact && compactStyles.priceText]}>
                  Price: 0.05 SOL
                </Text>
              </View>
              {isCompact ? (
                <View style={compactStyles.purchaseHint}>
                  {isPurchasing ? (
                    <ActivityIndicator color="#3d2b1f" size="large" />
                  ) : (
                    <>
                      <Image
                        source={require('../../assets/ui/control-buttons/a.webp')}
                        style={compactStyles.purchaseHintIcon}
                        resizeMode="contain"
                      />
                      <Text style={compactStyles.purchaseHintText}>Purchase</Text>
                    </>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handlePurchase}
                  activeOpacity={0.7}
                  disabled={isPurchasing}
                >
                  <CachedImageBackground
                    source={buttonV3Source}
                    style={[
                      styles.purchaseButton,
                      isPurchasing && { opacity: 0.6 },
                    ]}
                    resizeMode="stretch"
                  >
                    {isPurchasing ? (
                      <ActivityIndicator color="#1a1a1a" size="small" />
                    ) : (
                      <Text style={styles.purchaseButtonText}>
                        Purchase
                      </Text>
                    )}
                  </CachedImageBackground>
                </TouchableOpacity>
              )}

              {purchaseError && (
                <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                  {purchaseError}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Side navigation arrows — mobile only */}
      {!isCompact && !isController && (
        <>
          {activeTab !== 'skins' && (
            <TouchableOpacity
              style={styles.sideArrowLeft}
              onPress={() => cycleTab(-1)}
              activeOpacity={0.7}
            >
              <Image
                source={arrowIcon}
                style={[styles.sideArrowIcon, styles.sideArrowIconLeft]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
          {activeTab !== 'pve' && (
            <TouchableOpacity
              style={styles.sideArrowRight}
              onPress={() => cycleTab(1)}
              activeOpacity={0.7}
            >
              <Image
                source={arrowIcon}
                style={styles.sideArrowIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Bottom-right sessions counter — PvE tab only */}
      {activeTab === 'pve' && (
        <View style={[styles.sessionsContainer, isCompact && compactStyles.sessionsContainer]}>
          <CachedImageBackground
            source={rectangleSource}
            style={[styles.sessionsFrame, isCompact && compactStyles.sessionsFrame]}
            resizeMode="stretch"
          >
            <Text style={[styles.sessionsText, isCompact && compactStyles.sessionsText]}>
              Current: {availableRuns} Sessions
            </Text>
          </CachedImageBackground>
        </View>
      )}
      {/* Price Input Modal */}
      <InlineModal
        visible={showPriceInput}
        transparent
        animationType="fade"
        onRequestClose={() => {
          playSfx('ui_click');
          setShowPriceInput(false);
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            playSfx('ui_click');
            setShowPriceInput(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <CachedImageBackground
                source={paperPanelSource}
                style={[styles.priceModal, isCompact && compactStyles.priceModal]}
                resizeMode="stretch"
              >
                <PriceInput
                  onConfirm={handleConfirmListing}
                  onCancel={() => {
                    playSfx('ui_click');
                    setShowPriceInput(false);
                  }}
                  isCompact={isCompact}
                />
              </CachedImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>
      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={handleDisconnect}
      />
      <ControllerHints hints={controllerHints} horizontal />
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
  topRight: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
  },
  settingsBtn: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIconImage: {
    width: 30,
    height: 30,
    marginBottom: 4,
  },
  sideArrowLeft: {
    position: 'absolute',
    left: 40,
    top: '50%',
    transform: [{ translateY: -16 }],
    zIndex: 10,
    padding: 8,
  },
  sideArrowRight: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -16 }],
    zIndex: 10,
    padding: 8,
  },
  sideArrowIcon: {
    width: 36,
    height: 36,
    opacity: 0.5,
  },
  sideArrowIconLeft: {
    transform: [{ rotate: '180deg' }],
  },
  content: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backButtonAbsolute: {
    position: 'absolute',
    top: 24,
    left: 16,
    zIndex: 10,
  },
  backButtonMobileSized: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonTextMobile: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
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
  titleImage: {
    width: 180,
    height: 37,
  },
  headerSpacer: {
    width: 80,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tabShoulderIcon: {
    width: 22,
    height: 22,
    opacity: 0.6,
  },
  tabArrowIcon: {
    width: 18,
    height: 18,
    opacity: 0.5,
  },
  tabArrowLeft: {
    transform: [{ rotate: '180deg' }],
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
  },
  pveContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  sessionImage: {
    width: 262,
    height: 168,
  },
  priceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 0,
  },
  priceBrush: {
    position: 'absolute',
    width: 240,
    height: 60,
  },
  priceText: {
    fontFamily: Typography.number,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3d2b1f',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#a33a3a',
    textAlign: 'center',
    maxWidth: '90%',
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
  nftScrollView: {
    flex: 1,
    width: '100%',
  },
  nftScrollContent: {
    paddingBottom: 20,
    paddingLeft: 44,
    gap: 12,
  },
  nftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#3d2b1f',
    marginTop: 8,
    marginLeft: 24,
  },
  sectionTitleActive: {
    color: '#b8860b',
    textDecorationLine: 'underline',
  },
  emptyText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#8a7a6a',
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  priceModal: {
    width: 340,
    height: 340,
    paddingVertical: 40,
    paddingHorizontal: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonBanner: {
    backgroundColor: '#CC2222',
    paddingVertical: 14,
    paddingHorizontal: 48,
    transform: [{ rotate: '-12deg' }],
    borderRadius: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  comingSoonText: {
    fontFamily: Typography.header,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
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
  titleImage: {
    width: 320,
    height: 66,
  },
  headerSpacer: {
    width: 140,
  },
  tabContent: {
    justifyContent: 'center',
  },
  tabs: {
    gap: 12,
    marginBottom: 32,
  },
  tabShoulderIcon: {
    width: 36,
    height: 36,
  },
  tabText: {
    fontSize: 24,
  },
  comingSoonText: {
    fontSize: 48,
    letterSpacing: 6,
  },
  pveContent: {
    gap: 40,
    marginTop: -120,
  },
  sessionImage: {
    width: 620,
    height: 397,
    marginTop: -12,
  },
  priceContainer: {
    marginBottom: 32,
  },
  priceBrush: {
    width: 400,
    height: 120,
  },
  priceText: {
    fontSize: 36,
  },
  errorText: {
    fontSize: 20,
  },
  purchaseHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  purchaseHintIcon: {
    width: 40,
    height: 40,
  },
  purchaseHintText: {
    fontFamily: Typography.button,
    fontSize: 28,
    color: '#3d2b1f',
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
  sectionTitle: {
    fontSize: 28,
    marginLeft: 0,
  },
  nftScrollContent: {
    paddingBottom: 32,
  },
  emptyText: {
    fontSize: 22,
  },
  nftGrid: {
    gap: 32,
  },
  priceModal: {
    width: 680,
    height: 680,
    padding: 80,
  },
});
