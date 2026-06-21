import CryptoJS from "crypto-js";

export interface EncryptedMessage {
  encryptedContent: string;
  iv: string;
  salt: string;
}

export interface GroupKey {
  key: string;
  salt: string;
  createdAt: string;
}

/**
 * Generate a random encryption key
 */
export const generateEncryptionKey = (): string => {
  return CryptoJS.lib.WordArray.random(256 / 8).toString();
};

/**
 * Generate a random salt for key derivation
 */
export const generateSalt = (): string => {
  return CryptoJS.lib.WordArray.random(128 / 8).toString();
};

/**
 * Helper to decode a string that might be Hex or Base64
 */
const autoDecode = (str: string): CryptoJS.lib.WordArray => {
  if (!str) return CryptoJS.lib.WordArray.create();
  
  // Very basic heuristic: Hex is only 0-9a-f. 
  // Base64 often ends with = or contains +, /
  const isHex = /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0;
  
  if (isHex) {
    return CryptoJS.enc.Hex.parse(str);
  }
  
  // Fallback to Base64
  try {
    return CryptoJS.enc.Base64.parse(str);
  } catch (e) {
    console.error("Failed to parse encryption metadata:", str);
    return CryptoJS.lib.WordArray.create();
  }
};

/**
 * Derive a key from a password using PBKDF2
 */
export const deriveKeyFromPassword = (
  password: string,
  salt: string
): CryptoJS.lib.WordArray => {
  if (!password || !salt) {
    console.error("Encryption error: Missing password or salt for PBKDF2");
    // Return a dummy WordArray to prevent crash, but decryption will naturally fail
    return CryptoJS.lib.WordArray.create();
  }

  // Parse the salt using autoDecode to handle both Hex and Base64
  const saltWords = autoDecode(salt);
  console.log(`🛡️ [Encryption] Derived key from password: "${password}", saltWords:`, saltWords.toString());

  return CryptoJS.PBKDF2(password, saltWords, {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  });
};

/**
 * Encrypt a message using AES-256-CBC
 */
export const encryptMessage = (
  message: string,
  key: string
): EncryptedMessage => {
  const salt = generateSalt();
  const derivedKey = deriveKeyFromPassword(key, salt);
  const iv = CryptoJS.lib.WordArray.random(128 / 8);

  const encrypted = CryptoJS.AES.encrypt(message, derivedKey, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    encryptedContent: encrypted.toString(),
    iv: iv.toString(),
    salt: salt,
  };
};


/**
 * Decrypt a message using AES-256-CBC
 */
export const decryptMessage = (
  encryptedMessage: EncryptedMessage,
  key: string
): string => {
  if (!key) return "";
  
  console.log(`🛡️ [Encryption] Decrypting with key: "${key}", salt: "${encryptedMessage.salt}"`);
  
  // 1. Attempt standard decryption (post-May 13 algorithm)
  try {
    const derivedKey = deriveKeyFromPassword(key, encryptedMessage.salt);
    const ciphertext = autoDecode(encryptedMessage.encryptedContent);
    const iv = autoDecode(encryptedMessage.iv);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext } as CryptoJS.lib.CipherParams,
      derivedKey,
      {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (result) return result;
  } catch (e) {
    // Ignore and proceed to legacy fallback
  }

  // 2. Attempt legacy decryption fallback (pre-May 13 algorithm)
  try {
    const legacyDerivedKey = CryptoJS.PBKDF2(key, encryptedMessage.salt, {
      keySize: 256 / 32,
      iterations: 10000,
    }).toString();

    const legacyDecrypted = CryptoJS.AES.decrypt(
      encryptedMessage.encryptedContent,
      legacyDerivedKey,
      {
        iv: CryptoJS.enc.Hex.parse(encryptedMessage.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return legacyDecrypted.toString(CryptoJS.enc.Utf8) || "";
  } catch (e) {
    return "";
  }
};

/**
 * Generate a group encryption key
 */
export const generateGroupKey = (): GroupKey => {
  return {
    key: generateEncryptionKey(),
    salt: generateSalt(),
    createdAt: new Date().toISOString(),
  };
};

/**
 * Encrypt a message for a specific group
 */
export const encryptGroupMessage = (
  message: string,
  groupKey: string
): EncryptedMessage => {
  return encryptMessage(message, groupKey);
};

/**
 * Decrypt a message for a specific group
 */
export const decryptGroupMessage = (
  encryptedMessage: EncryptedMessage,
  groupKey: string
): string => {
  return decryptMessage(encryptedMessage, groupKey);
};

export const hashString = (str: string): string => {
  return CryptoJS.SHA256(str).toString();
};

/**
 * Generate a fingerprint for key verification
 */
export const generateKeyFingerprint = (key: string): string => {
  return CryptoJS.SHA256(key).toString().substring(0, 16);
};

/**
 * Convert Uint8Array to CryptoJS WordArray
 */
const u8ToWordArray = (u8a: Uint8Array): CryptoJS.lib.WordArray => {
  const words = [];
  for (let i = 0; i < u8a.length; i += 4) {
    words.push(
      ((u8a[i] || 0) << 24) |
      ((u8a[i + 1] || 0) << 16) |
      ((u8a[i + 2] || 0) << 8) |
      (u8a[i + 3] || 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words, u8a.length);
};

/**
 * Convert CryptoJS WordArray to Uint8Array
 */
const wordArrayToU8 = (wordArray: CryptoJS.lib.WordArray): Uint8Array => {
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;
  const u8 = new Uint8Array(sigBytes);
  let write = 0;
  for (let i = 0; i < sigBytes; i++) {
    const byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    u8[write++] = byte;
  }
  return u8;
};

/**
 * Decrypt raw encrypted file bytes using AES-256-CBC
 */
export const decryptFileBytes = (
  encryptedBytes: Uint8Array,
  iv: string,
  salt: string,
  key: string
): Uint8Array => {
  const derivedKey = deriveKeyFromPassword(key, salt);
  const ciphertext = u8ToWordArray(encryptedBytes);
  const ivWords = autoDecode(iv);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext } as CryptoJS.lib.CipherParams,
    derivedKey,
    {
      iv: ivWords,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  return wordArrayToU8(decrypted);
};
