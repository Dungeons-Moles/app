#!/usr/bin/env node
/**
 * Force-undelegate specific accounts by address.
 * Uses the delegation record to determine the owner program automatically.
 *
 * Usage: node scripts/force-undelegate-direct.mjs <ACCOUNT_PUBKEY> [<ACCOUNT_PUBKEY> ...]
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import fs from 'fs';

const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

function disc(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}
const COMMIT_DIFF_DISC = disc(16);
const FINALIZE_DISC = disc(2);
const UNDELEGATE_DISC = disc(3);

const ER_VALIDATOR_KEYPAIR_PATH = '/tmp/mb-er-storage/validator-keypair.json';
const BASE_RPC = process.env.BASE_RPC || 'http://127.0.0.1:8899';

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

function serializeCommitDiffArgs(nonce, lamports, allowUndelegation) {
  const buf = Buffer.alloc(4 + 8 + 8 + 8 + 1);
  let offset = 0;
  buf.writeUInt32LE(8, offset); offset += 4;
  buf.writeUInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(0, offset); offset += 4;
  buf.writeBigUInt64LE(BigInt(nonce), offset); offset += 8;
  buf.writeBigUInt64LE(BigInt(lamports), offset); offset += 8;
  buf.writeUInt8(allowUndelegation ? 1 : 0, offset);
  return buf;
}

function createCommitDiffIx(validator, delegatedAccount, ownerProgram, nonce, lamports) {
  const args = serializeCommitDiffArgs(nonce + 1, lamports, true);
  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: false },
      { pubkey: delegatedAccount, isSigner: false, isWritable: false },
      { pubkey: derivePda('state-diff', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('commit-state-record', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('delegation', delegatedAccount), isSigner: false, isWritable: false },
      { pubkey: derivePda('delegation-metadata', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: deriveValidatorFeesVault(validator), isSigner: false, isWritable: false },
      { pubkey: deriveProgramConfig(ownerProgram), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([COMMIT_DIFF_DISC, args]),
  });
}

function createFinalizeIx(validator, delegatedAccount) {
  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: true },
      { pubkey: delegatedAccount, isSigner: false, isWritable: true },
      { pubkey: derivePda('state-diff', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('commit-state-record', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('delegation', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('delegation-metadata', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: deriveValidatorFeesVault(validator), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: FINALIZE_DISC,
  });
}

function createUndelegateIx(validator, delegatedAccount, ownerProgram, rentReimbursement) {
  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: true },
      { pubkey: delegatedAccount, isSigner: false, isWritable: true },
      { pubkey: ownerProgram, isSigner: false, isWritable: false },
      { pubkey: derivePda('undelegate-buffer', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('state-diff', delegatedAccount), isSigner: false, isWritable: false },
      { pubkey: derivePda('commit-state-record', delegatedAccount), isSigner: false, isWritable: false },
      { pubkey: derivePda('delegation', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: derivePda('delegation-metadata', delegatedAccount), isSigner: false, isWritable: true },
      { pubkey: rentReimbursement, isSigner: false, isWritable: true },
      { pubkey: deriveFeesVault(), isSigner: false, isWritable: true },
      { pubkey: deriveValidatorFeesVault(validator), isSigner: false, isWritable: true },
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
  if (!metaInfo || !recInfo || !acctInfo) return null;

  const nonce = Number(metaInfo.data.readBigUInt64LE(8));
  const isUndelegatable = metaInfo.data[16] !== 0;
  let seedsOffset = 17;
  const numSeeds = metaInfo.data.readUInt32LE(seedsOffset); seedsOffset += 4;
  for (let i = 0; i < numSeeds; i++) {
    const seedLen = metaInfo.data.readUInt32LE(seedsOffset); seedsOffset += 4;
    seedsOffset += seedLen;
  }
  const rentPayer = new PublicKey(metaInfo.data.slice(seedsOffset, seedsOffset + 32));
  const authority = new PublicKey(recInfo.data.slice(8, 40));
  const owner = new PublicKey(recInfo.data.slice(40, 72));
  const lamports = Number(recInfo.data.readBigUInt64LE(80));
  return { nonce, isUndelegatable, authority, owner, lamports, accountLamports: acctInfo.lamports, rentPayer };
}

async function sendTx(connection, validatorKeypair, ix) {
  const tx = new Transaction().add(ix);
  tx.feePayer = validatorKeypair.publicKey;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(validatorKeypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function forceUndelegate(connection, validatorKeypair, address) {
  console.log(`\n=== Force-undelegating: ${address.toBase58()} ===`);

  const info = await readDelegationInfo(connection, address);
  if (!info) {
    console.log('  No delegation info found. Skipping.');
    return false;
  }

  // The 'owner' in the delegation record is the original owner program
  const ownerProgram = info.owner;
  console.log(`  nonce=${info.nonce} lamports=${info.lamports} is_undelegatable=${info.isUndelegatable}`);
  console.log(`  authority=${info.authority.toBase58()}`);
  console.log(`  owner_program=${ownerProgram.toBase58()}`);
  console.log(`  rent_payer=${info.rentPayer.toBase58()}`);

  if (!info.authority.equals(validatorKeypair.publicKey)) {
    console.error('  ERROR: Delegation authority does not match ER validator.');
    return false;
  }

  // Step 1: CommitDiff
  console.log('  Step 1: CommitDiff...');
  try {
    const sig = await sendTx(connection, validatorKeypair,
      createCommitDiffIx(validatorKeypair.publicKey, address, ownerProgram, info.nonce, info.lamports));
    console.log(`  CommitDiff confirmed: ${sig}`);
  } catch (err) {
    console.error('  CommitDiff FAILED:', err.message);
    if (err.logs) console.error('  Logs:', err.logs.join('\n  '));
    return false;
  }

  // Step 2: Finalize
  console.log('  Step 2: Finalize...');
  try {
    const sig = await sendTx(connection, validatorKeypair, createFinalizeIx(validatorKeypair.publicKey, address));
    console.log(`  Finalize confirmed: ${sig}`);
  } catch (err) {
    console.error('  Finalize FAILED:', err.message);
    if (err.logs) console.error('  Logs:', err.logs.join('\n  '));
    return false;
  }

  // Step 3: Undelegate
  console.log('  Step 3: Undelegate...');
  const updatedInfo = await readDelegationInfo(connection, address);
  const rentRecipient = updatedInfo ? updatedInfo.rentPayer : info.rentPayer;
  try {
    const sig = await sendTx(connection, validatorKeypair,
      createUndelegateIx(validatorKeypair.publicKey, address, ownerProgram, rentRecipient));
    console.log(`  Undelegate confirmed: ${sig}`);
  } catch (err) {
    console.error('  Undelegate FAILED:', err.message);
    if (err.logs) console.error('  Logs:', err.logs.join('\n  '));
    return false;
  }

  // Verify
  const afterInfo = await connection.getAccountInfo(address);
  if (!afterInfo) {
    console.log('  Account closed after undelegation.');
  } else {
    console.log(`  New owner: ${afterInfo.owner.toBase58()}`);
  }
  return true;
}

async function main() {
  const addresses = process.argv.slice(2);
  if (addresses.length === 0) {
    console.error('Usage: node scripts/force-undelegate-direct.mjs <ACCOUNT_PUBKEY> [<ACCOUNT_PUBKEY> ...]');
    process.exit(1);
  }

  const validatorKeypairData = JSON.parse(fs.readFileSync(ER_VALIDATOR_KEYPAIR_PATH, 'utf-8'));
  const validatorKeypair = Keypair.fromSecretKey(new Uint8Array(validatorKeypairData));
  console.log('ER validator:', validatorKeypair.publicKey.toBase58());

  const connection = new Connection(BASE_RPC, 'confirmed');

  const balance = await connection.getBalance(validatorKeypair.publicKey);
  if (balance < 100_000_000) {
    console.log('Requesting airdrop for ER validator...');
    const sig = await connection.requestAirdrop(validatorKeypair.publicKey, 2_000_000_000);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Airdrop confirmed');
  }

  for (const addr of addresses) {
    const pubkey = new PublicKey(addr);
    await forceUndelegate(connection, validatorKeypair, pubkey);
  }

  console.log('\nDone!');
}

main().catch(console.error);
