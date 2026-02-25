import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { ConnectionMagicRouter } from '@magicblock-labs/ephemeral-rollups-sdk';
import { SOLANA_CONFIG } from './config';
import playerProfileIdl from './idl/player_profile.json';
import sessionManagerIdl from './idl/session_manager.json';
import mapGeneratorIdl from './idl/map_generator.json';
import gameplayStateIdl from './idl/gameplay_state.json';
import playerInventoryIdl from './idl/player_inventory.json';
import poiSystemIdl from './idl/poi_system.json';
import nftMarketplaceIdl from './idl/nft_marketplace.json';

export type AnchorWalletAdapter = {
  publicKey: AnchorProvider['wallet']['publicKey'];
  signTransaction: AnchorProvider['wallet']['signTransaction'];
  signAllTransactions: AnchorProvider['wallet']['signAllTransactions'];
};

const normalizeEndpoint = (url: string): string => url.replace(/\/+$/, '');
const isErEndpoint = (connection: Connection): boolean =>
  normalizeEndpoint(connection.rpcEndpoint) === normalizeEndpoint(SOLANA_CONFIG.erRpcUrl);

export function createSolanaConnection() {
  return new Connection(SOLANA_CONFIG.rpcUrl, SOLANA_CONFIG.commitment);
}

export function createErConnection() {
  if (SOLANA_CONFIG.useMagicRouter) {
    return new ConnectionMagicRouter(SOLANA_CONFIG.erRpcUrl, {
      commitment: SOLANA_CONFIG.erCommitment,
      wsEndpoint: SOLANA_CONFIG.erWsUrl,
    });
  }
  return new Connection(SOLANA_CONFIG.erRpcUrl, {
    commitment: SOLANA_CONFIG.erCommitment,
    wsEndpoint: SOLANA_CONFIG.erWsUrl,
  });
}

export function createAnchorProvider(
  connection: Connection,
  wallet: AnchorWalletAdapter
): AnchorProvider {
  const commitment = isErEndpoint(connection)
    ? SOLANA_CONFIG.erCommitment
    : SOLANA_CONFIG.commitment;
  return new AnchorProvider(connection, wallet, {
    commitment,
    preflightCommitment: commitment,
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

export function createPlayerInventoryProgram(connection: Connection) {
  return new Program(playerInventoryIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.playerInventory,
  });
}

export function createPlayerInventoryProgramWithProvider(provider: AnchorProvider) {
  return new Program(playerInventoryIdl as Idl, provider);
}

export function createPoiSystemProgram(connection: Connection) {
  return new Program(poiSystemIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.poiSystem,
  });
}

export function createPoiSystemProgramWithProvider(provider: AnchorProvider) {
  return new Program(poiSystemIdl as Idl, provider);
}

export function createNftMarketplaceProgram(connection: Connection) {
  return new Program(nftMarketplaceIdl as Idl, {
    connection,
    publicKey: SOLANA_CONFIG.programs.nftMarketplace,
  });
}

export function createNftMarketplaceProgramWithProvider(provider: AnchorProvider) {
  return new Program(nftMarketplaceIdl as Idl, provider);
}
