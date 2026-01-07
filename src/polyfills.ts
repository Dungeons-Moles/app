/**
 * Polyfills required for Solana web3.js in React Native
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Make Buffer available globally
global.Buffer = Buffer;
