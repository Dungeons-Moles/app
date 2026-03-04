/**
 * Polyfills required for Solana web3.js in React Native
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Make Buffer available globally
global.Buffer = Buffer;

// Patch: ensure Uint8Array instances created from Buffer.from(ArrayBuffer, ...)
// retain Buffer prototype methods (readUIntLE, etc.) on React Native Android.
// Some RN environments return plain Uint8Array from Buffer.from(arrayBuffer, offset, length).
if (!Uint8Array.prototype.readUIntLE) {
  const bufferMethods = [
    'readUIntLE',
    'readUIntBE',
    'readIntLE',
    'readIntBE',
    'readUInt8',
    'readUInt16LE',
    'readUInt16BE',
    'readUInt32LE',
    'readUInt32BE',
    'readInt8',
    'readInt16LE',
    'readInt16BE',
    'readInt32LE',
    'readInt32BE',
    'readFloatLE',
    'readFloatBE',
    'readDoubleLE',
    'readDoubleBE',
    'writeUIntLE',
    'writeUIntBE',
    'writeIntLE',
    'writeIntBE',
  ] as const;

  for (const method of bufferMethods) {
    if (typeof (Buffer.prototype as any)[method] === 'function') {
      (Uint8Array.prototype as any)[method] = function (...args: any[]) {
        return (Buffer.from(this) as any)[method](...args);
      };
    }
  }
}
