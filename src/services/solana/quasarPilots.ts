import bs58 from 'bs58';
import {
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import type { Program } from '@anchor-lang/core';
import {
  GAMEPLAY_STATE_PROGRAM_ID,
  MPL_CORE_PROGRAM_ID,
  NFT_MARKETPLACE_PROGRAM_ID,
  PLAYER_PROFILE_PROGRAM_ID,
} from './constants';
import type {
  ListingData,
  QuestDefinitionData,
  QuestProgressData,
} from '@/types/solana';

const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');

const PLAYER_PROFILE_DISCRIMINATOR = Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]);
const PLAYER_RELIC_POOL_DISCRIMINATOR = Buffer.from([1, 105, 67, 203, 111, 254, 159, 128]);
const MARKETPLACE_CONFIG_DISCRIMINATOR = Buffer.from([169, 22, 247, 131, 182, 200, 81, 124]);
const LISTING_DISCRIMINATOR = Buffer.from([218, 32, 50, 73, 43, 134, 26, 58]);
const QUEST_DEFINITION_DISCRIMINATOR = Buffer.from([106, 90, 250, 119, 170, 124, 111, 19]);
const QUEST_PROGRESS_DISCRIMINATOR = Buffer.from([77, 66, 99, 169, 234, 177, 58, 162]);

const IX = {
  initializeProfile: Buffer.from([32, 145, 77, 213, 58, 39, 251, 234]),
  updateProfileName: Buffer.from([96, 69, 10, 229, 192, 184, 200, 20]),
  closeProfile: Buffer.from([167, 36, 181, 8, 136, 158, 46, 207]),
  updateActiveItemPool: Buffer.from([39, 206, 212, 174, 10, 184, 19, 143]),
  recordRunResult: Buffer.from([135, 126, 78, 133, 237, 190, 21, 71]),
  purchaseRuns: Buffer.from([60, 148, 42, 27, 159, 188, 113, 143]),
  equipSkin: Buffer.from([114, 85, 49, 172, 128, 188, 210, 76]),
  unequipSkin: Buffer.from([144, 147, 87, 145, 250, 113, 30, 135]),
  setRelicActive: Buffer.from([59, 219, 164, 158, 201, 20, 227, 95]),
  listNft: Buffer.from([88, 221, 93, 166, 63, 220, 106, 232]),
  cancelListing: Buffer.from([41, 183, 50, 232, 230, 233, 157, 70]),
  buyNft: Buffer.from([96, 0, 28, 190, 49, 107, 83, 222]),
  acceptQuest: Buffer.from([227, 152, 182, 25, 142, 11, 231, 72]),
  claimQuestReward: Buffer.from([73, 123, 191, 206, 63, 127, 247, 12]),
};

type AccountFacade<T> = {
  fetch: (address: PublicKey) => Promise<T>;
  fetchNullable: (address: PublicKey) => Promise<T | null>;
  all: () => Promise<{ publicKey: PublicKey; account: T }[]>;
};

export interface QuasarPlayerProfileAccount {
  owner: PublicKey;
  totalRuns: number;
  highestLevelUnlocked: number;
  availableRuns: number;
  createdAt: bigint;
  bump: number;
  unlockedItems: Uint8Array;
  activeItemPool: Uint8Array;
  equippedSkin: PublicKey | null;
  gauntletBoosters: number;
  name: string;
}

export interface QuasarPlayerRelicPoolAccount {
  owner: PublicKey;
  count: number;
  bump: number;
  relics: {
    itemId: Uint8Array;
    ownedCount: number;
    inActivePool: boolean;
  }[];
}

export interface QuasarMarketplaceConfigAccount {
  authority: PublicKey;
  skinsCollection: PublicKey;
  itemsCollection: PublicKey;
  companyTreasury: PublicKey;
  gauntletPool: PublicKey;
  companyFeeBps: number;
  gauntletFeeBps: number;
  bump: number;
}

type QuasarListingAccount = ListingData & { bump: number };

function readPublicKey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

function readI64(data: Buffer, offset: number): bigint {
  return data.readBigInt64LE(offset);
}

function readPodString(data: Buffer, offset: number, capacity: number): string {
  const length = Math.min(data[offset] ?? 0, capacity);
  return data.subarray(offset + 1, offset + 1 + length).toString('utf8').replace(/\0/g, '');
}

