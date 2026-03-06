import { BorshAccountsCoder, Idl, Program } from '@coral-xyz/anchor';
import type { AccountInfo } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

const coderCache = new WeakMap<object, BorshAccountsCoder>();

type IdlAccountEntry = { name: string; discriminator?: number[] };

function getAccountsCoder(program: Program): BorshAccountsCoder {
  const idl = ((program as any)._rawIdl ?? program.idl) as Idl;
  const cached = coderCache.get(idl);
  if (cached) {
    return cached;
  }

  const coder = new BorshAccountsCoder(idl);
  coderCache.set(idl, coder);
  return coder;
}

function getRawIdlAccounts(program: Program): IdlAccountEntry[] {
  const rawIdl = (program as any)._rawIdl as { accounts?: IdlAccountEntry[] } | undefined;
  return rawIdl?.accounts ?? [];
}

function getNormalizedIdlAccounts(program: Program): IdlAccountEntry[] {
  return (((program.idl as Idl).accounts ?? []) as IdlAccountEntry[]) ?? [];
}

function resolveAccountNames(program: Program, requestedName: string): {
  decodeName: string;
  discriminator: Uint8Array;
} {
  const rawAccounts = getRawIdlAccounts(program);
  const rawMatch =
    rawAccounts.find((account) => account.name === requestedName) ??
    rawAccounts.find((account) => account.name.toLowerCase() === requestedName.toLowerCase()) ??
    getNormalizedIdlAccounts(program).find(
      (account) => account.name.toLowerCase() === requestedName.toLowerCase()
    );

  if (!rawMatch?.discriminator || !rawMatch.name) {
    throw new Error(`Account not found in IDL: ${requestedName}`);
  }

  return {
    decodeName: rawMatch.name,
    discriminator: Uint8Array.from(rawMatch.discriminator),
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}

export function decodeAccountFromInfo<T>(
  program: Program,
  accountName: string,
  info: AccountInfo<Buffer | Uint8Array>
): T | null {
  const { decodeName, discriminator } = resolveAccountNames(program, accountName);
  const actualDiscriminator = info.data.subarray(0, 8);

  if (!bytesEqual(actualDiscriminator, discriminator)) {
    return null;
  }

  return getAccountsCoder(program).decode<T>(decodeName, Buffer.from(info.data));
}

export async function fetchDecodedAccount<T>(
  program: Program,
  accountName: string,
  address: PublicKey
): Promise<T | null> {
  const info = await program.provider.connection.getAccountInfo(address);
  if (!info) {
    return null;
  }

  return decodeAccountFromInfo<T>(program, accountName, info);
}
