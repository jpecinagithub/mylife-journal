#!/usr/bin/env node
/**
 * MyLife Journal — owner password hashing helper.
 *
 * Usage:
 *   MYLIFE_PASSWORD="your-secret-password" npm run hash-password
 *
 * The password is read from the MYLIFE_PASSWORD env var (never from argv, so
 * it doesn't land in shell history). As a fallback it also accepts the
 * password as the first CLI argument, with a warning.
 *
 * Prints a bcrypt hash (cost 12). Paste it into the OWNER_PASSWORD_HASH env var.
 */
import bcrypt from 'bcryptjs';

const COST = 12;

let password = process.env.MYLIFE_PASSWORD;

if (!password && process.argv[2]) {
  console.warn(
    'WARNING: passing the password as an argument may store it in shell history. Prefer MYLIFE_PASSWORD env var.',
  );
  password = process.argv[2];
}

if (!password) {
  console.error('ERROR: no password provided. Usage: MYLIFE_PASSWORD="secret" npm run hash-password');
  process.exit(1);
}

const hash = await bcrypt.hash(password, COST);
console.log(hash);
