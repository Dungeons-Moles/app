/**
 * Polyfills required for Solana web3.js in React Native
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Make Buffer available globally
global.Buffer = Buffer;

// Patch: buffer-layout's Union.getVariant uses Buffer.isBuffer() to decide
// whether to read the discriminant byte from binary data. @solana/web3.js
// returns Uint8Array (not the polyfill's Buffer) from getAccountInfo on RN,
// so isBuffer returns false, the discriminant is never read, and Anchor's
// enum deserialization throws "variant mismatch". Fix: treat Uint8Array as
// buffer-compatible since it shares the same byte-access interface.
const _originalIsBuffer = Buffer.isBuffer;
Buffer.isBuffer = function isBuffer(b: unknown): b is Buffer {
  return _originalIsBuffer(b) || b instanceof Uint8Array;
};

// Patch: ensure Uint8Array instances created from Buffer.from(ArrayBuffer, ...)
// retain Buffer prototype methods (readUIntLE, etc.) on React Native Android.
// Some RN environments return plain Uint8Array from Buffer.from(arrayBuffer, offset, length).
const uint8ArrayPrototype = Uint8Array.prototype as Uint8Array & Record<string, unknown>;

if (!uint8ArrayPrototype.readUIntLE) {
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
      (uint8ArrayPrototype as any)[method] = function (...args: any[]) {
        return (Buffer.from(this) as any)[method](...args);
      };
    }
  }
}
