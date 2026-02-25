#!/usr/bin/env node
/**
 * E2E Session Lifecycle Test — Three Scenarios
 *
 * Tests the complete session teardown for each game outcome:
 *   Scenario 1: Player dies to a field enemy
 *   Scenario 2: Player dies to a boss (exhaust phases → trigger_boss_fight)
 *   Scenario 3: Player wins (completed=true → end_session → verify level + item unlock)
 *
 * Each scenario: start → delegate → gameplay → undelegate → end_session → verify cleanup → new session
 *
 * Usage: node scripts/e2e-session-test.mjs
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';

// ============================================================================
// Config
// ============================================================================

const BASE_RPC = process.env.BASE_RPC || 'http://127.0.0.1:8899';
const ER_RPC = process.env.ER_RPC || 'http://127.0.0.1:7799';
const CAMPAIGN_LEVEL = 1;

const PROGRAMS = {
  sessionManager: new PublicKey('6w1XVMSTRmZU9AWCKVvKohGAHSFMENhda7vqhKPQ8TPn'),
  gameplayState: new PublicKey('C8hK4qsqsSYQeqyXuTPTUUS3T7N74WnZCuzvChTpK1Mo'),
  mapGenerator: new PublicKey('GCy5GqvnJN99rgGtV6fMn8NtL9E7RoAyHDGzQv8me65j'),
  playerInventory: new PublicKey('APRnvp41jEYnT1EnrdBTim7bodqE6v2RSgzv1CG7Qv7u'),
  poiSystem: new PublicKey('KiT25b86BSAF8yErcWwyuuWNaoXMpNf859NjH41TpSj'),
  playerProfile: new PublicKey('Ch3bbL1oQk2z5rX1jiun3KuSWZqnXZ1MnrfrtKj4MKun'),
  delegation: new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'),
  magicProgram: new PublicKey('Magic11111111111111111111111111111111111111'),
  magicContext: new PublicKey('MagicContext1111111111111111111111111111111'),
};

// ============================================================================
// PDA Derivation
// ============================================================================

function derivePda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}
function deriveSessionPda(player, level) {
  return derivePda([Buffer.from('session'), player.toBuffer(), Buffer.from([level])], PROGRAMS.sessionManager);
}
function derivePlayerProfilePda(owner) {
  return derivePda([Buffer.from('player'), owner.toBuffer()], PROGRAMS.playerProfile);
}
function deriveSessionCounterPda() {
  return derivePda([Buffer.from('session_counter')], PROGRAMS.sessionManager);
}
function deriveMapConfigPda() {
  return derivePda([Buffer.from('map_config')], PROGRAMS.mapGenerator);
}
function deriveGameStatePda(sessionPda) {
  return derivePda([Buffer.from('game_state'), sessionPda.toBuffer()], PROGRAMS.gameplayState);
}
function deriveMapEnemiesPda(sessionPda) {
  return derivePda([Buffer.from('map_enemies'), sessionPda.toBuffer()], PROGRAMS.gameplayState);
}
function deriveMapPoisPda(sessionPda) {
  return derivePda([Buffer.from('map_pois'), sessionPda.toBuffer()], PROGRAMS.poiSystem);
}
function deriveGeneratedMapPda(sessionPda) {
  return derivePda([Buffer.from('generated_map'), sessionPda.toBuffer()], PROGRAMS.mapGenerator);
}
function deriveInventoryPda(sessionPda) {
  return derivePda([Buffer.from('inventory'), sessionPda.toBuffer()], PROGRAMS.playerInventory);
}
function deriveGameplayAuthorityPda() {
  return derivePda([Buffer.from('gameplay_authority')], PROGRAMS.gameplayState);
}
function deriveSessionManagerAuthorityPda() {
  return derivePda([Buffer.from('session_manager_authority')], PROGRAMS.sessionManager);
}
function deriveDelegationPdas(target, ownerProgram) {
  const [buffer] = derivePda([Buffer.from('buffer'), target.toBuffer()], ownerProgram);
  const [delegationRecord] = derivePda([Buffer.from('delegation'), target.toBuffer()], PROGRAMS.delegation);
  const [delegationMetadata] = derivePda([Buffer.from('delegation-metadata'), target.toBuffer()], PROGRAMS.delegation);
  return { buffer, delegationRecord, delegationMetadata };
}

// ============================================================================
// Helpers
// ============================================================================

function loadIdl(name) {
  return JSON.parse(fs.readFileSync(`src/services/solana/idl/${name}.json`, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmTx(connection, sig, label) {
  await connection.confirmTransaction(sig, 'confirmed');
  console.log(`    ✓ ${label}: ${sig.slice(0, 20)}…`);
}

async function sendAndConfirm(connection, tx, signers, label, cuLimit) {
  if (cuLimit) {
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }));
  }
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await confirmTx(connection, sig, label);
  return sig;
}

// ============================================================================
// Reusable Session Lifecycle Steps
// ============================================================================

const idls = {};
function getIdls() {
  if (!idls.sm) {
    idls.sm = loadIdl('session_manager');
    idls.gs = loadIdl('gameplay_state');
    idls.pp = loadIdl('player_profile');
    idls.mg = loadIdl('map_generator');
    idls.pi = loadIdl('player_inventory');
    idls.poi = loadIdl('poi_system');
  }
  return idls;
}

/**
 * Sets up wallet, profile, singletons. Returns all context needed for a session test.
 */
