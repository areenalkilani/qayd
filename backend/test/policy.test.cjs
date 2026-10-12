const { test } = require('node:test');
const assert = require('node:assert/strict');
const { access, can, requireOffice } = require('../dist/policy');
const { readConfig } = require('../dist/config');
const { registerSchema, parse } = require('../dist/validation');
const { validateFile, LocalPrivateStorage } = require('../dist/storage');
test('pending, rejected and suspended offices cannot use subscriptions', () => {
  for (const status of ['PENDING_APPROVAL', 'REJECTED', 'SUSPENDED', 'MORE_INFO']) assert.equal(access({ status, trial: null, subscriptions: [{ startsAt: new Date(0), expiresAt: new Date('2099-01-01') }] }).active, false);
});
test('trial expires at exact UTC boundary; annual subscription restores access', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  const office = { status: 'APPROVED', trial: { startsAt: new Date('2026-10-03T00:00:00Z'), expiresAt: now }, subscriptions: [] };
  assert.equal(access(office, now).reason, 'EXPIRED');
  assert.equal(access(office, new Date(now.getTime() - 1)).reason, 'TRIAL');
  assert.equal(access({ ...office, subscriptions: [{ startsAt: now, expiresAt: new Date('2027-10-10') }] }, now).reason, 'SUBSCRIBED');
});
test('platform admin never inherits office access; employees require permissions', () => {
  assert.equal(can({ role: 'SUPER_ADMIN', permissions: ['employees.manage'] }, 'employees.manage'), false);
  assert.throws(() => requireOffice({ role: 'SUPER_ADMIN', officeId: 'malicious' }));
  assert.equal(can({ role: 'LAWYER', permissions: [] }, 'finance.read'), false);
  assert.equal(can({ role: 'OWNER', permissions: [] }, 'employees.manage'), true);
});
test('registration rejects tenant injection, weak password, invalid phone and mismatched confirmation', () => {
  const good = { officeName: 'Office', fullName: 'Owner', email: 'OWNER@EXAMPLE.COM', phone: '+970599123456', password: 'LongPassphrase123', confirmPassword: 'LongPassphrase123' };
  assert.equal(parse(registerSchema, good).email, 'owner@example.com');
  for (const patch of [{ officeId: 'other-office' }, { password: 'short' }, { phone: '1234' }, { confirmPassword: 'Different12345' }]) assert.throws(() => parse(registerSchema, { ...good, ...patch }));
});
test('production fails closed without HTTPS or required email provider', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/qayd_test', APP_ORIGIN: 'http://localhost', NODE_ENV: 'production' };
  assert.throws(() => readConfig(env));
  assert.throws(() => readConfig({ ...env, APP_ORIGIN: 'https://qayd.example', REQUIRE_EMAIL_VERIFICATION: 'true' }));
});
test('file validation rejects traversal, false signatures and excessive size', async () => {
  const buffer = Buffer.from('%PDF-1.4\n%%EOF\n');
  const valid = { originalname: 'report.pdf', mimetype: 'application/pdf', buffer, size: buffer.length };
  assert.equal(validateFile(valid).mime, 'application/pdf');
  for (const patch of [{ originalname: '../report.pdf' }, { mimetype: 'image/png' }, { size: 11 * 1024 * 1024 }, { buffer: Buffer.from('not-pdf'), size: 7 }]) assert.throws(() => validateFile({ ...valid, ...patch }));
  const storage = new LocalPrivateStorage(); assert.throws(() => storage.read('../../secret'));
});
