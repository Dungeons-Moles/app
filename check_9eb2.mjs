import { Connection, PublicKey } from '@solana/web3.js';
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const balance = await connection.getBalance(new PublicKey('9eb2PBt6rGBfEnVbz1TTEdBh9wYh3okgFdWsvbu8E841'));
console.log('Balance:', balance / 1e9, 'SOL');
