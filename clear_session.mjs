/**
 * Clear stale delegated session for campaign level 1.
 * This script:
 * 1. Derives the session PDA for level 1
 * 2. Checks its delegation status
 * 3. Attempts to abandon it using the main wallet
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';

const SECRET = JSON.parse(fs.readFileSync('.dev-wallet/agent-browser-devnet.json', 'utf8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(SECRET));
const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const SESSION_MANAGER_PROGRAM_ID = new PublicKey('6w1XVMSTRmZU9AWCKVvKohGAHSFMENhda7vqhKPQ8TPn');
const GAMEPLAY_STATE_PROGRAM_ID = new PublicKey('C8hK4qsqsSYQeqyXuTPTUUS3T7N74WnZCuzvChTpK1Mo');
const MAP_GENERATOR_PROGRAM_ID = new PublicKey('GCy5GqvnJN99rgGtV6fMn8NtL9E7RoAyHDGzQv8me65j');
const POI_SYSTEM_PROGRAM_ID = new PublicKey('KiT25b86BSAF8yErcWwyuuWNaoXMpNf859NjH41TpSj');
const INVENTORY_PROGRAM_ID = new PublicKey('APRnvp41jEYnT1EnrdBTim7bodqE6v2RSgzv1CG7Qv7u');
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

function deriveSessionPda(player, campaignLevel, nonce = 0n) {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session'), player.toBuffer(), Buffer.from([campaignLevel]), nonceBuf],
    SESSION_MANAGER_PROGRAM_ID
  );
}

function deriveGameStatePda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game_state'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

function deriveMapEnemiesPda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('map_enemies'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

function deriveMapPoisPda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('map_pois'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

function deriveGeneratedMapPda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('generated_map'), sessionPda.toBuffer()],
    MAP_GENERATOR_PROGRAM_ID
  );
}

function deriveInventoryPda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('inventory'), sessionPda.toBuffer()],
    INVENTORY_PROGRAM_ID
  );
}

function deriveMapVrfStatePda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('map_vrf'), sessionPda.toBuffer()],
    MAP_GENERATOR_PROGRAM_ID
  );
}

function derivePoiVrfStatePda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('poi_vrf'), sessionPda.toBuffer()],
    POI_SYSTEM_PROGRAM_ID
  );
}

function deriveGameplayVrfStatePda(sessionPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('gameplay_vrf'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

function deriveSessionNoncesPda(player) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session_nonces'), player.toBuffer()],
    SESSION_MANAGER_PROGRAM_ID
  );
}

async function run() {
  console.log('Wallet:', keypair.publicKey.toBase58());
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  // Check session nonces first
  const [sessionNoncesPda] = deriveSessionNoncesPda(keypair.publicKey);
  const noncesInfo = await connection.getAccountInfo(sessionNoncesPda);
  let campaignNonce = 0n;
  if (noncesInfo) {
    console.log('Session nonces account found:', sessionNoncesPda.toBase58());
    console.log('  Owner:', noncesInfo.owner.toBase58());
    console.log('  Data length:', noncesInfo.data.length);
    // Try to parse the campaign nonce (offset 8 for discriminator, then u64)
    if (noncesInfo.data.length >= 16) {
      campaignNonce = noncesInfo.data.readBigUInt64LE(8);
      console.log('  Campaign nonce:', campaignNonce.toString());
    }
  } else {
    console.log('No session nonces account found');
  }

  // Check sessions for levels 1-5
  for (let level = 1; level <= 5; level++) {
    const [sessionPda] = deriveSessionPda(keypair.publicKey, level, campaignNonce);
    const sessionInfo = await connection.getAccountInfo(sessionPda);
    if (sessionInfo) {
      const isDelegated = sessionInfo.owner.equals(DELEGATION_PROGRAM_ID);
      console.log(`\nLevel ${level}: SESSION EXISTS`);
      console.log('  PDA:', sessionPda.toBase58());
      console.log('  Owner:', sessionInfo.owner.toBase58());
      console.log('  Delegated:', isDelegated);
      console.log('  Data length:', sessionInfo.data.length);

      // Check sub-accounts
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [mapPoisPda] = deriveMapPoisPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [mapVrfPda] = deriveMapVrfStatePda(sessionPda);
      const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
      const [gameplayVrfPda] = deriveGameplayVrfStatePda(sessionPda);

      const accounts = await connection.getMultipleAccountsInfo([
        gameStatePda, mapEnemiesPda, mapPoisPda, generatedMapPda, inventoryPda,
        mapVrfPda, poiVrfPda, gameplayVrfPda,
      ]);

      const names = ['gameState', 'mapEnemies', 'mapPois', 'generatedMap', 'inventory', 'mapVrf', 'poiVrf', 'gameplayVrf'];
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i]) {
          const acc = accounts[i];
          const isAccDelegated = acc.owner.equals(DELEGATION_PROGRAM_ID);
          console.log(`  ${names[i]}: exists (owner=${acc.owner.toBase58().slice(0,8)}... delegated=${isAccDelegated})`);
        } else {
          console.log(`  ${names[i]}: null`);
        }
      }

      // Try to abandon via IDL
      if (process.argv.includes('--abandon')) {
        console.log('\n  Attempting to abandon session...');
        try {
          const idlJson = JSON.parse(fs.readFileSync('src/services/solana/idl/session_manager.json', 'utf8'));
          const wallet = {
            publicKey: keypair.publicKey,
            signTransaction: async (tx) => { tx.sign(keypair); return tx; },
            signAllTransactions: async (txs) => { txs.forEach(t => t.sign(keypair)); return txs; },
          };
          const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
          const program = new anchor.Program(idlJson, provider);

          // Build abandon instruction
          const tx = await program.methods
            .abandonSession()
            .accountsPartial({
              player: keypair.publicKey,
              session: sessionPda,
              gameState: gameStatePda,
              mapEnemies: mapEnemiesPda,
              mapPois: mapPoisPda,
              generatedMap: generatedMapPda,
              inventory: inventoryPda,
              mapVrfState: accounts[5] ? mapVrfPda : null,
              poiVrfState: accounts[6] ? poiVrfPda : null,
              gameplayVrfState: accounts[7] ? gameplayVrfPda : null,
            })
            .rpc({ skipPreflight: true });
          console.log('  Abandon TX:', tx);
        } catch (err) {
          console.error('  Abandon failed:', err.message);
          if (err.logs) {
            console.error('  Logs:', err.logs.slice(-5));
          }
        }
      }
    } else {
      console.log(`Level ${level}: no session`);
    }
  }
}

run().catch(console.error);
