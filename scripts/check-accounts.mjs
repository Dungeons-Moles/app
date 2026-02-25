#!/usr/bin/env node
/**
 * Check the state of session accounts for a player wallet.
 * Usage: node scripts/check-accounts.mjs <PLAYER_WALLET_PUBKEY> [campaignLevel]
 */
import { Connection, PublicKey } from '@solana/web3.js';

const SESSION_MANAGER_PROGRAM = new PublicKey('SESNiRFVuFDk2MXKBB13TCWxm8SXHRnYiGxgNiPMLGR');
const GAMEPLAY_STATE_PROGRAM = new PublicKey('C8hK4qsqsSYQeqyXuTPTUUS3T7N74WnZCutvChTpK1Mo');
const MAP_GENERATOR_PROGRAM = new PublicKey('7DWr8skEMbaXzaE8K14MUDjtaUTb7bEMSeMYF7sERpHt');
const PLAYER_INVENTORY_PROGRAM = new PublicKey('3cN3xfRBZLEhBxPpvkFNJvFS7pXGfjDqH7bddwyDj6qW');
const POI_SYSTEM_PROGRAM = new PublicKey('KiT25b86BSAF8yErcWwyuuWNaoXMpNf859NjH41TpSj');
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

const BASE_RPC = process.env.BASE_RPC || 'http://127.0.0.1:8899';

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
  if (owner.equals(DELEGATION_PROGRAM_ID)) return 'DELEGATED';
  return owner.toBase58();
}

async function main() {
  const playerArg = process.argv[2];
  if (!playerArg) {
    console.error('Usage: node scripts/check-accounts.mjs <PLAYER_WALLET_PUBKEY> [campaignLevel]');
    process.exit(1);
  }
  const playerWallet = new PublicKey(playerArg);
  const maxLevel = process.argv[3] ? parseInt(process.argv[3]) : 5;

  const connection = new Connection(BASE_RPC, 'confirmed');

  console.log(`Player: ${playerWallet.toBase58()}`);
  console.log(`Scanning on-chain levels 1-${maxLevel}...\n`);

  for (let level = 1; level <= maxLevel; level++) {
    const sessionPda = deriveSessionPda(playerWallet, level);
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
    if (existing.length === 0) continue;

    console.log(`Level ${level} (session: ${sessionPda.toBase58().slice(0, 16)}…):`);
    for (let i = 0; i < accounts.length; i++) {
      if (infos[i]) {
        console.log(`  ${accounts[i].name.padEnd(15)} exists  owner=${ownerLabel(infos[i].owner)}  size=${infos[i].data.length}  lamports=${infos[i].lamports}`);
      }
    }
    console.log();
  }
  console.log('Done.');
}

main().catch(console.error);
