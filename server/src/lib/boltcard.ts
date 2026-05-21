import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function aesEcbEncryptBlock(key: Uint8Array, block: Uint8Array): Buffer<ArrayBuffer> {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.from(Buffer.concat([cipher.update(block), cipher.final()]));
}

function shiftLeft1(buf: Uint8Array): Buffer<ArrayBuffer> {
  const out = Buffer.alloc(16, 0);
  let carry = 0;
  for (let i = 15; i >= 0; i--) {
    out[i] = ((buf[i] << 1) | carry) & 0xff;
    carry = (buf[i] & 0x80) ? 1 : 0;
  }
  return out;
}

function xor16(a: Uint8Array, b: Uint8Array): Buffer {
  const out = Buffer.alloc(16, 0);
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i];
  return out;
}

function generateSubkeys(key: Buffer): [Buffer, Buffer] {
  const L = aesEcbEncryptBlock(key, Buffer.alloc(16, 0));
  const msb1 = (L[0] & 0x80) !== 0;
  const K1 = shiftLeft1(L);
  if (msb1) K1[15] ^= 0x87;

  const msb2 = (K1[0] & 0x80) !== 0;
  const K2 = shiftLeft1(K1);
  if (msb2) K2[15] ^= 0x87;

  return [K1, K2];
}

function aesCmac(key: Buffer, message: Buffer): Buffer {
  const [K1, K2] = generateSubkeys(key);
  const blockCount = Math.max(1, Math.ceil(message.length / 16));
  let X = Buffer.alloc(16, 0);

  for (let i = 0; i < blockCount - 1; i++) {
    const block = message.subarray(i * 16, (i + 1) * 16);
    X = aesEcbEncryptBlock(key, xor16(X, block));
  }

  const lastBlock = message.subarray((blockCount - 1) * 16);
  if (lastBlock.length === 16) {
    return aesEcbEncryptBlock(key, xor16(xor16(X, lastBlock), K1));
  } else {
    const padded = Buffer.alloc(16, 0);
    lastBlock.copy(padded);
    padded[lastBlock.length] = 0x80;
    return aesEcbEncryptBlock(key, xor16(xor16(X, padded), K2));
  }
}

export interface SunDecryptResult {
  uid: Buffer;
  counter: number;
}

export function decryptSunP(key1Hex: string, pHex: string): SunDecryptResult | null {
  try {
    if (pHex.length !== 32) return null;
    const key = Buffer.from(key1Hex, "hex");
    const ciphertext = Buffer.from(pHex, "hex");
    if (key.length !== 16 || ciphertext.length !== 16) return null;

    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0));
    decipher.setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    if (plain[0] !== 0xc7) return null;
    const uid = plain.subarray(1, 8);
    const counter = plain.readUIntLE(8, 3);
    return { uid, counter };
  } catch {
    return null;
  }
}

export function verifySunC(key2Hex: string, uid: Buffer, counter: number, cHex: string): boolean {
  try {
    if (cHex.length !== 16) return false;
    const key2 = Buffer.from(key2Hex, "hex");
    if (key2.length !== 16) return false;

    const ctrBuf = Buffer.alloc(3, 0);
    ctrBuf.writeUIntLE(counter, 0, 3);

    const sv2 = Buffer.alloc(16, 0);
    sv2[0] = 0x3c; sv2[1] = 0xc3; sv2[2] = 0x00;
    sv2[3] = 0x01; sv2[4] = 0x00; sv2[5] = 0x80;
    uid.copy(sv2, 6);
    ctrBuf.copy(sv2, 13);

    const sessionMacKey = aesCmac(key2, sv2);
    const fullCmac = aesCmac(sessionMacKey, Buffer.alloc(0));

    const truncated = Buffer.alloc(8, 0);
    for (let i = 0; i < 8; i++) truncated[i] = fullCmac[1 + i * 2];

    const provided = Buffer.from(cHex, "hex");
    return truncated.equals(provided);
  } catch {
    return false;
  }
}

export function parseBolt11AmountSats(bolt11: string): number | null {
  const lower = bolt11.toLowerCase();
  const match = lower.match(/^ln(?:bc|tb|bcrt)(\d+)([munp]?)1/);
  if (!match || !match[1]) return null;

  const num = Number(match[1]);
  const mult = match[2] ?? "";

  switch (mult) {
    case "m": return num * 100_000;
    case "u": return num * 100;
    case "n": return Math.floor(num / 10);
    case "p": return 0;
    default: return num * 100_000_000;
  }
}

export function generateK1(): string {
  return randomBytes(16).toString("hex");
}
