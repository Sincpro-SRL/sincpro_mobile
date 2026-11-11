import { randomBytes, randomUUID as nodeRandomUUID } from "node:crypto";

export function getRandomBytes(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}

export function getRandomValues<T extends ArrayBufferView>(typedArray: T): T {
  const bytes = new Uint8Array(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength,
  );
  bytes.set(randomBytes(typedArray.byteLength));
  return typedArray;
}

export function randomUUID(): string {
  return nodeRandomUUID();
}

export async function digestStringAsync(): Promise<string> {
  return "";
}

export const CryptoDigestAlgorithm = {
  SHA1: "SHA1",
  SHA256: "SHA256",
  SHA384: "SHA384",
  SHA512: "SHA512",
  MD2: "MD2",
  MD4: "MD4",
  MD5: "MD5",
};

export const CryptoEncoding = {
  BASE64: "base64",
  HEX: "hex",
};
