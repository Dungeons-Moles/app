import { PublicKey } from '@solana/web3.js';
import { SOLANA_CONFIG } from './config';

export const PLAYER_PROFILE_PROGRAM_ID = SOLANA_CONFIG.programs.playerProfile;
export const SESSION_MANAGER_PROGRAM_ID = SOLANA_CONFIG.programs.sessionManager;
export const MAP_GENERATOR_PROGRAM_ID = SOLANA_CONFIG.programs.mapGenerator;

export function derivePlayerProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('player'), owner.toBuffer()],
    PLAYER_PROFILE_PROGRAM_ID
  );
}

export function deriveGameSessionPda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session'), player.toBuffer()],
    SESSION_MANAGER_PROGRAM_ID
  );
}

export function deriveMapConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('map_config')], MAP_GENERATOR_PROGRAM_ID);
}

export function deriveSessionCounterPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('session_counter')],
    SESSION_MANAGER_PROGRAM_ID
  );
}
