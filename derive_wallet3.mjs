import { Keypair } from '@solana/web3.js';

const fullSecret = [242,115,66,30,103,26,158,182,0,148,131,163,189,75,85,107,151,212,251,178,246,99,64,144,215,29,160,212,189,22,125,84,97,227,130,113,184,68,252,142,186,145,81,129,139,186,92,80,29,212,48,4,199,89,42,196,45,51,250,120,55,1,170,26];
console.log('Length:', fullSecret.length);

const kp = Keypair.fromSecretKey(Uint8Array.from(fullSecret));
console.log('Public key:', kp.publicKey.toBase58());
