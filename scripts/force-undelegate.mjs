#!/usr/bin/env node
/**
 * Force-undelegate orphaned accounts by calling the Delegation Program
 * directly on the base layer, signed by the ER validator identity.
 *
 * Flow: CommitState (allow_undelegation=true) → Finalize → Undelegate
 *
 * Usage: node scripts/force-undelegate.mjs
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import * as borsh from 'borsh';
import fs from 'fs';

const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

// DlpDiscriminator enum values (8-byte LE u64)
function disc(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}
const COMMIT_DIFF_DISC = disc(16);   // CommitDiff = 16
const FINALIZE_DISC = disc(2);       // Finalize = 2
const UNDELEGATE_DISC = disc(3);     // Undelegate = 3

const ER_VALIDATOR_KEYPAIR_PATH = '/tmp/mb-er-storage/validator-keypair.json';
const BASE_RPC = process.env.BASE_RPC || 'http://127.0.0.1:8899';

// Program IDs must match .env (used for PDA derivation)
const SESSION_MANAGER_PROGRAM = new PublicKey('6w1XVMSTRmZU9AWCKVvKohGAHSFMENhda7vqhKPQ8TPn');
const GAMEPLAY_STATE_PROGRAM = new PublicKey('C8hK4qsqsSYQeqyXuTPTUUS3T7N74WnZCuzvChTpK1Mo');
const MAP_GENERATOR_PROGRAM = new PublicKey('GCy5GqvnJN99rgGtV6fMn8NtL9E7RoAyHDGzQv8me65j');
const PLAYER_INVENTORY_PROGRAM = new PublicKey('APRnvp41jEYnT1EnrdBTim7bodqE6v2RSgzv1CG7Qv7u');
const POI_SYSTEM_PROGRAM = new PublicKey('KiT25b86BSAF8yErcWwyuuWNaoXMpNf859NjH41TpSj');

function deriveSessionPda(player, campaignLevel) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game_session'), player.toBuffer(), Buffer.from([campaignLevel])],
    SESSION_MANAGER_PROGRAM
  )[0];
}
function deriveGauntletSessionPda(player) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('gauntlet_session'), player.toBuffer()],
    SESSION_MANAGER_PROGRAM
  )[0];
}
function deriveGameStatePda(session) {
  return PublicKey.findProgramAddressSync([Buffer.from('game_state'), session.toBuffer()], GAMEPLAY_STATE_PROGRAM)[0];
}
function deriveMapEnemiesPda(session) {
  return PublicKey.findProgramAddressSync([Buffer.from('map_enemies'), session.toBuffer()], GAMEPLAY_STATE_PROGRAM)[0];
}
function deriveGeneratedMapPda(session) {
  return PublicKey.findProgramAddressSync([Buffer.from('generated_map'), session.toBuffer()], MAP_GENERATOR_PROGRAM)[0];
}
function deriveInventoryPda(session) {
  return PublicKey.findProgramAddressSync([Buffer.from('inventory'), session.toBuffer()], PLAYER_INVENTORY_PROGRAM)[0];
}
function deriveMapPoisPda(session) {
  return PublicKey.findProgramAddressSync([Buffer.from('map_pois'), session.toBuffer()], POI_SYSTEM_PROGRAM)[0];
}

function derivePda(seed, key) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), key.toBuffer()], DELEGATION_PROGRAM_ID)[0];
}

function deriveFeesVault() {
  return PublicKey.findProgramAddressSync([Buffer.from('fees-vault')], DELEGATION_PROGRAM_ID)[0];
}

function deriveValidatorFeesVault(validator) {
  return PublicKey.findProgramAddressSync([Buffer.from('v-fees-vault'), validator.toBuffer()], DELEGATION_PROGRAM_ID)[0];
}

function deriveProgramConfig(ownerProgram) {
  return PublicKey.findProgramAddressSync([Buffer.from('p-conf'), ownerProgram.toBuffer()], DELEGATION_PROGRAM_ID)[0];
}

/**
 * Borsh-serialize CommitDiffArgs:
 *   diff: Vec<u8> (first), then nonce: u64, lamports: u64, allow_undelegation: bool
 *
 * The processor splits instruction data (after 8-byte disc) as:
 *   diff = data[0 .. data.len() - 17]
 *   rest = data[data.len() - 17 ..]  // nonce(8) + lamports(8) + allow_undelegation(1)
 *
 * The diff is a Borsh Vec<u8> wrapping a DiffSet binary:
 *   [4-byte vec_len] [changed_len: u32] [segments_count: u32] [offset pairs...] [diff bytes...]
 *
 * For an empty diff (no state changes, just flipping the flag):
 *   vec_len = 8, then changed_len = 0, segments_count = 0
 */
