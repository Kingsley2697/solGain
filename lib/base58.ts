const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Encodes wallet signatures without adding a client dependency just for base58. */
export function base58Encode(bytes: Uint8Array) {
  if (!bytes.length) return "";
  const digits = [0];
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    const byte = bytes[byteIndex];
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      carry += digits[index] << 8;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let encoded = "";
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) { if (bytes[byteIndex] !== 0) break; encoded += "1"; }
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (index === 0 && digits[index] === 0) continue;
    encoded += alphabet[digits[index]];
  }
  return encoded;
}
