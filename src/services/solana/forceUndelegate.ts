/**
 * Force-undelegate accounts by calling the Delegation Program directly on the
 * base layer, signed by the ER validator identity.
 *
 * This is a LOCAL-ONLY fallback for when ER-based undelegation fails (the Magic
 * Program stub on mb-test-validator doesn't actually process instructions).
 * On devnet / mainnet the ER handles undelegation natively — do NOT use this.
 *
 * Flow per account: CommitDiff (allow_undelegation=true) → Finalize → Undelegate
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import * as Sentry from '@sentry/react-native';
import { SOLANA_CONFIG } from './config';

const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

// ── helpers ────────────────────────────────────────────────────────────────

function disc(n: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}
const COMMIT_DIFF_DISC = disc(16);
const FINALIZE_DISC = disc(2);
const UNDELEGATE_DISC = disc(3);

function deriveDelegationPda(seed: string, key: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(seed), key.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

function deriveFeesVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fees-vault')],
    DELEGATION_PROGRAM_ID
  )[0];
}

function deriveValidatorFeesVault(validator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('v-fees-vault'), validator.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

function deriveProgramConfig(ownerProgram: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('p-conf'), ownerProgram.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

function serializeCommitDiffArgs(
  nonce: number,
  lamports: number,
  allowUndelegation: boolean
): Buffer {
  const buf = Buffer.alloc(4 + 8 + 8 + 8 + 1);
  let offset = 0;
  buf.writeUInt32LE(8, offset);
  offset += 4; // Borsh Vec<u8> length = 8
  buf.writeUInt32LE(0, offset);
  offset += 4; // changed_len = 0
  buf.writeUInt32LE(0, offset);
  offset += 4; // segments_count = 0
  buf.writeBigUInt64LE(BigInt(nonce), offset);
  offset += 8;
  buf.writeBigUInt64LE(BigInt(lamports), offset);
  offset += 8;
  buf.writeUInt8(allowUndelegation ? 1 : 0, offset);
  return buf;
}

// ── delegation metadata parser ─────────────────────────────────────────────

interface DelegationInfo {
  nonce: number;
  authority: PublicKey;
  owner: PublicKey;
  lamports: number;
  rentPayer: PublicKey;
}

async function readDelegationInfo(
  connection: Connection,
  delegatedAccount: PublicKey
): Promise<DelegationInfo | null> {
  const metadataPda = deriveDelegationPda('delegation-metadata', delegatedAccount);
  const recordPda = deriveDelegationPda('delegation', delegatedAccount);

  const [metaInfo, recInfo, acctInfo] = await Promise.all([
    connection.getAccountInfo(metadataPda),
    connection.getAccountInfo(recordPda),
    connection.getAccountInfo(delegatedAccount),
  ]);
  if (!metaInfo || !recInfo || !acctInfo) return null;

  const nonce = Number(metaInfo.data.readBigUInt64LE(8));
  // Parse seeds (Vec<Vec<u8>>) to find rent_payer after it
  let seedsOffset = 17; // disc(8) + nonce(8) + is_undelegatable(1)
  const numSeeds = metaInfo.data.readUInt32LE(seedsOffset);
  seedsOffset += 4;
  for (let i = 0; i < numSeeds; i++) {
    const seedLen = metaInfo.data.readUInt32LE(seedsOffset);
    seedsOffset += 4;
    seedsOffset += seedLen;
  }
  const rentPayer = new PublicKey(metaInfo.data.slice(seedsOffset, seedsOffset + 32));

  const authority = new PublicKey(recInfo.data.slice(8, 40));
  const owner = new PublicKey(recInfo.data.slice(40, 72));
  const lamports = Number(recInfo.data.readBigUInt64LE(80));

  return { nonce, authority, owner, lamports, rentPayer };
}

// ── instruction builders ───────────────────────────────────────────────────

function createCommitDiffIx(
  validator: PublicKey,
  account: PublicKey,
  ownerProgram: PublicKey,
  nonce: number,
  lamports: number
): TransactionInstruction {
  const args = serializeCommitDiffArgs(nonce + 1, lamports, true);
  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: false },
      { pubkey: account, isSigner: false, isWritable: false },
      { pubkey: deriveDelegationPda('state-diff', account), isSigner: false, isWritable: true },
      {
        pubkey: deriveDelegationPda('commit-state-record', account),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: deriveDelegationPda('delegation', account), isSigner: false, isWritable: false },
      {
        pubkey: deriveDelegationPda('delegation-metadata', account),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: deriveValidatorFeesVault(validator), isSigner: false, isWritable: false },
      { pubkey: deriveProgramConfig(ownerProgram), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([COMMIT_DIFF_DISC, args]),
  });
}

function createFinalizeIx(
  validator: PublicKey,
  account: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: deriveDelegationPda('state-diff', account), isSigner: false, isWritable: true },
      {
        pubkey: deriveDelegationPda('commit-state-record', account),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: deriveDelegationPda('delegation', account), isSigner: false, isWritable: true },
      {
        pubkey: deriveDelegationPda('delegation-metadata', account),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: deriveValidatorFeesVault(validator), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: FINALIZE_DISC,
  });
}

function createUndelegateIx(
  validator: PublicKey,
  account: PublicKey,
  ownerProgram: PublicKey,
  rentReimbursement: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: validator, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: ownerProgram, isSigner: false, isWritable: false },
      {
        pubkey: deriveDelegationPda('undelegate-buffer', account),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: deriveDelegationPda('state-diff', account), isSigner: false, isWritable: false },
      {
        pubkey: deriveDelegationPda('commit-state-record', account),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: deriveDelegationPda('delegation', account), isSigner: false, isWritable: true },
      {
        pubkey: deriveDelegationPda('delegation-metadata', account),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: rentReimbursement, isSigner: false, isWritable: true },
      { pubkey: deriveFeesVault(), isSigner: false, isWritable: true },
      { pubkey: deriveValidatorFeesVault(validator), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: UNDELEGATE_DISC,
  });
}

// ── send helper ────────────────────────────────────────────────────────────

async function sendTx(
  connection: Connection,
  validatorKeypair: Keypair,
  ix: TransactionInstruction
): Promise<string> {
  const tx = new Transaction().add(ix);
  tx.feePayer = validatorKeypair.publicKey;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.sign(validatorKeypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

// ── public API ─────────────────────────────────────────────────────────────

let _validatorKeypair: Keypair | null = null;

function getValidatorKeypair(): Keypair | null {
  if (_validatorKeypair) return _validatorKeypair;
  // Only read the env var in dev builds against a local validator.
  // In production, EXPO_PUBLIC_ values are inlined into the JS bundle —
  // reading a private key here would ship it to every client.
  if (!__DEV__ || !SOLANA_CONFIG.isLocalValidator) return null;
  const b64 = process.env.EXPO_PUBLIC_ER_VALIDATOR_KEYPAIR;
  if (!b64) return null;
  try {
    _validatorKeypair = Keypair.fromSecretKey(
      new Uint8Array(Buffer.from(b64, 'base64'))
    );
    return _validatorKeypair;
  } catch {
    console.warn('[forceUndelegate] Invalid ER_VALIDATOR_KEYPAIR env');
    return null;
  }
}

/**
 * Whether the local force-undelegate fallback is available.
 * True only when running against a local validator AND the ER validator
 * keypair is configured in the environment.
 */