function requireDiscriminator(data: Buffer, discriminator: Buffer): void {
  if (data.length < discriminator.length || !data.subarray(0, discriminator.length).equals(discriminator)) {
    throw new Error('Invalid Quasar account discriminator');
  }
}

function encodeU16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value);
  return out;
}

function encodeU64(value: bigint | number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function encodeBool(value: boolean): Buffer {
  return Buffer.from([value ? 1 : 0]);
}

function encodeStringArg(value: string, maxLength: number): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > maxLength) {
    throw new Error(`String argument exceeds ${maxLength} bytes`);
  }
  return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function encodeFixedBytes(value: Uint8Array | number[], length: number): Buffer {
  const bytes = Buffer.from(value);
  if (bytes.length !== length) {
    throw new Error(`Expected ${length} bytes, got ${bytes.length}`);
  }
  return bytes;
}

function tx(ix: TransactionInstruction): Transaction {
  return new Transaction().add(ix);
}

function quasarIx(programId: PublicKey, discriminator: Buffer, keys: TransactionInstruction['keys'], data: Buffer[] = []) {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.concat([discriminator, ...data]),
  });
}

async function fetchDecoded<T>(
  connection: Connection,
  address: PublicKey,
  decode: (data: Buffer) => T
): Promise<T | null> {
  const account = await connection.getAccountInfo(address, 'confirmed');
  if (!account) return null;
  return decode(Buffer.from(account.data));
}

async function fetchAllDecoded<T>(
  connection: Connection,
  programId: PublicKey,
  discriminator: Buffer,
  decode: (data: Buffer) => T
): Promise<{ publicKey: PublicKey; account: T }[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: 'confirmed',
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(discriminator) } }],
  });
  return accounts.map(({ pubkey, account }) => ({
    publicKey: pubkey,
    account: decode(Buffer.from(account.data)),
  }));
}

export function decodePlayerProfile(data: Buffer): QuasarPlayerProfileAccount {
  requireDiscriminator(data, PLAYER_PROFILE_DISCRIMINATOR);
  return {
    owner: readPublicKey(data, 8),
    totalRuns: data.readUInt32LE(40),
    highestLevelUnlocked: data[44] ?? 1,
    availableRuns: data.readUInt32LE(45),
    createdAt: readI64(data, 49),
    bump: data[57] ?? 0,
    unlockedItems: new Uint8Array(data.subarray(58, 68)),
    activeItemPool: new Uint8Array(data.subarray(68, 78)),
    equippedSkin: data[78] === 1 ? readPublicKey(data, 79) : null,
    gauntletBoosters: data[111] ?? 0,
    name: readPodString(data, 112, 32),
  };
}

export function decodePlayerRelicPool(data: Buffer): QuasarPlayerRelicPoolAccount {
  requireDiscriminator(data, PLAYER_RELIC_POOL_DISCRIMINATOR);
  const count = Math.min(data[40] ?? 0, 32);
  const relics: QuasarPlayerRelicPoolAccount['relics'] = [];
  let offset = 42;
  for (let index = 0; index < count; index += 1) {
    relics.push({
      itemId: new Uint8Array(data.subarray(offset, offset + 8)),
      ownedCount: data.readUInt16LE(offset + 8),
      inActivePool: data[offset + 10] !== 0,
    });
    offset += 11;
  }
  return {
    owner: readPublicKey(data, 8),
    count,
    bump: data[41] ?? 0,
    relics,
  };
}

export function decodeMarketplaceConfig(data: Buffer): QuasarMarketplaceConfigAccount {
  requireDiscriminator(data, MARKETPLACE_CONFIG_DISCRIMINATOR);
  return {
    authority: readPublicKey(data, 8),
    skinsCollection: readPublicKey(data, 40),
    itemsCollection: readPublicKey(data, 72),
    companyTreasury: readPublicKey(data, 104),
    gauntletPool: readPublicKey(data, 136),
    companyFeeBps: data.readUInt16LE(168),
    gauntletFeeBps: data.readUInt16LE(170),
    bump: data[172] ?? 0,
  };
}