async function setupPlayer(baseConnection) {
  const playerWallet = Keypair.generate();
  const airdropSig = await baseConnection.requestAirdrop(playerWallet.publicKey, 10 * LAMPORTS_PER_SOL);
  await baseConnection.confirmTransaction(airdropSig, 'confirmed');
  console.log(`    Wallet: ${playerWallet.publicKey.toBase58().slice(0, 12)}… funded`);

  const { pp, sm, mg } = getIdls();
  const playerProvider = new AnchorProvider(baseConnection, new Wallet(playerWallet), { commitment: 'confirmed' });
  const ppProgram = new Program(pp, playerProvider);
  const smProgram = new Program(sm, playerProvider);
  const mgProgram = new Program(mg, playerProvider);

  // Create profile
  const [profilePda] = derivePlayerProfilePda(playerWallet.publicKey);
  const profileTx = await ppProgram.methods.initializeProfile('E2EPlayer').accounts({
    playerProfile: profilePda,
    owner: playerWallet.publicKey,
    systemProgram: SystemProgram.programId,
  }).transaction();
  await sendAndConfirm(baseConnection, profileTx, [playerWallet], 'init_profile');

  // Init singletons if needed
  const [sessionCounterPda] = deriveSessionCounterPda();
  const [mapConfigPda] = deriveMapConfigPda();
  if (!(await baseConnection.getAccountInfo(sessionCounterPda))) {
    const tx = await smProgram.methods.initializeCounter().accounts({
      sessionCounter: sessionCounterPda, admin: playerWallet.publicKey, systemProgram: SystemProgram.programId,
    }).transaction();
    await sendAndConfirm(baseConnection, tx, [playerWallet], 'init_counter');
  }
  if (!(await baseConnection.getAccountInfo(mapConfigPda))) {
    const tx = await mgProgram.methods.initializeMapConfig().accounts({
      mapConfig: mapConfigPda, admin: playerWallet.publicKey, systemProgram: SystemProgram.programId,
    }).transaction();
    await sendAndConfirm(baseConnection, tx, [playerWallet], 'init_map_config');
  }

  return { playerWallet, profilePda, sessionCounterPda, mapConfigPda };
}

/**
 * Start session, fund session signer, return all PDAs.
 */
async function startSession(baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda) {
  const sessionSigner = Keypair.generate();
  const { sm } = getIdls();
  const playerProvider = new AnchorProvider(baseConnection, new Wallet(playerWallet), { commitment: 'confirmed' });
  const smProgram = new Program(sm, playerProvider);

  // Fund session signer
  const fundTx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: playerWallet.publicKey,
    toPubkey: sessionSigner.publicKey,
    lamports: 500_000_000,
  }));
  await sendAndConfirm(baseConnection, fundTx, [playerWallet], 'Fund sessionSigner');

  // Derive PDAs
  const [sessionPda] = deriveSessionPda(playerWallet.publicKey, CAMPAIGN_LEVEL);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [sessionManagerAuthorityPda] = deriveSessionManagerAuthorityPda();

  // Start session
  const tx = await smProgram.methods.startSession(CAMPAIGN_LEVEL).accounts({
    gameSession: sessionPda, sessionCounter: sessionCounterPda, playerProfile: profilePda,
    player: playerWallet.publicKey, sessionSigner: sessionSigner.publicKey, mapConfig: mapConfigPda,
    generatedMap: generatedMapPda, gameState: gameStatePda, mapEnemies: mapEnemiesPda,
    mapPois: mapPoisPda, inventory: inventoryPda, mapGeneratorProgram: PROGRAMS.mapGenerator,
    gameplayStateProgram: PROGRAMS.gameplayState, poiSystemProgram: PROGRAMS.poiSystem,
    playerInventoryProgram: PROGRAMS.playerInventory, playerProfileProgram: PROGRAMS.playerProfile,
    systemProgram: SystemProgram.programId,
  }).transaction();
  await sendAndConfirm(baseConnection, tx, [playerWallet, sessionSigner], 'start_session', 1_400_000);

  return {
    sessionSigner, sessionPda, gameStatePda, mapEnemiesPda, mapPoisPda,
    generatedMapPda, inventoryPda, gameplayAuthorityPda, sessionManagerAuthorityPda,
  };
}

/**
 * Delegate all 6 accounts to the ER.
 */
