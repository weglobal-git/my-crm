import crypto from 'crypto';

export interface KeyRing {
  [version: string]: Buffer;
}

export class EncryptionService {
  private activeVersion: string;
  private keyRing: KeyRing;
  private algorithm = 'aes-256-gcm';

  constructor(keyRingHex: Record<string, string>, activeVersion: string) {
    if (!keyRingHex || Object.keys(keyRingHex).length === 0) {
      throw new Error('Keyring cannot be empty');
    }
    if (!keyRingHex[activeVersion]) {
      throw new Error(`Active key version '${activeVersion}' not found in keyring`);
    }

    this.activeVersion = activeVersion;
    this.keyRing = {};

    for (const [version, keyHex] of Object.entries(keyRingHex)) {
      const keyBuffer = Buffer.from(keyHex, 'hex');
      if (keyBuffer.length !== 32) {
        throw new Error(`Key version '${version}' must be exactly 32 bytes (64 hex characters) for aes-256-gcm`);
      }
      this.keyRing[version] = keyBuffer;
    }
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   * Format: version:iv(base64):authTag(base64):ciphertext(base64)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // Recommended 96-bit IV for GCM
    const key = this.keyRing[this.activeVersion];

    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${this.activeVersion}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted payload using the key version specified in the payload.
   */
  decrypt(payload: string): string {
    if (!payload || typeof payload !== 'string') {
      throw new Error('Malformed encrypted payload');
    }

    const parts = payload.split(':');
    if (parts.length !== 4) {
      throw new Error('Malformed encrypted payload');
    }

    const [version, ivBase64, authTagBase64, encryptedBase64] = parts;

    const key = this.keyRing[version];
    if (!key) {
      throw new Error(`Key version '${version}' not found in keyring`);
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);

    try {
      let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed: payload may be tampered or key is incorrect');
    }
  }
}

// Singleton export using Environment Variables
let defaultInstance: EncryptionService | null = null;

export function getSystemEncryption(): EncryptionService {
  if (defaultInstance) return defaultInstance;
  
  const keyRingStr = process.env.AI_SECRET_KEY_RING;
  const activeVersion = process.env.AI_SECRET_ACTIVE_VERSION;

  if (!keyRingStr || !activeVersion) {
    throw new Error('System encryption environment variables (AI_SECRET_KEY_RING, AI_SECRET_ACTIVE_VERSION) are not set');
  }

  let keyRing: Record<string, string>;
  try {
    keyRing = JSON.parse(keyRingStr);
  } catch {
    throw new Error('AI_SECRET_KEY_RING is not valid JSON');
  }

  defaultInstance = new EncryptionService(keyRing, activeVersion);
  return defaultInstance;
}