export function decodeListing(data: Buffer): QuasarListingAccount {
  requireDiscriminator(data, LISTING_DISCRIMINATOR);
  return {
    seller: readPublicKey(data, 8),
    asset: readPublicKey(data, 40),
    collection: readPublicKey(data, 72),
    priceLamports: readU64(data, 104),
    createdAt: Number(readI64(data, 112)),
    bump: data[120] ?? 0,
  };
}

function questType(value: number): QuestDefinitionData['questType'] {
  if (value === 1) return { weekly: {} };
  if (value === 2) return { seasonal: {} };
  return { daily: {} };
}

function objectiveType(value: number): QuestDefinitionData['objectiveType'] {
  if (value === 1) return { completeLevels: {} };
  if (value === 2) return { playPvpMatches: {} };
  if (value === 3) return { defeatBosses: {} };
  if (value === 4) return { collectGold: {} };
  return { winBattles: {} };
}

function rewardType(value: number): QuestDefinitionData['rewardType'] {
  if (value === 1) return { skin: {} };
  if (value === 2) return { nftItem: {} };
  return { gauntletBooster: {} };
}

export function decodeQuestDefinition(data: Buffer): QuestDefinitionData {
  requireDiscriminator(data, QUEST_DEFINITION_DISCRIMINATOR);
  return {
    questId: data.readUInt16LE(8),
    questType: questType(data[10] ?? 0),
    objectiveType: objectiveType(data[11] ?? 0),
    objectiveCount: data.readUInt16LE(12),
    rewardType: rewardType(data[14] ?? 0),
    rewardData: new Uint8Array(data.subarray(15, 47)),
    season: data[47] ?? 0,
    active: data[48] !== 0,
  };
}

export function decodeQuestProgress(data: Buffer): QuestProgressData {
  requireDiscriminator(data, QUEST_PROGRESS_DISCRIMINATOR);
  return {
    player: readPublicKey(data, 8),
    questId: data.readUInt16LE(40),
    progress: data.readUInt16LE(42),
    completed: data[44] !== 0,
    claimed: data[45] !== 0,
    lastReset: Number(readI64(data, 46)),
  };
}

function accountFacade<T>(
  connection: Connection,
  programId: PublicKey,
  discriminator: Buffer,
  decode: (data: Buffer) => T
): AccountFacade<T> {
  return {
    async fetch(address: PublicKey) {
      const account = await fetchDecoded(connection, address, decode);
      if (!account) throw new Error(`Account not found: ${address.toBase58()}`);
      return account;
    },
    fetchNullable(address: PublicKey) {
      return fetchDecoded(connection, address, decode);
    },
    all() {
      return fetchAllDecoded(connection, programId, discriminator, decode);
    },
  };
}

export function attachPlayerProfileQuasarAccounts<T extends Program>(program: T, connection: Connection): T {
  (program as any).account = {
    ...(program as any).account,
    playerProfile: accountFacade(connection, PLAYER_PROFILE_PROGRAM_ID, PLAYER_PROFILE_DISCRIMINATOR, decodePlayerProfile),
    playerRelicPool: accountFacade(connection, PLAYER_PROFILE_PROGRAM_ID, PLAYER_RELIC_POOL_DISCRIMINATOR, decodePlayerRelicPool),
  };
  return program;
}

export function attachNftMarketplaceQuasarAccounts<T extends Program>(program: T, connection: Connection): T {
  (program as any).account = {
    ...(program as any).account,
    marketplaceConfig: accountFacade(connection, NFT_MARKETPLACE_PROGRAM_ID, MARKETPLACE_CONFIG_DISCRIMINATOR, decodeMarketplaceConfig),
    listing: accountFacade(connection, NFT_MARKETPLACE_PROGRAM_ID, LISTING_DISCRIMINATOR, decodeListing),
    questDefinition: accountFacade(connection, NFT_MARKETPLACE_PROGRAM_ID, QUEST_DEFINITION_DISCRIMINATOR, decodeQuestDefinition),
    questProgress: accountFacade(connection, NFT_MARKETPLACE_PROGRAM_ID, QUEST_PROGRESS_DISCRIMINATOR, decodeQuestProgress),
  };
  return program;
}

export function fetchPlayerProfileAccount(connection: Connection, address: PublicKey) {
  return fetchDecoded(connection, address, decodePlayerProfile);
}