async function delegateToER(baseConnection, erConnection, sessionSigner, playerWallet, pdas) {
  const { sm, gs, mg, pi, poi } = getIdls();
  const sessionProvider = new AnchorProvider(baseConnection, new Wallet(sessionSigner), { commitment: 'confirmed' });
  const smSessionProgram = new Program(sm, sessionProvider);

  const { sessionPda, gameStatePda, mapEnemiesPda, generatedMapPda, inventoryPda, mapPoisPda } = pdas;
  const gsDel = deriveDelegationPdas(gameStatePda, PROGRAMS.gameplayState);
  const meDel = deriveDelegationPdas(mapEnemiesPda, PROGRAMS.gameplayState);
  const ssDel = deriveDelegationPdas(sessionPda, PROGRAMS.sessionManager);

  // Tx1: gameplay + session
  const delegateGameplayIx = await new Program(gs, sessionProvider).methods.delegateGameplayAccounts().accounts({
    bufferGameState: gsDel.buffer, delegationRecordGameState: gsDel.delegationRecord,
    delegationMetadataGameState: gsDel.delegationMetadata, gameState: gameStatePda,
    bufferMapEnemies: meDel.buffer, delegationRecordMapEnemies: meDel.delegationRecord,
    delegationMetadataMapEnemies: meDel.delegationMetadata, mapEnemies: mapEnemiesPda,
    gameSession: sessionPda, player: sessionSigner.publicKey,
    ownerProgram: PROGRAMS.gameplayState, delegationProgram: PROGRAMS.delegation,
    systemProgram: SystemProgram.programId,
  }).instruction();

  const delegateSessionIx = await smSessionProgram.methods.delegateSession(CAMPAIGN_LEVEL).accounts({
    bufferGameSession: ssDel.buffer, delegationRecordGameSession: ssDel.delegationRecord,
    delegationMetadataGameSession: ssDel.delegationMetadata, gameSession: sessionPda,
    player: playerWallet.publicKey, sessionSigner: sessionSigner.publicKey,
    ownerProgram: PROGRAMS.sessionManager, delegationProgram: PROGRAMS.delegation,
    systemProgram: SystemProgram.programId,
  }).instruction();

  const tx1 = new Transaction().add(delegateGameplayIx, delegateSessionIx);
  await sendAndConfirm(baseConnection, tx1, [sessionSigner], 'Delegate gameplay + session', 600_000);

  // Tx2: map + inventory + pois
  const gmDel = deriveDelegationPdas(generatedMapPda, PROGRAMS.mapGenerator);
  const invDel = deriveDelegationPdas(inventoryPda, PROGRAMS.playerInventory);
  const mpDel = deriveDelegationPdas(mapPoisPda, PROGRAMS.poiSystem);

  const delegateMapIx = await new Program(mg, sessionProvider).methods.delegateGeneratedMap().accounts({
    bufferGeneratedMap: gmDel.buffer, delegationRecordGeneratedMap: gmDel.delegationRecord,
    delegationMetadataGeneratedMap: gmDel.delegationMetadata, generatedMap: generatedMapPda,
    session: sessionPda, player: sessionSigner.publicKey,
    ownerProgram: PROGRAMS.mapGenerator, delegationProgram: PROGRAMS.delegation,
    systemProgram: SystemProgram.programId,
  }).instruction();

  const delegateInventoryIx = await new Program(pi, sessionProvider).methods.delegateInventory().accounts({
    bufferInventory: invDel.buffer, delegationRecordInventory: invDel.delegationRecord,
    delegationMetadataInventory: invDel.delegationMetadata, inventory: inventoryPda,
    session: sessionPda, player: sessionSigner.publicKey,
    ownerProgram: PROGRAMS.playerInventory, delegationProgram: PROGRAMS.delegation,
    systemProgram: SystemProgram.programId,
  }).instruction();

  const delegatePoisIx = await new Program(poi, sessionProvider).methods.delegateMapPois().accounts({
    bufferMapPois: mpDel.buffer, delegationRecordMapPois: mpDel.delegationRecord,
    delegationMetadataMapPois: mpDel.delegationMetadata, mapPois: mapPoisPda,
    gameSession: sessionPda, player: sessionSigner.publicKey,
    ownerProgram: PROGRAMS.poiSystem, delegationProgram: PROGRAMS.delegation,
    systemProgram: SystemProgram.programId,
  }).instruction();

  const tx2 = new Transaction().add(delegateMapIx, delegateInventoryIx, delegatePoisIx);
  await sendAndConfirm(baseConnection, tx2, [sessionSigner], 'Delegate map + inventory + pois', 600_000);

  // Wait for ER
  console.log('    Waiting for ER to pick up delegated accounts...');
  await sleep(3000);

  const erGameState = await erConnection.getAccountInfo(gameStatePda);
  if (!erGameState) { throw new Error('GameState not found on ER after delegation'); }
  console.log('    ✓ Accounts visible on ER');
}

/**
 * Undelegate all 6 accounts from the ER.
 */
