/**
 * Check VRF transaction details on the ER to understand InvalidAccountForFee.
 */
import { Connection, PublicKey } from '@solana/web3.js';

const ER_URL = 'https://devnet.magicblock.app/';
const erConn = new Connection(ER_URL, { commitment: 'processed' });

const ROUTER_URL = 'https://devnet-router.magicblock.app/';
const routerConn = new Connection(ROUTER_URL, { commitment: 'processed' });

// Last known VRF TX signatures from the test
const sigs = [
  '2p8j7R3i31bkDJ35Ri3QWDySPjPg56KjnkcL5vCXFXziWXygbohrM1DZwef6nNSxFRfRyJP3ZGYykrBt1b2zD5kn',
  '3JZwTnJeRKLpwG9ah3yc8JdMz6EMHhDcWbxY5W9Sy3XPkqU9Em9Zpbbze2osJiQRQ9BW5x3CdXWVxuoUQBUUMTb3',
  'ppGSw6BtyVe8ZE8vCpUikrf9iJRgrosmytRCxkvJ4wzaAMEKzReEAk5grDN1S4Brxak8dZj8RovmYtmLCkurAWb',
];

// Map/sync TX that "succeeded"
const mapSig = '3ngdNJ9majpxHg8k3tPeLnVZvJghz3MhzcSmMdHjDcMhG9dEMHJfBGMuZUpa75Thf8S3H3tABcrPu6DqD1j8jKUZ';

// Session signer from the test
const sessionSigner = new PublicKey('8TGyqubKoViEDCtXRLfyuUEA4u2UaU4zhvyCAuyDTzYb');

async function run() {
  // Check session signer on both connections
  console.log('=== Session Signer Balance ===');
  try {
    const balDirect = await erConn.getBalance(sessionSigner, 'processed');
    console.log(`  Direct ER: ${balDirect} lamports (${balDirect / 1e9} SOL)`);
  } catch (e) { console.log(`  Direct ER: error - ${e.message}`); }

  try {
    const balRouter = await routerConn.getBalance(sessionSigner, 'processed');
    console.log(`  Router: ${balRouter} lamports (${balRouter / 1e9} SOL)`);
  } catch (e) { console.log(`  Router: error - ${e.message}`); }

  // Also check session signer account info (owner, etc.)
  try {
    const info = await erConn.getAccountInfo(sessionSigner, 'processed');
    if (info) {
      console.log(`  Account owner: ${info.owner.toBase58()}`);
      console.log(`  Account executable: ${info.executable}`);
      console.log(`  Account data length: ${info.data.length}`);
      console.log(`  Account rent epoch: ${info.rentEpoch}`);
    } else {
      console.log('  Account info: NULL (does not exist on ER)');
    }
  } catch (e) { console.log(`  Account info error: ${e.message}`); }

  // Check VRF TX details
  console.log('\n=== VRF Transaction Details ===');
  for (const sig of sigs) {
    console.log(`\nSig: ${sig.slice(0, 20)}...`);
    try {
      const tx = await erConn.getTransaction(sig, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (tx) {
        console.log('  Error:', JSON.stringify(tx.meta?.err));
        console.log('  Fee:', tx.meta?.fee);
        console.log('  Logs:');
        tx.meta?.logMessages?.forEach((l, i) => console.log(`    [${i}] ${l}`));
      } else {
        console.log('  TX not found on direct ER');
      }
    } catch (e) { console.log(`  Error fetching: ${e.message}`); }
  }

  // Check map_and_sync TX
  console.log('\n=== Map/Sync Transaction Details ===');
  console.log(`Sig: ${mapSig.slice(0, 20)}...`);
  try {
    const tx = await erConn.getTransaction(mapSig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (tx) {
      console.log('  Error:', JSON.stringify(tx.meta?.err));
      console.log('  Fee:', tx.meta?.fee);
      console.log('  Logs:');
      tx.meta?.logMessages?.forEach((l, i) => console.log(`    [${i}] ${l}`));
    } else {
      console.log('  TX not found on direct ER');
    }
  } catch (e) { console.log(`  Error fetching: ${e.message}`); }
}

run().catch(console.error);
