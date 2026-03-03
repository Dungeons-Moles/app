import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Check the Solana CLI default wallet
const solanaWalletPath = join(homedir(), '.config/solana/id.json');
const arr = JSON.parse(readFileSync(solanaWalletPath, 'utf-8'));
const cliKeypair = Keypair.fromSecretKey(Uint8Array.from(arr));
console.log('CLI wallet:', cliKeypair.publicKey.toBase58());

const balance = await connection.getBalance(cliKeypair.publicKey);
console.log('CLI wallet balance:', balance / 1e9, 'SOL');

// Also check if there are any other wallets
const walletDirs = [
  join(homedir(), '.config/solana'),
  join(homedir(), 'Work/dungeons-and-moles/solana-programs'),
];

for (const dir of walletDirs) {
  if (existsSync(dir)) {
    const { readdirSync } = await import('fs');
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    console.log(`\nFiles in ${dir}:`);
    for (const f of files.slice(0, 10)) {
      const fullPath = join(dir, f);
      try {
        const content = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (Array.isArray(content) && content.length === 64) {
          const kp = Keypair.fromSecretKey(Uint8Array.from(content));
          const bal = await connection.getBalance(kp.publicKey);
          console.log(`  ${f}: ${kp.publicKey.toBase58()} (${bal/1e9} SOL)`);
        }
      } catch (e) {}
    }
  }
}