async function undelegateFromER(baseConnection, erConnection, sessionSigner, playerWallet, pdas) {
  const { gs, mg, pi, poi, sm } = getIdls();
  const erProvider = new AnchorProvider(erConnection, new Wallet(sessionSigner), { commitment: 'confirmed' });
  const { sessionPda, gameStatePda, mapEnemiesPda, generatedMapPda, inventoryPda, mapPoisPda } = pdas;

  // Undelegate gameplay
  const gsTx = await new Program(gs, erProvider).methods.undelegateGameplayAccounts().accounts({
    gameState: gameStatePda, mapEnemies: mapEnemiesPda, gameSession: sessionPda,
    sessionSigner: sessionSigner.publicKey, magicProgram: PROGRAMS.magicProgram,
    magicContext: PROGRAMS.magicContext,
  }).transaction();
  await sendAndConfirm(erConnection, gsTx, [sessionSigner], 'Undelegate gameplay', 400_000);

  // Undelegate generatedMap
  const mgTx = await new Program(mg, erProvider).methods.undelegateGeneratedMap().accounts({
    generatedMap: generatedMapPda, session: sessionPda, sessionSigner: sessionSigner.publicKey,
    magicProgram: PROGRAMS.magicProgram, magicContext: PROGRAMS.magicContext,
  }).transaction();
  await sendAndConfirm(erConnection, mgTx, [sessionSigner], 'Undelegate generatedMap', 400_000);

  // Undelegate inventory
  const piTx = await new Program(pi, erProvider).methods.undelegateInventory().accounts({
    inventory: inventoryPda, session: sessionPda, sessionSigner: sessionSigner.publicKey,
    magicProgram: PROGRAMS.magicProgram, magicContext: PROGRAMS.magicContext,
  }).transaction();
  await sendAndConfirm(erConnection, piTx, [sessionSigner], 'Undelegate inventory', 400_000);

  // Undelegate mapPois
  const poiTx = await new Program(poi, erProvider).methods.undelegateMapPois().accounts({
    mapPois: mapPoisPda, gameSession: sessionPda, sessionSigner: sessionSigner.publicKey,
    magicProgram: PROGRAMS.magicProgram, magicContext: PROGRAMS.magicContext,
  }).transaction();
  await sendAndConfirm(erConnection, poiTx, [sessionSigner], 'Undelegate mapPois', 400_000);

  // Undelegate session (last)
  const stateHash = Buffer.alloc(32, 0);
  const smTx = await new Program(sm, erProvider).methods.undelegateSession(CAMPAIGN_LEVEL, [...stateHash]).accounts({
    gameSession: sessionPda, player: playerWallet.publicKey, sessionSigner: sessionSigner.publicKey,
    magicProgram: PROGRAMS.magicProgram, magicContext: PROGRAMS.magicContext,
  }).transaction();
  await sendAndConfirm(erConnection, smTx, [sessionSigner], 'Undelegate session', 400_000);

  // Wait for base layer
  console.log('    Waiting for base layer restoration...');
  await sleep(5000);
}

/**
 * End session on the base layer.
 */
async function endSession(baseConnection, sessionSigner, playerWallet, profilePda, pdas) {
  const { sm } = getIdls();
  const sessionProvider = new AnchorProvider(baseConnection, new Wallet(sessionSigner), { commitment: 'confirmed' });
  const smSessionProgram = new Program(sm, sessionProvider);
  const { sessionPda, gameStatePda, mapEnemiesPda, generatedMapPda, inventoryPda, mapPoisPda,
    sessionManagerAuthorityPda } = pdas;

  const tx = await smSessionProgram.methods.endSession(CAMPAIGN_LEVEL).accounts({
    gameSession: sessionPda, gameState: gameStatePda, mapEnemies: mapEnemiesPda,
    generatedMap: generatedMapPda, mapPois: mapPoisPda, playerProfile: profilePda,
    player: playerWallet.publicKey, sessionSigner: sessionSigner.publicKey,
    sessionManagerAuthority: sessionManagerAuthorityPda, inventory: inventoryPda,
    playerInventoryProgram: PROGRAMS.playerInventory, gameplayStateProgram: PROGRAMS.gameplayState,
    playerProfileProgram: PROGRAMS.playerProfile, mapGeneratorProgram: PROGRAMS.mapGenerator,
    poiSystemProgram: PROGRAMS.poiSystem,
  }).transaction();
  await sendAndConfirm(baseConnection, tx, [sessionSigner], 'end_session', 400_000);
}

/**
 * Verify all 6 accounts are closed.
 */
async function verifyCleanup(baseConnection, pdas) {
  const checks = [
    [pdas.sessionPda, 'session'],
    [pdas.gameStatePda, 'game_state'],
    [pdas.mapEnemiesPda, 'map_enemies'],
    [pdas.generatedMapPda, 'generated_map'],
    [pdas.inventoryPda, 'inventory'],
    [pdas.mapPoisPda, 'map_pois'],
  ];
  for (const [pda, name] of checks) {
    const info = await baseConnection.getAccountInfo(pda);
    if (info) throw new Error(`${name} not closed! owner=${info.owner.toBase58()}`);
    console.log(`    ✓ ${name}: CLOSED`);
  }
}

/**
 * Start a new session to verify no orphans block it.
 */
