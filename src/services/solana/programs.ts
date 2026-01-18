import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { SOLANA_CONFIG } from './config';
import playerProfileIdl from './idl/player_profile.json';
import sessionManagerIdl from './idl/session_manager.json';
import mapGeneratorIdl from './idl/map_generator.json';
import gameplayStateIdl from './idl/gameplay_state.json';

export type AnchorWalletAdapter = {
  publicKey: AnchorProvider['wallet']['publicKey'];
  signTransaction: AnchorProvider['wallet']['signTransaction'];
  signAllTransactions: AnchorProvider['wallet']['signAllTransactions'];
};

export function createSolanaConnection() {
  return new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
}

export function createAnchorProvider(
  connection: Connection,
  wallet: AnchorWalletAdapter
): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
}

export function createPlayerProfileProgram(connection: Connection) {
  return new Program(playerProfileIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.playerProfile,
  });
}

export function createSessionManagerProgram(connection: Connection) {
  return new Program(sessionManagerIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.sessionManager,
  });
}

export function createMapGeneratorProgram(connection: Connection) {
  return new Program(mapGeneratorIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.mapGenerator,
  });
}

export function createPlayerProfileProgramWithProvider(provider: AnchorProvider) {
  return new Program(playerProfileIdl as Idl, provider);
}

export function createSessionManagerProgramWithProvider(provider: AnchorProvider) {
  return new Program(sessionManagerIdl as Idl, provider);
}

export function createMapGeneratorProgramWithProvider(provider: AnchorProvider) {
  return new Program(mapGeneratorIdl as Idl, provider);
}

export function createGameplayStateProgram(connection: Connection) {
  return new Program(gameplayStateIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.gameplayState,
  });
}

export function createGameplayStateProgramWithProvider(provider: AnchorProvider) {
  return new Program(gameplayStateIdl as Idl, provider);
}
