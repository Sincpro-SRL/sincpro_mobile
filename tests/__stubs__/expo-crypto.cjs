"use strict";
const { randomBytes } = require("node:crypto");
exports.getRandomBytes = (n) => new Uint8Array(randomBytes(n));
exports.randomUUID = () => crypto.randomUUID();
exports.digestStringAsync = async () => "";
exports.CryptoDigestAlgorithm = {
  SHA1: "SHA1",
  SHA256: "SHA256",
  MD5: "MD5",
  MD4: "MD4",
  MD2: "MD2",
  SHA384: "SHA384",
  SHA512: "SHA512",
};
exports.CryptoEncoding = { BASE64: "base64", HEX: "hex" };