async function verifyNewSession(baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda) {
  const sessionSigner2 = Keypair.generate();
  const { sm } = getIdls();
  const playerProvider = new AnchorProvider(baseConnection, new Wallet(playerWallet), { commitment: 'confirmed' });
  const smProgram = new Program(sm, playerProvider);

  const fundTx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: playerWallet.publicKey, toPubkey: sessionSigner2.publicKey, lamports: 100_000_000,
  }));
  await sendAndConfirm(baseConnection, fundTx, [playerWallet], 'Fund sessionSigner2');

  const [sessionPda] = deriveSessionPda(playerWallet.publicKey, CAMPAIGN_LEVEL);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const tx = await smProgram.methods.startSession(CAMPAIGN_LEVEL).accounts({
    gameSession: sessionPda, sessionCounter: sessionCounterPda, playerProfile: profilePda,
    player: playerWallet.publicKey, sessionSigner: sessionSigner2.publicKey, mapConfig: mapConfigPda,
    generatedMap: generatedMapPda, gameState: gameStatePda, mapEnemies: mapEnemiesPda,
    mapPois: mapPoisPda, inventory: inventoryPda, mapGeneratorProgram: PROGRAMS.mapGenerator,
    gameplayStateProgram: PROGRAMS.gameplayState, poiSystemProgram: PROGRAMS.poiSystem,
    playerInventoryProgram: PROGRAMS.playerInventory, playerProfileProgram: PROGRAMS.playerProfile,
    systemProgram: SystemProgram.programId,
  }).transaction();
  await sendAndConfirm(baseConnection, tx, [playerWallet, sessionSigner2], 'start_session (new)', 1_400_000);

  // Clean up: abandon this session immediately so the PDA is free for next test
  const abandonTx = await smProgram.methods.abandonSession(CAMPAIGN_LEVEL).accounts({
    gameSession: sessionPda, gameState: gameStatePda, mapEnemies: mapEnemiesPda,
    generatedMap: generatedMapPda, mapPois: mapPoisPda, playerProfile: profilePda,
    player: playerWallet.publicKey, sessionSigner: sessionSigner2.publicKey,
    sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0], inventory: inventoryPda,
    playerInventoryProgram: PROGRAMS.playerInventory, gameplayStateProgram: PROGRAMS.gameplayState,
    playerProfileProgram: PROGRAMS.playerProfile, mapGeneratorProgram: PROGRAMS.mapGenerator,
    poiSystemProgram: PROGRAMS.poiSystem,
  }).transaction();
  await sendAndConfirm(baseConnection, abandonTx, [playerWallet, sessionSigner2], 'abandon new session (cleanup)', 400_000);
}

/**
 * Helper: read enemy positions from the GeneratedMap account on the ER.
 * Returns array of {x, y, archetypeId, tier}.
 */
async function readEnemyPositions(erConnection, generatedMapPda) {
  const info = await erConnection.getAccountInfo(generatedMapPda);
  if (!info) throw new Error('GeneratedMap not found on ER');
  const data = Buffer.from(info.data);
  // GeneratedMap layout after 8-byte discriminator:
  // session: 32, width: 1, height: 1, seed: 8, spawn_x: 1, spawn_y: 1,
  // mole_den_x: 1, mole_den_y: 1, walkable_count: 2,
  // packed_tiles: 313, enemy_count: 1, enemies: 48 * EnemySpawn(4)
  const offset = 8; // skip discriminator
  const spawnX = data[offset + 32 + 1 + 1 + 8]; // after session(32) + width(1) + height(1) + seed(8)
  const spawnY = data[offset + 32 + 1 + 1 + 8 + 1];
  const tilesEnd = offset + 32 + 2 + 8 + 4 + 2 + 313; // after packed_tiles
  const enemyCount = data[tilesEnd];
  const enemies = [];
  const enemyStart = tilesEnd + 1;
  // EnemySpawn: archetype_id(1), tier(1), x(1), y(1) = 4 bytes
  for (let i = 0; i < enemyCount; i++) {
    const base = enemyStart + i * 4;
    enemies.push({ archetypeId: data[base], tier: data[base + 1], x: data[base + 2], y: data[base + 3] });
  }
  return { spawnX, spawnY, enemies };
}

/**
 * Helper: make a move on the ER. Returns true if successful, false if error (continues on error).
 */
async function makeMove(erConnection, gsErProgram, sessionSigner, targetX, targetY, pdas, label) {
  const { gameStatePda, sessionPda, mapEnemiesPda, generatedMapPda, inventoryPda,
    gameplayAuthorityPda, mapPoisPda } = pdas;
  const tx = await gsErProgram.methods.movePlayer(targetX, targetY).accounts({
    gameState: gameStatePda, gameSession: sessionPda, mapEnemies: mapEnemiesPda,
    generatedMap: generatedMapPda, inventory: inventoryPda, gameplayAuthority: gameplayAuthorityPda,
    playerInventoryProgram: PROGRAMS.playerInventory, mapGeneratorProgram: PROGRAMS.mapGenerator,
    mapPois: mapPoisPda, poiSystemProgram: PROGRAMS.poiSystem, player: sessionSigner.publicKey,
  }).transaction();
  await sendAndConfirm(erConnection, tx, [sessionSigner], label, 400_000);
}

