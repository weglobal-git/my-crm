import { test, describe } from 'node:test';
import assert from 'node:assert';
import { EncryptionService } from './encryption';

describe('EncryptionService', () => {
  const keyV1 = 'a'.repeat(64); // 32 bytes hex
  const keyV2 = 'b'.repeat(64); // 32 bytes hex
  const keyWrongSize = 'c'.repeat(32); // 16 bytes hex

  test('constructor validates keyring and active version', () => {
    assert.throws(() => new EncryptionService({}, 'v1'), /Keyring cannot be empty/);
    assert.throws(() => new EncryptionService({ v1: keyV1 }, 'v2'), /Active key version 'v2' not found/);
    assert.throws(() => new EncryptionService({ v1: keyWrongSize }, 'v1'), /must be exactly 32 bytes/);
    
    // Should succeed
    new EncryptionService({ v1: keyV1, v2: keyV2 }, 'v1');
  });

  test('encrypt and decrypt works correctly', () => {
    const service = new EncryptionService({ v1: keyV1 }, 'v1');
    const plaintext = 'super_secret_api_key_123';
    
    const encrypted = service.encrypt(plaintext);
    assert.ok(encrypted.startsWith('v1:'));
    
    const decrypted = service.decrypt(encrypted);
    assert.strictEqual(decrypted, plaintext);
  });

  test('key rotation: decrypts old version, encrypts with new version', () => {
    const serviceV1 = new EncryptionService({ v1: keyV1 }, 'v1');
    const encryptedV1 = serviceV1.encrypt('hello world');
    
    // Rotate to v2, but keep v1 in keyring
    const serviceV2 = new EncryptionService({ v1: keyV1, v2: keyV2 }, 'v2');
    
    // Decrypting v1 payload should still work
    const decryptedV1 = serviceV2.decrypt(encryptedV1);
    assert.strictEqual(decryptedV1, 'hello world');
    
    // New encryptions should use v2
    const encryptedV2 = serviceV2.encrypt('hello world 2');
    assert.ok(encryptedV2.startsWith('v2:'));
    
    const decryptedV2 = serviceV2.decrypt(encryptedV2);
    assert.strictEqual(decryptedV2, 'hello world 2');
  });

  test('decrypt fails with wrong key (different version)', () => {
    const service1 = new EncryptionService({ v1: keyV1 }, 'v1');
    const encrypted = service1.encrypt('secret');
    
    // Attempt to decrypt with a keyring that doesn't have v1
    const service2 = new EncryptionService({ v2: keyV2 }, 'v2');
    assert.throws(() => service2.decrypt(encrypted), /Key version 'v1' not found/);
  });
  
  test('decrypt fails with wrong key (same version, wrong bytes)', () => {
    const service1 = new EncryptionService({ v1: keyV1 }, 'v1');
    const encrypted = service1.encrypt('secret');
    
    // Attempt to decrypt with a keyring that has v1 but wrong bytes
    const service2 = new EncryptionService({ v1: keyV2 }, 'v1');
    assert.throws(() => service2.decrypt(encrypted), /Decryption failed/);
  });

  test('decrypt fails on malformed payload', () => {
    const service = new EncryptionService({ v1: keyV1 }, 'v1');
    
    assert.throws(() => service.decrypt(''), /Malformed encrypted payload/);
    assert.throws(() => service.decrypt('v1:iv:authtag'), /Malformed encrypted payload/);
  });

  test('decrypt fails on tampered ciphertext', () => {
    const service = new EncryptionService({ v1: keyV1 }, 'v1');
    const encrypted = service.encrypt('sensitive_data');
    
    const parts = encrypted.split(':');
    // Tamper ciphertext
    parts[3] = Buffer.from('tampered').toString('base64');
    
    assert.throws(() => service.decrypt(parts.join(':')), /Decryption failed/);
  });
  
  test('decrypt fails on tampered auth tag', () => {
    const service = new EncryptionService({ v1: keyV1 }, 'v1');
    const encrypted = service.encrypt('sensitive_data');
    
    const parts = encrypted.split(':');
    // Tamper auth tag
    parts[2] = Buffer.from('tamperedtag12345').toString('base64');
    
    assert.throws(() => service.decrypt(parts.join(':')), /Decryption failed/);
  });
});
