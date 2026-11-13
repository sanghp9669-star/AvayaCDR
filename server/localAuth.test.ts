import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashPassword,
  signLocalAuthToken,
  validateUsername,
  verifyLocalAuthToken,
  verifyPassword,
} from './localAuth.ts';

test('hashPassword and verifyPassword use salted scrypt and reject wrong passwords', () => {
  const hash1 = hashPassword('AvayaCdr#2026');
  const hash2 = hashPassword('AvayaCdr#2026');

  assert.notEqual(hash1, hash2);
  assert.equal(verifyPassword('AvayaCdr#2026', hash1), true);
  assert.equal(verifyPassword('WrongPassword', hash1), false);
  assert.throws(() => hashPassword('short'));
});

test('signLocalAuthToken and verifyLocalAuthToken validate HS256 JWT and reject tampered tokens', () => {
  const token = signLocalAuthToken({
    uid: 'local:admin',
    email: 'admin@avaya-cdr.local',
    username: 'admin',
    role: 'admin',
  });

  const claims = verifyLocalAuthToken(token);
  assert.ok(claims);
  assert.equal(claims.uid, 'local:admin');
  assert.equal(claims.username, 'admin');
  assert.equal(claims.role, 'admin');

  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1]}.invalid_signature`;
  assert.equal(verifyLocalAuthToken(tampered), null);
});

test('validateUsername enforces safe alphanumeric rules', () => {
  assert.equal(validateUsername(' Admin_01 '), 'admin_01');
  assert.throws(() => validateUsername('ab'));
  assert.throws(() => validateUsername('admin;drop'));
});
