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
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { useNftMarketplace } from '../hooks/useNftMarketplace';
import { NftCard } from '../components/marketplace/NftCard';
import { PriceInput } from '../components/marketplace/PriceInput';
import { InlineModal } from '../components/InlineModal';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MetaplexCoreAsset, ListingWithAsset } from '../types/solana';
import { NFT_ITEMS } from '../data/nftItems';
import { getSkinImage } from '../data/skinImages';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const sessionPapersSource = require('../../assets/ui/illustrations/session-papers.png');
const rectangleSource = require('../../assets/ui/frames/rectangle.png');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.png');

type MarketplaceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Marketplace'>;
};

type Tab = 'skins' | 'items' | 'pve';

export function MarketplaceScreen({ navigation }: MarketplaceScreenProps) {
  const { purchaseRuns, availableRuns, profile } = useProfile();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const [activeTab, setActiveTab] = useState<Tab>('pve');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    userSkins,
    userNftItems,
    listings,
    isLoading: marketplaceLoading,
    error: marketplaceError,
    fetchUserAssets,
    fetchListings,
    listNft,
    cancelListing,
    buyNft,
    refresh: refreshMarketplace,
  } = useNftMarketplace();

  const [showPriceInput, setShowPriceInput] = useState(false);
  const [selectedNft, setSelectedNft] = useState<{ asset: MetaplexCoreAsset; collection: any } | null>(null);

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

  const handleListForSale = useCallback((asset: MetaplexCoreAsset, collection: any) => {
    setSelectedNft({ asset, collection });
    setShowPriceInput(true);
  }, []);

  const handleConfirmListing = useCallback(async (priceSol: number) => {
    if (!selectedNft) return;
    const priceLamports = Math.round(priceSol * LAMPORTS_PER_SOL);
    await listNft(selectedNft.asset.address, selectedNft.collection, priceLamports);
    setShowPriceInput(false);
    setSelectedNft(null);
  }, [listNft, selectedNft]);

  const handleCancelListing = useCallback(async (listing: ListingWithAsset) => {
    await cancelListing(listing.listing.asset, listing.listing.collection);
  }, [cancelListing]);

  const handleBuyNft = useCallback(async (listing: ListingWithAsset) => {
    await buyNft(listing);
  }, [buyNft]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const TABS: Tab[] = ['skins', 'items', 'pve'];
  const [nftFocus, setNftFocus] = useState(0);

  const cycleTab = useCallback(
    (dir: -1 | 1) => {
      setActiveTab((prev) => {
        const idx = TABS.indexOf(prev);
        const next = idx + dir;
        if (next < 0 || next >= TABS.length) return prev;
        setPurchaseError(null);
        setNftFocus(0);
        return TABS[next];
      });
    },
    []
  );

  // Build the list of focusable items for the current tab (excludes equipped skins)
  const equippedSkinKey = profile?.equippedSkin?.toBase58() ?? null;
  const focusableSkins = activeTab === 'skins'
    ? userSkins.filter((s) => s.address.toBase58() !== equippedSkinKey)
    : [];
  const skinsTabItems = activeTab === 'skins'
    ? [...focusableSkins.map((s) => ({ type: 'owned-skin' as const, skin: s })),
       ...listings.map((l) => ({ type: 'listing' as const, listing: l }))]
    : [];
  const itemsTabItems = activeTab === 'items' ? userNftItems : [];
  const focusableCount = activeTab === 'skins' ? skinsTabItems.length
    : activeTab === 'items' ? itemsTabItems.length
    : 0;

  const handleNftAction = useCallback(() => {
    if (activeTab === 'skins') {
      const item = skinsTabItems[nftFocus];
      if (!item) return;
      if (item.type === 'owned-skin') {
        const isListed = listings.some(l => l.listing.asset.equals(item.skin.address));
        if (!isListed) handleListForSale(item.skin, item.skin.collection);
      } else {
        const isOwnListing = userSkins.some(s => s.address.equals(item.listing.listing.asset));
        if (isOwnListing) handleCancelListing(item.listing);
        else handleBuyNft(item.listing);
      }
    }
  }, [activeTab, nftFocus, skinsTabItems, listings, userSkins, handleListForSale, handleCancelListing, handleBuyNft]);

  useControllerAction(
    showPriceInput ? {} : {
      onB: handleBack,
      onA: activeTab === 'pve' && !isPurchasing
        ? handlePurchase
        : focusableCount > 0 ? handleNftAction : undefined,
      onDPadLeft: () => cycleTab(-1),
      onDPadRight: () => cycleTab(1),
      onDPadUp: focusableCount > 0 ? () => setNftFocus((p) => Math.max(0, p - 1)) : undefined,
      onDPadDown: focusableCount > 0 ? () => setNftFocus((p) => Math.min(focusableCount - 1, p + 1)) : undefined,
    },
    isController
  );

  const controllerHints: ButtonHint[] = [
    { button: 'DPadLeftRight', label: 'Switch Tab' },
    ...(activeTab === 'pve' ? [{ button: 'A' as const, label: 'Purchase' }] : []),
    ...(focusableCount > 0 ? [
      { button: 'DPadUpDown' as const, label: 'Navigate' },
      { button: 'A' as const, label: 'Select' },
    ] : []),
    { button: 'B', label: 'Back' },
  ];

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
          {isController ? (
            <View style={[styles.backButton, isCompact && compactStyles.backButton]} />
          ) : (
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
          )}

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
          {(['skins', 'items', 'pve'] as const).map((tab) => {
            const tabEl = (
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
            );
            return isController && activeTab === tab ? (
              <FocusGlow key={tab} active>{tabEl}</FocusGlow>
            ) : tabEl;
          })}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'skins' && (
            <ScrollView style={styles.nftScrollView} contentContainerStyle={styles.nftScrollContent}>
              {marketplaceLoading && (
                <ActivityIndicator color="#3d2b1f" size={isCompact ? 'large' : 'small'} />
              )}
              {marketplaceError && (
                <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                  {marketplaceError}
                </Text>
              )}

              {/* My Skins */}
              <Text style={[styles.sectionTitle, isCompact && compactStyles.sectionTitle]}>
                My Skins
              </Text>
              {userSkins.length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No skins yet
                </Text>
              ) : (
                <View style={styles.nftGrid}>
                  {userSkins.map((skin) => {
                    const isListed = listings.some(l => l.listing.asset.equals(skin.address));
                    const isEquipped = profile?.equippedSkin?.equals(skin.address) ?? false;
                    const canList = !isListed && !isEquipped;
                    const skinFocusIdx = focusableSkins.indexOf(skin);
                    return (
                      <FocusGlow key={skin.address.toBase58()} active={isController && !isEquipped && nftFocus === skinFocusIdx}>
                        <NftCard
                          name={skin.name}
                          image={getSkinImage(skin.name)}
                          isOwned
                          isEquipped={isEquipped}
                          actionLabel={canList ? 'List' : undefined}
                          onAction={canList ? () => handleListForSale(skin, skin.collection) : undefined}
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}

              {/* For Sale */}
              <Text style={[styles.sectionTitle, isCompact && compactStyles.sectionTitle]}>
                For Sale
              </Text>
              {listings.filter(l => l.asset.collection !== null).length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No skins for sale
                </Text>
              ) : (
                <View style={styles.nftGrid}>
                  {listings.map((listing, idx) => {
                    const focusIdx = focusableSkins.length + idx;
                    const priceSol = Number(listing.listing.priceLamports) / LAMPORTS_PER_SOL;
                    const isOwnListing = userSkins.some(s => s.address.equals(listing.listing.asset));
                    return (
                      <FocusGlow key={listing.listing.asset.toBase58()} active={isController && nftFocus === focusIdx}>
                        <NftCard
                          name={listing.asset.name}
                          image={getSkinImage(listing.asset.name)}
                          priceSol={priceSol}
                          actionLabel={isOwnListing ? 'Cancel' : 'Buy'}
                          onAction={isOwnListing ? () => handleCancelListing(listing) : () => handleBuyNft(listing)}
                          disabled={marketplaceLoading}
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )}
          {activeTab === 'items' && (
            <ScrollView style={styles.nftScrollView} contentContainerStyle={styles.nftScrollContent}>
              {marketplaceLoading && (
                <ActivityIndicator color="#3d2b1f" size={isCompact ? 'large' : 'small'} />
              )}

              {/* My NFT Items */}
              <Text style={[styles.sectionTitle, isCompact && compactStyles.sectionTitle]}>
                My NFT Items
              </Text>
              {userNftItems.length === 0 ? (
                <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                  No NFT items yet
                </Text>
              ) : (
                <View style={styles.nftGrid}>
                  {userNftItems.map((item, idx) => {
                    const info = NFT_ITEMS[item.name] ?? null;
                    return (
                      <FocusGlow key={item.address.toBase58()} active={isController && nftFocus === idx}>
                        <NftCard
                          name={info?.name ?? item.name}
                          emoji={info?.emoji ?? '\u{2728}'}
                          rarity={info?.rarity}
                          isOwned
                          isCompact={isCompact}
                        />
                      </FocusGlow>
                    );
                  })}
                </View>
              )}
            </ScrollView>
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
      {/* Price Input Modal */}
      <InlineModal
        visible={showPriceInput}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPriceInput(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPriceInput(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={paperPanelSource}
                style={[styles.priceModal, isCompact && compactStyles.priceModal]}
                resizeMode="stretch"
              >
                <PriceInput
                  onConfirm={handleConfirmListing}
                  onCancel={() => setShowPriceInput(false)}
                  isCompact={isCompact}
                />
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>
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
  nftScrollView: {
    flex: 1,
    width: '100%',
  },
  nftScrollContent: {
    paddingBottom: 20,
    gap: 12,
  },
  nftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#3d2b1f',
    marginTop: 8,
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
  sectionTitle: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: 22,
  },
  priceModal: {
    width: 680,
    height: 680,
    padding: 80,
  },
});
