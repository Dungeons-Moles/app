import { AnchorError } from '@coral-xyz/anchor';

const ERROR_MESSAGES: Record<number, string> = {
  6000: 'You already have a profile for this wallet',
  6001: 'Name must be 32 characters or less',
  6002: 'Complete your current tier before unlocking the next',
  6003: 'Insufficient SOL balance for tier unlock',
  6004: 'Wallet authentication required',
  6005: 'This level is beyond your unlocked tier',
};

export function getUserErrorMessage(error: unknown): string {
  if (error instanceof AnchorError) {
    return (
      ERROR_MESSAGES[error.error.errorCode.number] ??
      `Transaction failed: ${error.error.errorMessage}`
    );
  }

  if (error instanceof Error) {
    return error.message || 'An unexpected error occurred. Please try again.';
  }

  return 'An unexpected error occurred. Please try again.';
}