/**
 * Helper: Read GameState from ER using Anchor deserialization.
 */
async function readGameState(erConnection, gameStatePda) {
  const { gs } = getIdls();
  const provider = new AnchorProvider(erConnection, new Wallet(Keypair.generate()), { commitment: 'confirmed' });
  const program = new Program(gs, provider);
  return await program.account.gameState.fetch(gameStatePda);
}

// ============================================================================
// SCENARIO 1: Player dies to field enemy
// ============================================================================

async function scenario1_DeathByEnemy(baseConnection, erConnection) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 1: Player dies to a field enemy       ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('  [Setup]');
  const { playerWallet, profilePda, sessionCounterPda, mapConfigPda } = await setupPlayer(baseConnection);

  console.log('  [Start session]');
  const { sessionSigner, ...pdas } = await startSession(
    baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda
  );

  console.log('  [Delegate to ER]');
  await delegateToER(baseConnection, erConnection, sessionSigner, playerWallet, pdas);

  console.log('  [Gameplay: walk into an enemy]');
  // Read enemy positions from the map
  const { spawnX, spawnY, enemies } = await readEnemyPositions(erConnection, pdas.generatedMapPda);
  console.log(`    Spawn: (${spawnX}, ${spawnY}), enemies on map: ${enemies.length}`);

  // Sort enemies by distance from spawn
  const sortedEnemies = enemies
    .map(e => ({ ...e, dist: Math.abs(e.x - spawnX) + Math.abs(e.y - spawnY) }))
    .sort((a, b) => a.dist - b.dist);
  console.log(`    Nearest enemies: ${sortedEnemies.slice(0, 5).map(e => `(${e.x},${e.y}) d=${e.dist}`).join(', ')}`);

  // Navigate toward enemies one by one until dead
  const { gs } = getIdls();
  const erProvider = new AnchorProvider(erConnection, new Wallet(sessionSigner), { commitment: 'confirmed' });
  const gsErProgram = new Program(gs, erProvider);

  let currentState = await readGameState(erConnection, pdas.gameStatePda);
  let moveCount = 0;
  let targetIdx = 0;

  while (!currentState.isDead && moveCount < 300 && targetIdx < sortedEnemies.length) {
    const target = sortedEnemies[targetIdx];
    const cx = currentState.positionX;
    const cy = currentState.positionY;

    // If on target tile, move to next enemy
    if (cx === target.x && cy === target.y) {
      console.log(`    Reached enemy #${targetIdx + 1} at (${target.x},${target.y}). HP=${currentState.hp}`);
      targetIdx++;
      continue;
    }

    // Move one step toward the target enemy
    let nx = cx, ny = cy;
    if (cx < target.x) nx = cx + 1;
    else if (cx > target.x) nx = cx - 1;
    else if (cy < target.y) ny = cy + 1;
    else if (cy > target.y) ny = cy - 1;

    try {
      await makeMove(erConnection, gsErProgram, sessionSigner, nx, ny, pdas, `Move #${moveCount + 1} → (${nx},${ny})`);
      moveCount++;
    } catch (err) {
      // Move might fail if hitting a wall. Try orthogonal direction to get around it.
      const wallDirs = [];
      if (nx !== cx) { wallDirs.push([cx, cy + 1]); wallDirs.push([cx, cy - 1]); }
      else { wallDirs.push([cx + 1, cy]); wallDirs.push([cx - 1, cy]); }
      let moved = false;
      for (const [ax, ay] of wallDirs) {
        if (ax < 0 || ay < 0 || ax >= 50 || ay >= 50) continue;
        try {
          await makeMove(erConnection, gsErProgram, sessionSigner, ax, ay, pdas, `Move alt #${moveCount + 1} → (${ax},${ay})`);
          moveCount++;
          moved = true;
          break;
        } catch { /* try next */ }
      }
      if (!moved) moveCount++; // prevent infinite loop
    }

    currentState = await readGameState(erConnection, pdas.gameStatePda);
  }

  if (!currentState.isDead) throw new Error(`Player did not die after ${moveCount} moves and ${targetIdx} enemies! HP=${currentState.hp}`);
  console.log(`    ✓ Player DIED to field enemy after ${moveCount} moves. HP=${currentState.hp}`);

  console.log('  [Undelegate]');
  await undelegateFromER(baseConnection, erConnection, sessionSigner, playerWallet, pdas);

  console.log('  [End session]');
  await endSession(baseConnection, sessionSigner, playerWallet, profilePda, pdas);

  console.log('  [Verify cleanup]');
  await verifyCleanup(baseConnection, pdas);

  console.log('  [Verify new session]');
  await verifyNewSession(baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda);

  console.log('\n  ✓ SCENARIO 1 PASSED: Death by field enemy → full cleanup\n');
}

// ============================================================================
// SCENARIO 2: Player dies to boss
// ============================================================================

