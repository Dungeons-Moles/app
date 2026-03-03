import { Keypair } from '@solana/web3.js';

const secretArr = [3,93,107,215,38,69,172,217,125,150,181,65,163,175,202,192,224,141,39,170,90,202,79,248,80,159,169,33,233,177,103,1,187,191,149,157,63,178,14,36,89,254,170,28,83,115,47,127,57,202,148,16,157,166,136,241,72,252,152,122,9,21,245,194];
const secretKey = Uint8Array.from(secretArr);
const keypair = Keypair.fromSecretKey(secretKey);
console.log('Public key:', keypair.publicKey.toBase58());