export function fetchMarketplaceConfigAccount(connection: Connection, address: PublicKey) {
  return fetchDecoded(connection, address, decodeMarketplaceConfig);
}

export function buildInitializeProfileTx(accounts: {
  owner: PublicKey;
  playerProfile: PublicKey;
  name: string;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.initializeProfile, [
    { pubkey: accounts.owner, isWritable: true, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ], [encodeStringArg(accounts.name, 32)]));
}

export function buildUpdateProfileNameTx(accounts: {
  owner: PublicKey;
  playerProfile: PublicKey;
  name: string;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.updateProfileName, [
    { pubkey: accounts.owner, isWritable: false, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
  ], [encodeStringArg(accounts.name, 32)]));
}

export function buildCloseProfileTx(accounts: { owner: PublicKey; playerProfile: PublicKey }): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.closeProfile, [
    { pubkey: accounts.owner, isWritable: true, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
  ]));
}

export function buildRecordRunResultTx(accounts: {
  owner: PublicKey;
  playerProfile: PublicKey;
  levelReached: number;
  victory: boolean;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.recordRunResult, [
    { pubkey: accounts.owner, isWritable: false, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
  ], [Buffer.from([accounts.levelReached]), encodeBool(accounts.victory)]));
}

export function buildUpdateActiveItemPoolTx(accounts: {
  owner: PublicKey;
  playerProfile: PublicKey;
  pitDraftQueue: PublicKey;
  activeItemPool: Uint8Array;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.updateActiveItemPool, [
    { pubkey: accounts.owner, isWritable: false, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
    { pubkey: accounts.pitDraftQueue, isWritable: false, isSigner: false },
  ], [encodeFixedBytes(accounts.activeItemPool, 10)]));
}

export function buildPurchaseRunsTx(accounts: {
  owner: PublicKey;
  playerProfile: PublicKey;
  treasury: PublicKey;
  gauntletPool: PublicKey;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.purchaseRuns, [
    { pubkey: accounts.owner, isWritable: true, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
    { pubkey: accounts.treasury, isWritable: true, isSigner: false },
    { pubkey: accounts.gauntletPool, isWritable: true, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ]));
}

export function buildEquipSkinTx(accounts: {
  owner: PublicKey;
  playerProfile: PublicKey;
  skinAsset: PublicKey;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.equipSkin, [
    { pubkey: accounts.owner, isWritable: false, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
    { pubkey: accounts.skinAsset, isWritable: false, isSigner: false },
  ]));
}

export function buildUnequipSkinTx(accounts: { owner: PublicKey; playerProfile: PublicKey }): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.unequipSkin, [
    { pubkey: accounts.owner, isWritable: false, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: true, isSigner: false },
  ]));
}

export function buildSetRelicActiveTx(accounts: {
  owner: PublicKey;
  playerRelicPool: PublicKey;
  relicItemId: Uint8Array | number[];
  active: boolean;
}): Transaction {
  return tx(quasarIx(PLAYER_PROFILE_PROGRAM_ID, IX.setRelicActive, [
    { pubkey: accounts.owner, isWritable: false, isSigner: true },
    { pubkey: accounts.playerRelicPool, isWritable: true, isSigner: false },
  ], [encodeFixedBytes(accounts.relicItemId, 8), encodeBool(accounts.active)]));
}