async function scenario2_DeathByBoss(baseConnection, erConnection) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 2: Player dies to a boss              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('  [Setup]');
  const { playerWallet, profilePda, sessionCounterPda, mapConfigPda } = await setupPlayer(baseConnection);

  console.log('  [Start session]');
  const { sessionSigner, ...pdas } = await startSession(
    baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda
  );

  console.log('  [Delegate to ER]');
  await delegateToER(baseConnection, erConnection, sessionSigner, playerWallet, pdas);

  console.log('  [Gameplay: exhaust all phases then trigger boss fight]');
  const { gs } = getIdls();
  const erProvider = new AnchorProvider(erConnection, new Wallet(sessionSigner), { commitment: 'confirmed' });
  const gsErProgram = new Program(gs, erProvider);

  // Read spawn position for safe bouncing
  const { spawnX, spawnY } = await readEnemyPositions(erConnection, pdas.generatedMapPda);

  // Bounce between two safe tiles near spawn to exhaust all 6 phases
  // Day1=50, Night1=30, Day2=50, Night2=30, Day3=50, Night3=30 = 240 moves per week
  let moveCount = 0;
  let state = await readGameState(erConnection, pdas.gameStatePda);
  const maxMoves = 260; // slight buffer above 240

  while (moveCount < maxMoves && !state.isDead && !state.bossFightReady) {
    // Heal player every 10 moves to survive night enemy encounters (high HP so combat doesn't kill)
    if (moveCount > 0 && moveCount % 10 === 0) {
      const healTx = await gsErProgram.methods.testSetHp(9999).accounts({
        gameState: pdas.gameStatePda, sessionSigner: sessionSigner.publicKey,
      }).transaction();
      await sendAndConfirm(erConnection, healTx, [sessionSigner], null, 200_000);
    }

    // Bounce between spawnX and spawnX+1
    const tx = (moveCount % 2 === 0) ? spawnX + 1 : spawnX;
    const ty = spawnY;
    try {
      await makeMove(erConnection, gsErProgram, sessionSigner, tx, ty, pdas, `Move #${moveCount + 1}`);
    } catch {
      // If one direction fails, try other direction
      try {
        const altY = (moveCount % 2 === 0) ? spawnY + 1 : spawnY;
        await makeMove(erConnection, gsErProgram, sessionSigner, spawnX, altY, pdas, `Move alt #${moveCount + 1}`);
      } catch { /* skip */ }
    }
    moveCount++;

    if (moveCount % 40 === 0) {
      state = await readGameState(erConnection, pdas.gameStatePda);
      const phaseNames = ['Day1', 'Night1', 'Day2', 'Night2', 'Day3', 'Night3'];
      const phaseName = phaseNames[Object.keys(state.phase)[0] === 'day1' ? 0 :
        Object.keys(state.phase)[0] === 'night1' ? 1 : Object.keys(state.phase)[0] === 'day2' ? 2 :
        Object.keys(state.phase)[0] === 'night2' ? 3 : Object.keys(state.phase)[0] === 'day3' ? 4 : 5];
      console.log(`    Status: move=${moveCount} HP=${state.hp} phase=${phaseName} week=${state.week} moves_left=${state.movesRemaining} boss_ready=${state.bossFightReady}`);
    }
  }

  // Reset HP to normal before boss fight (player may have died to night enemies)
  const resetHpTx = await gsErProgram.methods.testSetHp(25).accounts({
    gameState: pdas.gameStatePda, sessionSigner: sessionSigner.publicKey,
  }).transaction();
  await sendAndConfirm(erConnection, resetHpTx, [sessionSigner], null, 200_000);

  state = await readGameState(erConnection, pdas.gameStatePda);
  if (!state.bossFightReady) throw new Error(`Boss fight not ready after ${moveCount} moves`);

  console.log(`    ✓ Boss fight ready after ${moveCount} moves. HP=${state.hp} isDead=${state.isDead}. Triggering boss fight...`);

  // Trigger boss fight (player has 0 ATK → will die to boss)
  const bossTx = await gsErProgram.methods.triggerBossFight().accounts({
    gameState: pdas.gameStatePda, gameSession: pdas.sessionPda, mapEnemies: pdas.mapEnemiesPda,
    generatedMap: pdas.generatedMapPda, inventory: pdas.inventoryPda,
    gameplayAuthority: pdas.gameplayAuthorityPda,
    playerInventoryProgram: PROGRAMS.playerInventory, player: sessionSigner.publicKey,
  }).transaction();
  await sendAndConfirm(erConnection, bossTx, [sessionSigner], 'trigger_boss_fight', 400_000);

  state = await readGameState(erConnection, pdas.gameStatePda);
  if (!state.isDead) throw new Error('Player did not die to boss!');
  console.log(`    ✓ Player DIED to boss. HP=${state.hp}`);

  console.log('  [Undelegate]');
  await undelegateFromER(baseConnection, erConnection, sessionSigner, playerWallet, pdas);

  console.log('  [End session]');
  await endSession(baseConnection, sessionSigner, playerWallet, profilePda, pdas);

  console.log('  [Verify cleanup]');
  await verifyCleanup(baseConnection, pdas);

  console.log('  [Verify new session]');
  await verifyNewSession(baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda);

  console.log('\n  ✓ SCENARIO 2 PASSED: Death by boss → full cleanup\n');
}

