/**
 * Find which nonce produced the existing session at level 1.
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const SECRET = JSON.parse(fs.readFileSync('.dev-wallet/agent-browser-devnet.json', 'utf8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(SECRET));
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const SESSION_MANAGER_PROGRAM_ID = new PublicKey('6w1XVMSTRmZU9AWCKVvKohGAHSFMENhda7vqhKPQ8TPn');
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

function deriveSessionPda(player, campaignLevel, nonce = 0n) {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session'), player.toBuffer(), Buffer.from([campaignLevel]), nonceBuf],
    SESSION_MANAGER_PROGRAM_ID
  );
}

async function run() {
  const known = '62uHoWJ8iXF3DpBWbmd5GH7x9ha9iWgZDffZsMjErKQk';

  // Try nonces 0-25 for level 1
  for (let nonce = 0n; nonce <= 25n; nonce++) {
    const [pda] = deriveSessionPda(keypair.publicKey, 1, nonce);
    if (pda.toBase58() === known) {
      console.log(`Found! Level 1 session with nonce ${nonce}: ${pda.toBase58()}`);
    }
  }

  // Also check what happens with the current nonce (22)
  const [currentPda] = deriveSessionPda(keypair.publicKey, 1, 22n);
  console.log(`\nCurrent nonce (22) level 1 PDA: ${currentPda.toBase58()}`);
  const info = await connection.getAccountInfo(currentPda);
  if (info) {
    console.log(`  Exists! Owner: ${info.owner.toBase58()}`);
    console.log(`  Delegated: ${info.owner.equals(DELEGATION_PROGRAM_ID)}`);
  } else {
    console.log('  Does not exist');
  }

  // The session PDA at nonce 22 IS the stale session.
  // The override mechanism will use nonce 23 (incrementing the nonce).
  // Let's check if the app does this via start_session with override.
  const [nextPda] = deriveSessionPda(keypair.publicKey, 1, 23n);
  console.log(`\nNext nonce (23) level 1 PDA: ${nextPda.toBase58()}`);
  const nextInfo = await connection.getAccountInfo(nextPda);
  console.log(`  Exists: ${!!nextInfo}`);
}

run().catch(console.error);
