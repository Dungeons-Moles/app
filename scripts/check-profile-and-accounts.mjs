#!/usr/bin/env node
/**
 * Check player profile + scan session accounts at the current level.
 * Usage: node scripts/check-profile-and-accounts.mjs <PLAYER_WALLET_PUBKEY>
 */
import { Connection, PublicKey } from '@solana/web3.js';

// Use the SAME program IDs as the frontend .env
const SESSION_MANAGER_PROGRAM = new PublicKey('6w1XVMSTRmZU9AWCKVvKohGAHSFMENhda7vqhKPQ8TPn');
const GAMEPLAY_STATE_PROGRAM = new PublicKey('C8hK4qsqsSYQeqyXuTPTUUS3T7N74WnZCuzvChTpK1Mo');
const MAP_GENERATOR_PROGRAM = new PublicKey('GCy5GqvnJN99rgGtV6fMn8NtL9E7RoAyHDGzQv8me65j');
const PLAYER_INVENTORY_PROGRAM = new PublicKey('APRnvp41jEYnT1EnrdBTim7bodqE6v2RSgzv1CG7Qv7u');
const POI_SYSTEM_PROGRAM = new PublicKey('KiT25b86BSAF8yErcWwyuuWNaoXMpNf859NjH41TpSj');
const PLAYER_PROFILE_PROGRAM = new PublicKey('Ch3bbL1oQk2z5rX1jiun3KuSWZqnXZ1MnrfrtKj4MKun');
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

const BASE_RPC = process.env.BASE_RPC || 'http://127.0.0.1:8899';
const ER_RPC = process.env.ER_RPC || 'http://127.0.0.1:7799';

function derivePlayerProfilePda(owner) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('player'), owner.toBuffer()],
    PLAYER_PROFILE_PROGRAM
  )[0];
}
function deriveSessionPda(player, campaignLevel) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game_session'), player.toBuffer(), Buffer.from([campaignLevel])],
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

function ownerLabel(owner) {
  if (owner.equals(SESSION_MANAGER_PROGRAM)) return 'session-manager';
  if (owner.equals(GAMEPLAY_STATE_PROGRAM)) return 'gameplay-state';
  if (owner.equals(MAP_GENERATOR_PROGRAM)) return 'map-generator';
  if (owner.equals(PLAYER_INVENTORY_PROGRAM)) return 'player-inventory';
  if (owner.equals(POI_SYSTEM_PROGRAM)) return 'poi-system';
  if (owner.equals(DELEGATION_PROGRAM_ID)) return '*** DELEGATED ***';
  if (owner.equals(PLAYER_PROFILE_PROGRAM)) return 'player-profile';
  return owner.toBase58();
}

async function checkAccounts(connection, label, playerWallet, onChainLevel) {
  const sessionPda = deriveSessionPda(playerWallet, onChainLevel);
  const accounts = [
    { name: 'session', address: sessionPda },
    { name: 'game_state', address: deriveGameStatePda(sessionPda) },
    { name: 'map_enemies', address: deriveMapEnemiesPda(sessionPda) },
    { name: 'generated_map', address: deriveGeneratedMapPda(sessionPda) },
    { name: 'inventory', address: deriveInventoryPda(sessionPda) },
    { name: 'map_pois', address: deriveMapPoisPda(sessionPda) },
  ];
  const infos = await connection.getMultipleAccountsInfo(accounts.map(a => a.address));
  const existing = accounts.filter((_, i) => infos[i] !== null);
  if (existing.length === 0) {
    console.log(`  [${label}] Level ${onChainLevel}: no accounts exist`);
    return;
  }
  console.log(`  [${label}] Level ${onChainLevel} (session: ${sessionPda.toBase58()}):`);
  for (let i = 0; i < accounts.length; i++) {
    if (infos[i]) {
      console.log(`    ${accounts[i].name.padEnd(15)} owner=${ownerLabel(infos[i].owner).padEnd(20)} size=${infos[i].data.length}  lamports=${infos[i].lamports}`);
    }
  }
}

async function main() {
  const playerArg = process.argv[2];
  if (!playerArg) {
    console.error('Usage: node scripts/check-profile-and-accounts.mjs <PLAYER_WALLET_PUBKEY>');
    process.exit(1);
  }
  const playerWallet = new PublicKey(playerArg);
  console.log('Player:', playerWallet.toBase58());

  const baseConn = new Connection(BASE_RPC, 'confirmed');
  let erConn;
  try {
    erConn = new Connection(ER_RPC, 'confirmed');
    await erConn.getLatestBlockhash(); // test connectivity
    console.log('ER connection: OK');
  } catch {
    console.log('ER connection: FAILED (will skip ER checks)');
    erConn = null;
  }

  // Check profile
  const profilePda = derivePlayerProfilePda(playerWallet);
  console.log('Profile PDA:', profilePda.toBase58());
  const profileInfo = await baseConn.getAccountInfo(profilePda);
  if (!profileInfo) {
    console.log('Profile: NOT FOUND');
  } else {
    console.log(`Profile: exists, owner=${ownerLabel(profileInfo.owner)}, size=${profileInfo.data.length}`);
    const currentLevel = profileInfo.data[40];
    console.log(`Profile currentLevel (raw byte at offset 40): ${currentLevel}`);
  }

  // Check levels 0-10 on both base and ER
  console.log('\n--- Checking accounts on BASE LAYER ---');
  for (let level = 0; level <= 10; level++) {
    await checkAccounts(baseConn, 'BASE', playerWallet, level);
  }

  if (erConn) {
    console.log('\n--- Checking accounts on ER ---');
    for (let level = 0; level <= 10; level++) {
      try {
        await checkAccounts(erConn, 'ER', playerWallet, level);
      } catch (e) {
        console.log(`  [ER] Level ${level}: error - ${e.message}`);
      }
    }
  }

  console.log('\nDone.');
}

main().catch(console.error);
