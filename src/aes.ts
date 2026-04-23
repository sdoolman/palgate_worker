import aesjs from "aes-js";

export function aesTransform(
  state: Uint8Array,
  key: Uint8Array,
  encrypt: boolean
): Uint8Array {
  const aes = new aesjs.ModeOfOperation.ecb(key);

  return encrypt
    ? aes.encrypt(state)
    : aes.decrypt(state);
}