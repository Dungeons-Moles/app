import { Keypair } from '@solana/web3.js';

const secretArr = [82,127,228,171,98,253,38,172,65,209,137,8,45,177,251,159,37,63,164,4,88,208,252,65,44,193,248,211,38,193,130,228,71,52,77,167,98,144,52,245,45,15,101,202,9,11,44,47,6,104,200,177,82,198,144,26,175,45,254,77,10,179,141,60];
const kp = Keypair.fromSecretKey(Uint8Array.from(secretArr));
console.log('Public key:', kp.publicKey.toBase58());