function serializeCommitDiffArgs(nonce, lamports, allowUndelegation) {
  // Empty diff: 4-byte vec length (8) + 8 bytes diff header + 8 bytes nonce + 8 bytes lamports + 1 byte bool
  const buf = Buffer.alloc(4 + 8 + 8 + 8 + 1);
  let offset = 0;
  buf.writeUInt32LE(8, offset); offset += 4;   // Borsh Vec<u8> length = 8 bytes of diff data
  buf.writeUInt32LE(0, offset); offset += 4;   // changed_len = 0
  buf.writeUInt32LE(0, offset); offset += 4;   // segments_count = 0
  buf.writeBigUInt64LE(BigInt(nonce), offset); offset += 8;
  buf.writeBigUInt64LE(BigInt(lamports), offset); offset += 8;
  buf.writeUInt8(allowUndelegation ? 1 : 0, offset);
  return buf;
}

function createCommitDiffIx(validator, delegatedAccount, ownerProgram, nonce, lamports) {
  const commitStatePda = derivePda('state-diff', delegatedAccount);
  const commitRecordPda = derivePda('commit-state-record', delegatedAccount);
  const delegationRecordPda = derivePda('delegation', delegatedAccount);
  const delegationMetadataPda = derivePda('delegation-metadata', delegatedAccount);
  const validatorFeesVaultPda = deriveValidatorFeesVault(validator);
  const programConfigPda = deriveProgramConfig(ownerProgram);

  const args = serializeCommitDiffArgs(nonce + 1, lamports, true);
  const data = Buffer.concat([COMMIT_DIFF_DISC, args]);

  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: false },
      { pubkey: delegatedAccount, isSigner: false, isWritable: false },
      { pubkey: commitStatePda, isSigner: false, isWritable: true },
      { pubkey: commitRecordPda, isSigner: false, isWritable: true },
      { pubkey: delegationRecordPda, isSigner: false, isWritable: false },
      { pubkey: delegationMetadataPda, isSigner: false, isWritable: true },
      { pubkey: validatorFeesVaultPda, isSigner: false, isWritable: false },
      { pubkey: programConfigPda, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function createFinalizeIx(validator, delegatedAccount) {
  const commitStatePda = derivePda('state-diff', delegatedAccount);
  const commitRecordPda = derivePda('commit-state-record', delegatedAccount);
  const delegationRecordPda = derivePda('delegation', delegatedAccount);
  const delegationMetadataPda = derivePda('delegation-metadata', delegatedAccount);
  const validatorFeesVaultPda = deriveValidatorFeesVault(validator);

  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: true },
      { pubkey: delegatedAccount, isSigner: false, isWritable: true },
      { pubkey: commitStatePda, isSigner: false, isWritable: true },
      { pubkey: commitRecordPda, isSigner: false, isWritable: true },
      { pubkey: delegationRecordPda, isSigner: false, isWritable: true },
      { pubkey: delegationMetadataPda, isSigner: false, isWritable: true },
      { pubkey: validatorFeesVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: FINALIZE_DISC,
  });
}