// ============================================================================
// SCENARIO 3: Player wins (completes the level)
// ============================================================================

async function scenario3_Victory(baseConnection, erConnection) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SCENARIO 3: Player wins (victory + unlocks)    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.log('  [Setup]');
  const { playerWallet, profilePda, sessionCounterPda, mapConfigPda } = await setupPlayer(baseConnection);

  // Read initial profile state for comparison after victory
  const { pp } = getIdls();
  const playerProvider = new AnchorProvider(baseConnection, new Wallet(playerWallet), { commitment: 'confirmed' });
  const ppProgram = new Program(pp, playerProvider);
  const profileBefore = await ppProgram.account.playerProfile.fetch(profilePda);
  console.log(`    Profile before: highest_level=${profileBefore.highestLevelUnlocked}, unlocked_items=${Buffer.from(profileBefore.unlockedItems).toString('hex')}`);

  console.log('  [Start session]');
  const { sessionSigner, ...pdas } = await startSession(
    baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda
  );

  console.log('  [Delegate to ER]');
  await delegateToER(baseConnection, erConnection, sessionSigner, playerWallet, pdas);

  console.log('  [Gameplay: set completed=true via test instruction]');
  // Use the test_set_completed instruction to set game_state.completed = true
  // This simulates winning all 3 boss fights without needing actual combat gear
  const { gs } = getIdls();
  const erProvider = new AnchorProvider(erConnection, new Wallet(sessionSigner), { commitment: 'confirmed' });
  const gsErProgram = new Program(gs, erProvider);

  const completeTx = await gsErProgram.methods.testSetCompleted().accounts({
    gameState: pdas.gameStatePda,
    sessionSigner: sessionSigner.publicKey,
  }).transaction();
  await sendAndConfirm(erConnection, completeTx, [sessionSigner], 'test_set_completed', 200_000);

  const state = await readGameState(erConnection, pdas.gameStatePda);
  if (!state.completed) throw new Error('completed flag not set!');
  if (state.isDead) throw new Error('Player should not be dead!');
  console.log(`    ✓ game_state.completed=${state.completed}, is_dead=${state.isDead}`);

  console.log('  [Undelegate]');
  await undelegateFromER(baseConnection, erConnection, sessionSigner, playerWallet, pdas);

  console.log('  [End session (victory path)]');
  await endSession(baseConnection, sessionSigner, playerWallet, profilePda, pdas);

  console.log('  [Verify cleanup]');
  await verifyCleanup(baseConnection, pdas);

  console.log('  [Verify level + item unlock]');
  const profileAfter = await ppProgram.account.playerProfile.fetch(profilePda);
  console.log(`    Profile after: highest_level=${profileAfter.highestLevelUnlocked}, unlocked_items=${Buffer.from(profileAfter.unlockedItems).toString('hex')}`);

  if (profileAfter.highestLevelUnlocked <= profileBefore.highestLevelUnlocked) {
    throw new Error(`Level not unlocked! Before=${profileBefore.highestLevelUnlocked} After=${profileAfter.highestLevelUnlocked}`);
  }
  console.log(`    ✓ Level unlocked: ${profileBefore.highestLevelUnlocked} → ${profileAfter.highestLevelUnlocked}`);

  const itemsBefore = Buffer.from(profileBefore.unlockedItems).toString('hex');
  const itemsAfter = Buffer.from(profileAfter.unlockedItems).toString('hex');
  if (itemsAfter === itemsBefore) {
    throw new Error('No new item unlocked!');
  }
  console.log(`    ✓ New item unlocked (bitmask changed)`);

  console.log('  [Verify new session]');
  await verifyNewSession(baseConnection, playerWallet, profilePda, sessionCounterPda, mapConfigPda);

  console.log('\n  ✓ SCENARIO 3 PASSED: Victory → level unlock + item unlock + full cleanup\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  E2E Session Lifecycle Test — Three Scenarios           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const baseConnection = new Connection(BASE_RPC, 'confirmed');
  const erConnection = new Connection(ER_RPC, 'confirmed');

  // Preload IDLs
  getIdls();

  await scenario1_DeathByEnemy(baseConnection, erConnection);
  await scenario2_DeathByBoss(baseConnection, erConnection);
  await scenario3_Victory(baseConnection, erConnection);

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ALL 3 SCENARIOS PASSED                                ║');
  console.log('║                                                        ║');
  console.log('║  ✓ Scenario 1: Death by field enemy                    ║');
  console.log('║  ✓ Scenario 2: Death by boss                          ║');
  console.log('║  ✓ Scenario 3: Victory (level + item unlock)          ║');
  console.log('║                                                        ║');
  console.log('║  Session teardown verified for all game outcomes.      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error(`\n✗ E2E TEST FAILED: ${err.message}`);
  if (err.logs) console.error('Logs:', err.logs.join('\n'));
  process.exit(1);
});
