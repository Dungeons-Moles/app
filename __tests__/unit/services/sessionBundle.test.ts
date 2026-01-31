/**
 * Unit Tests for Session Bundle Builder
 *
 * Tests for the atomic session creation transaction builder.
 *
 * @see src/services/solana/sessionBundle.ts
 */

// Set required env vars before imports trigger config validation
process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

import { PublicKey } from '@solana/web3.js';
import { validateSessionCreation } from '@/services/solana/sessionBundle';
import {
  deriveSessionPda,
  deriveGameStatePda,
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveInventoryPda,
  derivePlayerProfilePda,
  deriveSessionCounterPda,
} from '@/services/solana/constants';

// Mock connection
const mockConnection = {
  getAccountInfo: jest.fn(),
  getBalance: jest.fn(),
  getLatestBlockhash: jest.fn(),
} as unknown as Parameters<typeof validateSessionCreation>[0];

describe('Session Bundle Builder', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('PDA Derivation', () => {
    const testWallet = new PublicKey('11111111111111111111111111111111');

    it('should derive session PDA with level in seeds', () => {
      const [pda1] = deriveSessionPda(testWallet, 1);
      const [pda2] = deriveSessionPda(testWallet, 2);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should derive consistent PDAs for same inputs', () => {
      const [pda1a] = deriveSessionPda(testWallet, 5);
      const [pda1b] = deriveSessionPda(testWallet, 5);

      expect(pda1a.toBase58()).toBe(pda1b.toBase58());
    });

    it('should derive different PDAs for different wallets', () => {
      const wallet2 = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

      const [pda1] = deriveSessionPda(testWallet, 1);
      const [pda2] = deriveSessionPda(wallet2, 1);

      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it('should derive gameState PDA from session PDA', () => {
      const [sessionPda] = deriveSessionPda(testWallet, 1);
      const [gameStatePda] = deriveGameStatePda(sessionPda);

      expect(gameStatePda).toBeDefined();
      expect(gameStatePda.toBase58()).not.toBe(sessionPda.toBase58());
    });

    it('should derive enemies PDA from session PDA', () => {
      const [sessionPda] = deriveSessionPda(testWallet, 1);
      const [enemiesPda] = deriveMapEnemiesPda(sessionPda);

      expect(enemiesPda).toBeDefined();
      expect(enemiesPda.toBase58()).not.toBe(sessionPda.toBase58());
    });

    it('should derive POIs PDA from session PDA', () => {
      const [sessionPda] = deriveSessionPda(testWallet, 1);
      const [poisPda] = deriveMapPoisPda(sessionPda);

      expect(poisPda).toBeDefined();
      expect(poisPda.toBase58()).not.toBe(sessionPda.toBase58());
    });

    it('should derive inventory PDA from session PDA', () => {
      const [sessionPda] = deriveSessionPda(testWallet, 1);
      const [inventoryPda] = deriveInventoryPda(sessionPda);

      expect(inventoryPda).toBeDefined();
      expect(inventoryPda.toBase58()).not.toBe(sessionPda.toBase58());
    });

    it('should derive profile PDA from wallet', () => {
      const [profilePda] = derivePlayerProfilePda(testWallet);

      expect(profilePda).toBeDefined();
    });

    it('should derive session counter PDA', () => {
      const [counterPda] = deriveSessionCounterPda();

      expect(counterPda).toBeDefined();
    });
  });

  describe('validateSessionCreation', () => {
    const testWallet = new PublicKey('11111111111111111111111111111111');

    it('should fail when no sessions available', async () => {
      const profile = { availableRuns: 0, highestLevelUnlocked: 10 };

      const result = await validateSessionCreation(mockConnection, testWallet, 1, profile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No available sessions');
    });

    it('should fail when level not unlocked', async () => {
      const profile = { availableRuns: 5, highestLevelUnlocked: 3 };

      const result = await validateSessionCreation(mockConnection, testWallet, 5, profile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not unlocked');
    });

    it('should fail for invalid campaign level', async () => {
      const profile = { availableRuns: 5, highestLevelUnlocked: 40 };

      const result1 = await validateSessionCreation(mockConnection, testWallet, 0, profile);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Invalid campaign level');

      const result2 = await validateSessionCreation(mockConnection, testWallet, 41, profile);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('not unlocked');
    });

    it('should fail when session already exists', async () => {
      const profile = { availableRuns: 5, highestLevelUnlocked: 10 };

      // Mock existing session
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValueOnce({
        data: Buffer.alloc(100),
      });
      (mockConnection.getBalance as jest.Mock).mockResolvedValueOnce(1_000_000_000);

      const result = await validateSessionCreation(mockConnection, testWallet, 1, profile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Session already exists');
    });

    it('should fail when insufficient balance', async () => {
      const profile = { availableRuns: 5, highestLevelUnlocked: 10 };

      // Mock no existing session
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValueOnce(null);
      // Mock low balance
      (mockConnection.getBalance as jest.Mock).mockResolvedValueOnce(1_000_000); // 0.001 SOL

      const result = await validateSessionCreation(mockConnection, testWallet, 1, profile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Insufficient balance');
    });

    it('should pass when all conditions met', async () => {
      const profile = { availableRuns: 5, highestLevelUnlocked: 10 };

      // Mock no existing session
      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValueOnce(null);
      // Mock sufficient balance
      (mockConnection.getBalance as jest.Mock).mockResolvedValueOnce(1_000_000_000); // 1 SOL

      const result = await validateSessionCreation(mockConnection, testWallet, 1, profile);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // estimateTransactionSize removed — start_session is now a single atomic instruction
});

describe('Session Bundle Constants', () => {
  it('should have correct default values', async () => {
    // Import constants directly
    const {
      DEFAULT_BURNER_FUNDING,
      MAP_WIDTH,
      MAP_HEIGHT,
      MAX_SESSIONS,
      MAX_ENEMIES,
      INITIAL_GEAR_SLOTS,
      RUN_PRICE_LAMPORTS,
      RUNS_PER_PURCHASE,
    } = await import('@/services/solana/constants');

    expect(DEFAULT_BURNER_FUNDING).toBe(50_000_000); // 0.05 SOL
    expect(MAP_WIDTH).toBe(9);
    expect(MAP_HEIGHT).toBe(9);
    expect(MAX_SESSIONS).toBe(40);
    expect(MAX_ENEMIES).toBe(10);
    expect(INITIAL_GEAR_SLOTS).toBe(4);
    expect(RUN_PRICE_LAMPORTS).toBe(5_000_000); // 0.005 SOL
    expect(RUNS_PER_PURCHASE).toBe(20);
  });
});
