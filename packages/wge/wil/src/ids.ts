/**
 * ID generation for WIL messages and traces.
 *
 * WIL-001.001: message ids MUST be globally unique; ids are strings
 * (WIL-001.009). The Codex uses prefixed ids (msg_, trace_) in its examples;
 * this follows that convention.
 *
 * Isomorphic: WIL runs wherever a renderer or runtime does (SLI-1500.017
 * multi-device), so entropy comes from the Web Crypto API — available in
 * browsers and in Node ≥19 as a global — with no platform imports.
 */

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function randomBase64url(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  // 6 bits per character; 9 bytes → 12 characters, no padding needed.
  let out = "";
  let bitBuffer = 0;
  let bitCount = 0;
  for (const byte of buffer) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 6) {
      bitCount -= 6;
      out += BASE64URL_ALPHABET[(bitBuffer >> bitCount) & 0x3f];
    }
  }
  if (bitCount > 0) {
    out += BASE64URL_ALPHABET[(bitBuffer << (6 - bitCount)) & 0x3f];
  }
  return out;
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomBase64url(9)}`;
}

export const generateMessageId = (): string => generateId("msg");
export const generateTraceId = (): string => generateId("trace");
export const generateOutcomeId = (): string => generateId("outcome");