function createUndelegateIx(validator, delegatedAccount, ownerProgram, rentReimbursement) {
  const undelegateBufferPda = derivePda('undelegate-buffer', delegatedAccount);
  const commitStatePda = derivePda('state-diff', delegatedAccount);
  const commitRecordPda = derivePda('commit-state-record', delegatedAccount);
  const delegationRecordPda = derivePda('delegation', delegatedAccount);
  const delegationMetadataPda = derivePda('delegation-metadata', delegatedAccount);
  const feesVaultPda = deriveFeesVault();
  const validatorFeesVaultPda = deriveValidatorFeesVault(validator);

  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: true },
      { pubkey: delegatedAccount, isSigner: false, isWritable: true },
      { pubkey: ownerProgram, isSigner: false, isWritable: false },
      { pubkey: undelegateBufferPda, isSigner: false, isWritable: true },
      { pubkey: commitStatePda, isSigner: false, isWritable: false },
      { pubkey: commitRecordPda, isSigner: false, isWritable: false },
      { pubkey: delegationRecordPda, isSigner: false, isWritable: true },
      { pubkey: delegationMetadataPda, isSigner: false, isWritable: true },
      { pubkey: rentReimbursement, isSigner: false, isWritable: true },
      { pubkey: feesVaultPda, isSigner: false, isWritable: true },
      { pubkey: validatorFeesVaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: UNDELEGATE_DISC,
  });
}

async function readDelegationInfo(connection, delegatedAccount) {
  const metadataPda = derivePda('delegation-metadata', delegatedAccount);
  const recordPda = derivePda('delegation', delegatedAccount);

  const [metaInfo, recInfo, acctInfo] = await Promise.all([
    connection.getAccountInfo(metadataPda),
    connection.getAccountInfo(recordPda),
    connection.getAccountInfo(delegatedAccount),
  ]);

  if (!metaInfo || !recInfo || !acctInfo) {
    return null;
  }

  // DelegationMetadata (Borsh): skip 8-byte disc
  // Layout: [8 disc][8 nonce][1 is_undelegatable][Vec<Vec<u8>> seeds][32 rent_payer]
  const nonce = Number(metaInfo.data.readBigUInt64LE(8));
  const isUndelegatable = metaInfo.data[16] !== 0;

  // Parse seeds (Vec<Vec<u8>>) to find rent_payer after it
  let seedsOffset = 17; // after disc(8) + nonce(8) + is_undelegatable(1)
  const numSeeds = metaInfo.data.readUInt32LE(seedsOffset); seedsOffset += 4;
  for (let i = 0; i < numSeeds; i++) {
    const seedLen = metaInfo.data.readUInt32LE(seedsOffset); seedsOffset += 4;
    seedsOffset += seedLen; // skip seed bytes
  }
  const rentPayer = new PublicKey(metaInfo.data.slice(seedsOffset, seedsOffset + 32));

  // DelegationRecord (zero-copy C layout): skip 8-byte disc
  const authority = new PublicKey(recInfo.data.slice(8, 40));
  const owner = new PublicKey(recInfo.data.slice(40, 72));
  const lamports = Number(recInfo.data.readBigUInt64LE(80));

  return { nonce, isUndelegatable, authority, owner, lamports, accountLamports: acctInfo.lamports, rentPayer };
}

