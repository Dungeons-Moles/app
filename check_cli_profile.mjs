import { Connection, PublicKey } from '@solana/web3.js';

const PLAYER_PROFILE_PROGRAM_ID = new PublicKey('Ch3bbL1oQk2z5rX1jiun3KuSWZqnXZ1MnrfrtKj4MKun');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

function derivePlayerProfilePda(walletKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('player_profile'), walletKey.toBuffer()],
    PLAYER_PROFILE_PROGRAM_ID
  );
}

async function checkWallet(address) {
  const key = new PublicKey(address);
  const [pda] = derivePlayerProfilePda(key);
  const info = await connection.getAccountInfo(pda);
  console.log(`Wallet: ${address}`);
  console.log(`Has profile: ${info !== null}`);
  if (info) {
    const data = info.data;
    const nameLen = data.readUInt32LE(8);
    if (nameLen > 0 && nameLen < 50) {
      const nameBytes = data.slice(12, 12 + nameLen);
      console.log(`Name: "${Buffer.from(nameBytes).toString('utf8')}"`);
    }
  }
  const balance = await connection.getBalance(key);
  console.log(`Balance: ${balance / 1e9} SOL`);
  console.log('---');
}

await checkWallet('AXwYStYVryJuZjNJjHHLPp6eVRc2TuESnW1pCMiUYrwV'); // CLI wallet
