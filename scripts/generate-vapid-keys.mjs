#!/usr/bin/env node

/**
 * UniFlow — VAPID Keypair Generator
 *
 * Generates a cryptographically valid P-256 (prime256v1) VAPID keypair
 * formatted as Base64URL strings for Web Push RFC 8291 / 8292.
 *
 * Usage:
 *   node scripts/generate-vapid-keys.mjs
 */

import crypto from 'node:crypto';
import { validateVapidKeypair } from './dispatch-class-reminders.mjs';

console.log('============================================================');
console.log(' UniFlow VAPID Keypair Generator (P-256 / prime256v1)');
console.log('============================================================\n');

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const publicKey = ecdh.getPublicKey('base64url');
const privateKey = ecdh.getPrivateKey('base64url');

const pubBuf = Buffer.from(publicKey, 'base64url');
const privBuf = Buffer.from(privateKey, 'base64url');

console.log('Verification:');
console.log(`- Public Key:  ${pubBuf.length} bytes (expected 65 bytes uncompressed point)`);
console.log(`- Private Key: ${privBuf.length} bytes (expected 32 bytes scalar)`);

const validation = validateVapidKeypair(publicKey, privateKey);
if (!validation.valid) {
  console.error('\n❌ Generation validation failed:', validation.error);
  process.exit(1);
}

console.log('\n✅ Cryptographic validation succeeded! Keypair matches mathematically.\n');
console.log('------------------------------------------------------------');
console.log('VAPID_PUBLIC_KEY:');
console.log(publicKey);
console.log('\nVAPID_PRIVATE_KEY:');
console.log(privateKey);
console.log('------------------------------------------------------------\n');

console.log('Configuration Instructions:');
console.log('1. In GitHub Repository Secrets:');
console.log('   - Set VAPID_PUBLIC_KEY to the public key above.');
console.log('   - Set VAPID_PRIVATE_KEY to the private key above.');
console.log('   - Ensure NO trailing newlines, whitespace, or surrounding quotes are included.');
console.log('   - NEVER commit the private key to git or publish it in code.\n');
console.log('2. In your local .env or hosting environment:');
console.log(`   - Set VITE_FIREBASE_VAPID_KEY=${publicKey}\n`);
console.log('3. Client Subscription Migration:');
console.log('   - UniFlow automatically detects when the application server key changes');
console.log('     and seamlessly resubscribes the browser client on next app open.');
console.log('============================================================\n');
