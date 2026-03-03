import { Connection, PublicKey } from '@solana/web3.js';

const PLAYER_PROFILE_PROGRAM_ID = new PublicKey('Ch3bbL1oQk2z5rX1jiun3KuSWZqnXZ1MnrfrtKj4MKun');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function derivePlayerProfilePda(walletKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('player_profile'), walletKey.toBuffer()],
    PLAYER_PROFILE_PROGRAM_ID
  );
}

async function checkWallet(address) {
  try {
    const key = new PublicKey(address);
    const [pda] = derivePlayerProfilePda(key);
    const info = await connection.getAccountInfo(pda);
    console.log(`Wallet: ${address}`);
    console.log(`Profile PDA: ${pda.toBase58()}`);
    console.log(`Has profile: ${info !== null}`);
    if (info) {
      console.log(`Data length: ${info.data.length}`);
      // Try to read name (assuming it's a string at a known offset)
      const data = info.data;
      // Anchor account discriminator is 8 bytes, then name is a string (4 bytes length + data)
      // Try to find printable chars
      const nameOffset = 8; // after discriminator
      const nameLen = data.readUInt32LE(nameOffset);
      console.log(`Name length field: ${nameLen}`);
      if (nameLen > 0 && nameLen < 100) {
        const nameBytes = data.slice(nameOffset + 4, nameOffset + 4 + nameLen);
        console.log(`Name: ${Buffer.from(nameBytes).toString('utf8')}`);
      }
    }
    console.log('---');
  } catch (e) {
    console.log(`Error for ${address}: ${e.message}`);
  }
}

// Check both wallets
await checkWallet('DdtgJruGthLbSeXgS8Siktm3kANQCCctiBiMj3ky5ZbF'); // current dev wallet
await checkWallet('4veW1tCzC7BK4eN2GiMnNoA3mikCGbJnSAQFkChSiZWu'); // test wallet
