import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const address = 'DdtgJruGthLbSeXgS8Siktm3kANQCCctiBiMj3ky5ZbF';
const key = new PublicKey(address);

console.log(`Requesting airdrop for ${address}...`);
try {
  const sig = await connection.requestAirdrop(key, 2_000_000_000); // 2 SOL
  console.log(`Airdrop tx: ${sig}`);
  await connection.confirmTransaction(sig, 'confirmed');
  const balance = await connection.getBalance(key);
  console.log(`New balance: ${balance / 1e9} SOL`);
} catch (e) {
  console.error('Airdrop failed:', e.message);
}
