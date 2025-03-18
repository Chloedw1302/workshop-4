import { webcrypto } from "crypto";

// #############
// ### Utils ###
// #############

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const buff = Buffer.from(base64, "base64");
  return buff.buffer.slice(buff.byteOffset, buff.byteOffset + buff.byteLength);
}

function generateIV(): Uint8Array {
  const iv = new Uint8Array(12);  // Taille recommandée pour AES-CBC
  webcrypto.getRandomValues(iv);
  return iv;
}

// ################
// ### RSA keys ###
// ################

type GenerateRsaKeyPair = {
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
};

export async function generateRsaKeyPair(): Promise<GenerateRsaKeyPair> {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

export async function exportPubKey(key: webcrypto.CryptoKey): Promise<string> {
  const keyData = await webcrypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(keyData);
}

export async function exportPrvKey(key: webcrypto.CryptoKey): Promise<string> {
  const keyData = await webcrypto.subtle.exportKey("pkcs8", key);
  return arrayBufferToBase64(keyData);
}

export async function importPubKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const keyData = base64ToArrayBuffer(strKey);
  return webcrypto.subtle.importKey(
    "spki",
    keyData,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

export async function importPrvKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const keyData = base64ToArrayBuffer(strKey);
  return webcrypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

export async function rsaEncrypt(
  data: string,
  strPublicKey: string
): Promise<string> {
  const publicKey = await importPubKey(strPublicKey);
  const encodedData = new TextEncoder().encode(data);

  const encryptedData = await webcrypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    encodedData
  );

  return arrayBufferToBase64(encryptedData);
}

export async function rsaDecrypt(
  encryptedData: string,
  privateKey: webcrypto.CryptoKey
): Promise<string> {
  const decryptedData = await webcrypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToArrayBuffer(encryptedData)
  );

  return new TextDecoder().decode(decryptedData);
}


// ######################
// ### Symmetric keys ###
// ######################

export async function createRandomSymmetricKey(): Promise<webcrypto.CryptoKey> {
  return webcrypto.subtle.generateKey(
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportSymKey(key: webcrypto.CryptoKey): Promise<string> {
  const keyData = await webcrypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(keyData);
}

export async function importSymKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const keyData = base64ToArrayBuffer(strKey);
  return webcrypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-CBC" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function symEncrypt(
  key: webcrypto.CryptoKey,
  data: string
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = webcrypto.getRandomValues(new Uint8Array(16));  // IV de 16 octets pour AES-CBC

  const encryptedData = await webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    encoder.encode(data)
  );

  const combinedData = new Uint8Array(iv.byteLength + encryptedData.byteLength);
  combinedData.set(iv, 0);
  combinedData.set(new Uint8Array(encryptedData), iv.byteLength);

  return arrayBufferToBase64(combinedData.buffer);
}

export async function symDecrypt(
  strKey: string,
  encryptedData: string
): Promise<string> {
  const key = await importSymKey(strKey);
  const combinedData = base64ToArrayBuffer(encryptedData);

  const iv = new Uint8Array(combinedData.slice(0, 16));  // Extraction de l'IV de 16 octets
  const encryptedMessage = combinedData.slice(16);

  const decryptedData = await webcrypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    encryptedMessage
  );

  return new TextDecoder().decode(decryptedData);
}






