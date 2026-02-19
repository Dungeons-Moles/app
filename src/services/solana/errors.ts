import { AnchorError } from '@coral-xyz/anchor';

// Error messages keyed by program name and error code
const PROGRAM_ERRORS: Record<string, Record<number, string>> = {
  player_profile: {
    6000: 'You already have a profile for this wallet',
    6001: 'Name must be 32 characters or less',
    6002: 'No available sessions remaining',
    6003: 'Wallet authentication required',
    6004: 'Calculation error occurred',
    6005: 'Active item pool must contain at least 40 items',
    6006: 'Item is not unlocked',
    6007: 'Item index is out of valid range',
    6008: 'Insufficient SOL for purchase',
    6009: 'Level is not unlocked',
    6010: 'Invalid treasury account',
  },
  session_manager: {
    6000: 'You already have an active session',
    6001: 'No active session found',
    6002: 'Session must be delegated first',
    6003: 'Session is already delegated',
    6004: 'Wallet authentication required',
    6005: 'This level is beyond your unlocked tier',
    6006: 'Player profile does not exist',
    6007: 'Calculation error occurred',
    6008: 'Level is not unlocked',
    6009: 'No available sessions remaining',
    6010: 'Session already exists for this level',
    6011: 'Session can only be ended after death or level completion',
    6012: 'Session must be undelegated before closing',
  },
  map_generator: {
    6000: 'Invalid campaign level',
    6001: 'Admin authentication required',
    6002: 'Map config is already initialized',
    6003: 'Map hash does not match expected value',
    6004: 'Batch update exceeds maximum allowed',
    6005: 'Map generation failed',
    6006: 'Map already exists for this session',
    6007: 'Invalid session owner',
    6008: 'POI index out of bounds',
  },
  gameplay_state: {
    6000: 'Target position is out of map boundaries',
    6001: 'Not enough moves remaining',
    6002: 'Can only move to adjacent tiles',
    6003: 'Stat value would overflow',
    6004: 'HP cannot go below 0',
    6005: 'Not enough gold',
    6006: 'Invalid stat modification',
    6007: 'Boss fight already triggered',
    6008: 'Must exhaust moves in Night 3 before boss fight',
    6009: 'Wallet authentication required',
    6010: 'Session is not active',
    6011: 'Calculation error occurred',
    6012: 'No enemy at this position',
    6013: 'Player has been defeated',
    6014: 'Player is dead — no further actions allowed',
    6015: 'Invalid week value',
    6016: 'Invalid enemy tier',
    6017: 'Invalid session account',
    6018: 'Invalid session owner program',
  },
  player_inventory: {
    6000: 'No available gear slots',
    6001: 'Item does not exist',
    6002: 'Item type does not match slot type',
    6003: 'Items must have same ID and tier to fuse',
    6004: 'Item is already at maximum tier',
    6005: 'No tool is currently equipped',
    6006: 'This Tool Oil modification was already applied',
    6007: 'The specified slot is empty',
    6008: 'Slot index is out of bounds',
    6009: 'Wallet authentication required',
    6010: 'Gear slots already at maximum capacity',
  },
  nft_marketplace: {
    6000: 'Unauthorized',
    6001: 'Invalid collection',
    6002: 'Invalid price',
    6003: 'NFT not owned by seller',
    6004: 'Listing already exists',
    6005: 'Listing not found',
    6006: 'Cannot buy your own listing',
    6007: 'Arithmetic overflow',
    6008: 'Invalid Metaplex Core asset',
    6009: 'Invalid mint authority',
    6010: 'Quest not active',
    6011: 'Quest already completed',
    6012: 'Quest not completed',
    6013: 'Quest reward already claimed',
    6014: 'Invalid quest type',
    6015: 'Fee basis points exceed maximum',
    6016: 'Cannot list a skin that is currently equipped',
  },
  poi_system: {
    6000: 'Invalid act value',
    6001: 'Invalid POI type',
    6002: 'No POI at this position',
    6003: 'This POI has already been used',
    6004: 'This POI can only be used at night',
    6005: 'No tool equipped',
    6006: 'Tool oil modification already applied',
    6007: 'Not enough gold',
    6008: 'No space in inventory',
    6009: 'Items must be identical for fusion',
    6010: 'Item is already at maximum tier',
    6011: 'No active shop session',
    6012: 'This offer has already been purchased',
    6013: 'Waypoint destination not discovered',
    6014: 'No other discovered waypoints available',
    6015: 'Offer index out of bounds',
    6016: 'Gear slot index out of bounds or empty',
    6017: 'POI index out of bounds',
    6018: 'Wallet authentication required',
    6019: 'Calculation error occurred',
    6020: 'POIs already initialized for this session',
    6021: 'Shop is already active',
    6022: 'Shop reroll limit reached for this visit',
    6023: 'Invalid interaction for this POI type',
    6024: 'No POI interaction is currently active',
    6025: 'No active shop to reroll',
    6026: 'No items available for the selected criteria',
    6027: 'Invalid offer context',
    6028: 'Player is not on the POI tile',
    6029: 'Invalid session owner account',
    6030: 'Invalid generated map account',
    6031: 'Invalid session account',
    6032: 'Invalid week value',
    6033: 'Failed to fetch boss weaknesses',
    6034: 'Selected oil is not in the generated offer',
  },
};

// Flat fallback map for when program name is not available
const FALLBACK_ERRORS: Record<number, string> = {
  6000: 'Operation not allowed',
  6001: 'Invalid parameter',
  6002: 'Resource not found',
  6003: 'Insufficient funds',
  6004: 'Authentication required',
};

export function getUserErrorMessage(error: unknown, programName?: string): string {
  if (error instanceof AnchorError) {
    const code = error.error.errorCode.number;

    // Try program-specific error first
    if (programName && PROGRAM_ERRORS[programName]) {
      const message = PROGRAM_ERRORS[programName][code];
      if (message) return message;
    }

    // Try to extract program name from the error
    const origin = error.error.origin;
    if (origin && typeof origin === 'string') {
      for (const [name, errors] of Object.entries(PROGRAM_ERRORS)) {
        if (origin.toLowerCase().includes(name.replace(/_/g, ''))) {
          const message = errors[code];
          if (message) return message;
        }
      }
    }

    // Fall back to the error's own message
    return error.error.errorMessage || `Transaction failed (error ${code})`;
  }

  if (error instanceof Error) {
    const customMatch = error.message.match(/"Custom"\s*:\s*(\d+)/);
    if (customMatch) {
      const errorCode = Number.parseInt(customMatch[1], 10);

      if (programName && PROGRAM_ERRORS[programName]) {
        const message = PROGRAM_ERRORS[programName][errorCode];
        if (message) return message;
      }

      const fallback = FALLBACK_ERRORS[errorCode];
      if (fallback) return fallback;

      return `Transaction failed (error ${errorCode})`;
    }

    // Extract error code from raw error message
    const match = error.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const errorCode = parseInt(match[1], 16);

      // Try program-specific error
      if (programName && PROGRAM_ERRORS[programName]) {
        const message = PROGRAM_ERRORS[programName][errorCode];
        if (message) return message;
      }

      // Try fallback
      const fallback = FALLBACK_ERRORS[errorCode];
      if (fallback) return fallback;

      return `Transaction failed (error ${errorCode})`;
    }

    if (error.message.includes('insufficient funds')) {
      return 'Insufficient SOL balance. Please top up your wallet.';
    }

    return error.message || 'An unexpected error occurred. Please try again.';
  }

  return 'An unexpected error occurred. Please try again.';
}