export function buildListNftTx(accounts: {
  listing: PublicKey;
  marketplaceConfig: PublicKey;
  mintAuthority: PublicKey;
  asset: PublicKey;
  collection: PublicKey;
  seller: PublicKey;
  playerProfile: PublicKey;
  priceLamports: bigint | number;
}): Transaction {
  return tx(quasarIx(NFT_MARKETPLACE_PROGRAM_ID, IX.listNft, [
    { pubkey: accounts.listing, isWritable: true, isSigner: false },
    { pubkey: accounts.marketplaceConfig, isWritable: false, isSigner: false },
    { pubkey: accounts.mintAuthority, isWritable: false, isSigner: false },
    { pubkey: accounts.asset, isWritable: true, isSigner: false },
    { pubkey: accounts.collection, isWritable: true, isSigner: false },
    { pubkey: accounts.seller, isWritable: true, isSigner: true },
    { pubkey: accounts.playerProfile, isWritable: false, isSigner: false },
    { pubkey: MPL_CORE_PROGRAM_ID, isWritable: false, isSigner: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ], [encodeU64(accounts.priceLamports)]));
}

export function buildCancelListingTx(accounts: {
  listing: PublicKey;
  asset: PublicKey;
  collection: PublicKey;
  seller: PublicKey;
}): Transaction {
  return tx(quasarIx(NFT_MARKETPLACE_PROGRAM_ID, IX.cancelListing, [
    { pubkey: accounts.listing, isWritable: true, isSigner: false },
    { pubkey: accounts.asset, isWritable: true, isSigner: false },
    { pubkey: accounts.collection, isWritable: true, isSigner: false },
    { pubkey: accounts.seller, isWritable: true, isSigner: true },
    { pubkey: MPL_CORE_PROGRAM_ID, isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ]));
}

export function buildBuyNftTx(accounts: {
  listing: PublicKey;
  marketplaceConfig: PublicKey;
  mintAuthority: PublicKey;
  asset: PublicKey;
  relicAssetRecord?: PublicKey;
  collection: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  sellerPlayerRelicPool?: PublicKey;
  buyerPlayerRelicPool: PublicKey;
  companyTreasury: PublicKey;
  gauntletPool: PublicKey;
}): Transaction {
  const keys: TransactionInstruction['keys'] = [
    { pubkey: accounts.listing, isWritable: true, isSigner: false },
    { pubkey: accounts.marketplaceConfig, isWritable: false, isSigner: false },
    { pubkey: accounts.mintAuthority, isWritable: false, isSigner: false },
    { pubkey: accounts.asset, isWritable: true, isSigner: false },
    { pubkey: accounts.relicAssetRecord ?? NFT_MARKETPLACE_PROGRAM_ID, isWritable: false, isSigner: false },
  ];
  keys.push(
    { pubkey: accounts.collection, isWritable: true, isSigner: false },
    { pubkey: accounts.buyer, isWritable: true, isSigner: true },
    { pubkey: accounts.seller, isWritable: true, isSigner: false },
    { pubkey: accounts.sellerPlayerRelicPool ?? NFT_MARKETPLACE_PROGRAM_ID, isWritable: true, isSigner: false },
  );
  keys.push(
    { pubkey: accounts.buyerPlayerRelicPool, isWritable: true, isSigner: false },
    { pubkey: accounts.companyTreasury, isWritable: true, isSigner: false },
    { pubkey: accounts.gauntletPool, isWritable: true, isSigner: false },
    { pubkey: MPL_CORE_PROGRAM_ID, isWritable: false, isSigner: false },
    { pubkey: PLAYER_PROFILE_PROGRAM_ID, isWritable: false, isSigner: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  );
  return tx(quasarIx(NFT_MARKETPLACE_PROGRAM_ID, IX.buyNft, keys));
}

export function buildAcceptQuestTx(accounts: {
  questDefinition: PublicKey;
  questProgress: PublicKey;
  player: PublicKey;
  questId: number;
}): Transaction {
  return tx(quasarIx(NFT_MARKETPLACE_PROGRAM_ID, IX.acceptQuest, [
    { pubkey: accounts.questDefinition, isWritable: false, isSigner: false },
    { pubkey: accounts.questProgress, isWritable: true, isSigner: false },
    { pubkey: accounts.player, isWritable: true, isSigner: true },
    { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ], [encodeU16(accounts.questId)]));
}

export function buildClaimQuestRewardTx(accounts: {
  questDefinition: PublicKey;
  questProgress: PublicKey;
  player: PublicKey;
  questId: number;
}): Transaction {
  return tx(quasarIx(NFT_MARKETPLACE_PROGRAM_ID, IX.claimQuestReward, [
    { pubkey: accounts.questDefinition, isWritable: false, isSigner: false },
    { pubkey: accounts.questProgress, isWritable: true, isSigner: false },
    { pubkey: accounts.player, isWritable: false, isSigner: true },
  ], [encodeU16(accounts.questId)]));
}

export function getSplNoopProgramId(): PublicKey {
  return SPL_NOOP_PROGRAM_ID;
}