export function isForceUndelegateAvailable(): boolean {
  return SOLANA_CONFIG.isLocalValidator && getValidatorKeypair() !== null;
}

/**
 * Force-undelegate a single account on the base layer.
 * Reads delegation metadata to determine owner program automatically.
 *
 * @returns true if successful, false if skipped or failed.
 */
export async function forceUndelegateAccount(
  baseConnection: Connection,
  account: PublicKey
): Promise<boolean> {
  const validatorKeypair = getValidatorKeypair();
  if (!validatorKeypair) return false;

  const info = await readDelegationInfo(baseConnection, account);
  if (!info) {
    console.log(`[forceUndelegate] No delegation info for ${account.toBase58().slice(0, 12)}…`);
    return false;
  }

  if (!info.authority.equals(validatorKeypair.publicKey)) {
    console.warn(
      `[forceUndelegate] Authority mismatch for ${account.toBase58().slice(0, 12)}… — skipping`
    );
    return false;
  }

  const label = account.toBase58().slice(0, 12);

  try {
    // Step 1: CommitDiff
    await sendTx(
      baseConnection,
      validatorKeypair,
      createCommitDiffIx(validatorKeypair.publicKey, account, info.owner, info.nonce, info.lamports)
    );
    console.log(`[forceUndelegate] ${label}… CommitDiff OK`);

    // Step 2: Finalize
    await sendTx(
      baseConnection,
      validatorKeypair,
      createFinalizeIx(validatorKeypair.publicKey, account)
    );
    console.log(`[forceUndelegate] ${label}… Finalize OK`);

    // Step 3: Undelegate
    const updatedInfo = await readDelegationInfo(baseConnection, account);
    const rentRecipient = updatedInfo?.rentPayer ?? info.rentPayer;
    await sendTx(
      baseConnection,
      validatorKeypair,
      createUndelegateIx(validatorKeypair.publicKey, account, info.owner, rentRecipient)
    );
    console.log(`[forceUndelegate] ${label}… Undelegate OK`);
    return true;
  } catch (err) {
    console.error(
      `[forceUndelegate] Failed for ${label}…:`,
      err instanceof Error ? err.message : err
    );
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { tags: { source: 'forceUndelegate.forceUndelegateAccount' } });
    return false;
  }
}

/**
 * Force-undelegate multiple accounts sequentially.
 * Returns the number of accounts successfully undelegated.
 */
export async function forceUndelegateAccounts(
  baseConnection: Connection,
  accounts: PublicKey[]
): Promise<number> {
  let count = 0;
  for (const account of accounts) {
    const ok = await forceUndelegateAccount(baseConnection, account);
    if (ok) count++;
  }
  return count;
}