async function forceUndelegate(connection, validatorKeypair, delegatedAccount, ownerProgram) {
  const info = await readDelegationInfo(connection, delegatedAccount);
  if (!info) {
    console.log('  Missing delegation info. Skipping.');
    return false;
  }

  console.log(`  nonce=${info.nonce} lamports=${info.lamports} is_undelegatable=${info.isUndelegatable}`);
  console.log(`  authority=${info.authority.toBase58()}`);
  console.log(`  owner_program=${info.owner.toBase58()}`);
  console.log(`  rent_payer=${info.rentPayer.toBase58()}`);
  console.log(`  account_lamports=${info.accountLamports}`);

  if (!info.authority.equals(validatorKeypair.publicKey)) {
    console.error('  ERROR: Delegation authority does not match ER validator.');
    return false;
  }

  // Step 1: CommitDiff with empty diff + allow_undelegation=true
  console.log('  Step 1: CommitDiff (empty diff, allow_undelegation=true)...');
  const commitIx = createCommitDiffIx(
    validatorKeypair.publicKey,
    delegatedAccount,
    ownerProgram,
    info.nonce,
    info.lamports
  );

  try {
    const tx1 = new Transaction().add(commitIx);
    tx1.feePayer = validatorKeypair.publicKey;
    const { blockhash: bh1 } = await connection.getLatestBlockhash('confirmed');
    tx1.recentBlockhash = bh1;
    tx1.sign(validatorKeypair);
    const sig1 = await connection.sendRawTransaction(tx1.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
    await connection.confirmTransaction(sig1, 'confirmed');
    console.log(`  CommitDiff confirmed: ${sig1}`);
  } catch (err) {
    console.error('  CommitDiff FAILED:', err.message);
    if (err.logs) console.error('  Logs:', err.logs.join('\n  '));
    return false;
  }

  // Step 2: Finalize
  console.log('  Step 2: Finalize...');
  const finalizeIx = createFinalizeIx(validatorKeypair.publicKey, delegatedAccount);
  try {
    const tx2 = new Transaction().add(finalizeIx);
    tx2.feePayer = validatorKeypair.publicKey;
    const { blockhash: bh2 } = await connection.getLatestBlockhash('confirmed');
    tx2.recentBlockhash = bh2;
    tx2.sign(validatorKeypair);
    const sig2 = await connection.sendRawTransaction(tx2.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
    await connection.confirmTransaction(sig2, 'confirmed');
    console.log(`  Finalize confirmed: ${sig2}`);
  } catch (err) {
    console.error('  Finalize FAILED:', err.message);
    if (err.logs) console.error('  Logs:', err.logs.join('\n  '));
    return false;
  }

  // Step 3: Undelegate
  console.log('  Step 3: Undelegate...');
  // Re-read delegation info to get updated state after CommitDiff+Finalize
  const updatedInfo = await readDelegationInfo(connection, delegatedAccount);
  const rentRecipient = updatedInfo ? updatedInfo.rentPayer : info.rentPayer;
  console.log(`  Using rent_recipient: ${rentRecipient.toBase58()}`);
  const undelegateIx = createUndelegateIx(
    validatorKeypair.publicKey,
    delegatedAccount,
    ownerProgram,
    rentRecipient
  );
  try {
    const tx3 = new Transaction().add(undelegateIx);
    tx3.feePayer = validatorKeypair.publicKey;
    const { blockhash: bh3 } = await connection.getLatestBlockhash('confirmed');
    tx3.recentBlockhash = bh3;
    tx3.sign(validatorKeypair);
    const sig3 = await connection.sendRawTransaction(tx3.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
    await connection.confirmTransaction(sig3, 'confirmed');
    console.log(`  Undelegate confirmed: ${sig3}`);
  } catch (err) {
    console.error('  Undelegate FAILED:', err.message);
    if (err.logs) console.error('  Logs:', err.logs.join('\n  '));
    return false;
  }

  // Verify
  const afterInfo = await connection.getAccountInfo(delegatedAccount);
  if (!afterInfo) {
    console.log('  Account closed after undelegation.');
  } else {
    console.log(`  New owner: ${afterInfo.owner.toBase58()}`);
  }
  return true;
}

async function scanForDelegatedAccounts(connection, playerWallet) {
  const accounts = [];

  // Scan campaign levels 1-40
  for (let level = 1; level <= 40; level++) {
    const sessionPda = deriveSessionPda(playerWallet, level);
    const children = [
      { name: `L${level} session`, address: sessionPda, ownerProgram: SESSION_MANAGER_PROGRAM },
      { name: `L${level} game_state`, address: deriveGameStatePda(sessionPda), ownerProgram: GAMEPLAY_STATE_PROGRAM },
      { name: `L${level} map_enemies`, address: deriveMapEnemiesPda(sessionPda), ownerProgram: GAMEPLAY_STATE_PROGRAM },
      { name: `L${level} generated_map`, address: deriveGeneratedMapPda(sessionPda), ownerProgram: MAP_GENERATOR_PROGRAM },
      { name: `L${level} inventory`, address: deriveInventoryPda(sessionPda), ownerProgram: PLAYER_INVENTORY_PROGRAM },
      { name: `L${level} map_pois`, address: deriveMapPoisPda(sessionPda), ownerProgram: POI_SYSTEM_PROGRAM },
    ];
    const infos = await connection.getMultipleAccountsInfo(children.map((c) => c.address));
    for (let i = 0; i < children.length; i++) {
      if (infos[i] && infos[i].owner.equals(DELEGATION_PROGRAM_ID)) {
        accounts.push(children[i]);
      }
    }
  }

  // Also scan gauntlet session
  const gauntletPda = deriveGauntletSessionPda(playerWallet);
  const gauntletChildren = [
    { name: 'gauntlet session', address: gauntletPda, ownerProgram: SESSION_MANAGER_PROGRAM },
    { name: 'gauntlet game_state', address: deriveGameStatePda(gauntletPda), ownerProgram: GAMEPLAY_STATE_PROGRAM },
    { name: 'gauntlet map_enemies', address: deriveMapEnemiesPda(gauntletPda), ownerProgram: GAMEPLAY_STATE_PROGRAM },
    { name: 'gauntlet generated_map', address: deriveGeneratedMapPda(gauntletPda), ownerProgram: MAP_GENERATOR_PROGRAM },
    { name: 'gauntlet inventory', address: deriveInventoryPda(gauntletPda), ownerProgram: PLAYER_INVENTORY_PROGRAM },
    { name: 'gauntlet map_pois', address: deriveMapPoisPda(gauntletPda), ownerProgram: POI_SYSTEM_PROGRAM },
  ];
  const gauntletInfos = await connection.getMultipleAccountsInfo(gauntletChildren.map((c) => c.address));
  for (let i = 0; i < gauntletChildren.length; i++) {
    if (gauntletInfos[i] && gauntletInfos[i].owner.equals(DELEGATION_PROGRAM_ID)) {
      accounts.push(gauntletChildren[i]);
    }
  }

  return accounts;
}

async function main() {
  const playerArg = process.argv[2];
  if (!playerArg) {
    console.error('Usage: node scripts/force-undelegate.mjs <PLAYER_WALLET_PUBKEY>');
    process.exit(1);
  }
  const playerWallet = new PublicKey(playerArg);
  console.log('Player wallet:', playerWallet.toBase58());

  const validatorKeypairData = JSON.parse(fs.readFileSync(ER_VALIDATOR_KEYPAIR_PATH, 'utf-8'));
  const validatorKeypair = Keypair.fromSecretKey(new Uint8Array(validatorKeypairData));
  console.log('ER validator:', validatorKeypair.publicKey.toBase58());

  const connection = new Connection(BASE_RPC, 'confirmed');

  // Fund ER validator on base layer if needed
  const balance = await connection.getBalance(validatorKeypair.publicKey);
  if (balance < 100_000_000) {
    console.log('Requesting airdrop for ER validator...');
    const sig = await connection.requestAirdrop(validatorKeypair.publicKey, 2_000_000_000);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Airdrop confirmed');
  }

  console.log('\nScanning for delegated accounts...');
  const orphanedAccounts = await scanForDelegatedAccounts(connection, playerWallet);

  if (orphanedAccounts.length === 0) {
    console.log('No delegated accounts found. Nothing to do.');
    return;
  }

  console.log(`Found ${orphanedAccounts.length} delegated account(s):`);
  for (const { name, address } of orphanedAccounts) {
    console.log(`  ${name}: ${address.toBase58()}`);
  }

  for (const { name, address, ownerProgram } of orphanedAccounts) {
    console.log(`\n=== ${name}: ${address.toBase58()} ===`);
    await forceUndelegate(connection, validatorKeypair, address, ownerProgram);
  }

  console.log('\nDone!');
}

main().catch(console.error);
