/**
 * The cryptographic logic in this file is a TypeScript port of the pylgate project
 * (https://github.com/DonutByte/pylgate), which is licensed under the
 * Creative Commons Attribution 3.0 Unported License.
 */

// Constants
const T_C_KEY = new Uint8Array([0xFA, 0xD3, 0x25, 0x72, 0x81, 0x29, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3A, 0xB4, 0x5A, 0x65]);
const TOKEN_SIZE = 23; // Based on token structure: 1 byte type + 6 bytes phone + 16 bytes AES output
const TIMESTAMP_OFFSET = 2;

import { aesTransform } from "./aes";

function pack64(num: number) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(num), false);
  return new Uint8Array(buf);
}

function pack32be(num: number) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, num, false);
  return new Uint8Array(buf);
}

function pack16le(num: number) {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, num, true);
  return new Uint8Array(buf);
}

function step1(session: Uint8Array, phone: number) {
  const key = new Uint8Array(T_C_KEY);
  key.set(pack64(phone).slice(2), 6);
  return aesTransform(session, key, false);
}

function step2(key: Uint8Array, ts: number) {
  const state = new Uint8Array(16);
  state.set(pack16le(0x0a0a), 1);
  state.set(pack32be(ts + TIMESTAMP_OFFSET), 10);
  return aesTransform(state, key, true);
}

export function generateToken(
  sessionTokenHex: string,
  phone: number,
  type: "PRIMARY" | "SECONDARY" | "SMS",
  timestamp?: number
): string {
  const sessionToken = fromHex(sessionTokenHex);
  if (sessionToken.length !== 16) {
    throw new Error("Invalid session token");
  }

  const ts = timestamp ?? Math.floor(Date.now() / 1000);

  const s1 = step1(sessionToken, phone);
  const s2 = step2(s1, ts);

  const out = new Uint8Array(TOKEN_SIZE);

  if (type === "SMS") out[0] = 0x01;
  else if (type === "PRIMARY") out[0] = 0x11;
  else if (type === "SECONDARY") out[0] = 0x21;
  else throw new Error("Invalid token type");

  const packed = pack64(phone);

  out.set(packed.slice(2, 8), 1);
  out.set(s2, 7);

  let hexResult = "";
  for (let i = 0; i < out.length; i++) {
    hexResult += out[i].toString(16).padStart(2, "0");
  }
  return hexResult.toUpperCase();
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}