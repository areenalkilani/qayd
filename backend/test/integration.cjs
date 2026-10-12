const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
test('real PostgreSQL identity, trial and tenant workflows', { timeout: 240000 }, async t => {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('/qayd_test')) throw new Error('Use a disposable database named qayd_test');
  process.env.NODE_ENV = 'test';
  process.env.STORAGE_ROOT = path.resolve(__dirname, '../../.local-test/files');
  let apiTarget;
  const web = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const proxy = http.request(new URL(req.url, apiTarget), { method: req.method, headers: req.headers }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
      proxy.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(proxy); return;
    }
    const root = path.resolve(__dirname, '../../dist');
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
  process.env.APP_ORIGIN = `http://127.0.0.1:${web.address().port}`;
  const messages = [];
  const smtp = net.createServer(socket => {
    socket.write('220 localhost ESMTP\r\n'); let buffer = ''; let data = false; let message = '';
    socket.on('data', bytes => {
      buffer += bytes.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'); const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) { if (line === '.') { messages.push(message); message = ''; data = false; socket.write('250 accepted\r\n'); } else message += line + '\n'; }
        else if (/^EHLO|^HELO/.test(line)) socket.write('250 localhost\r\n');
        else if (/^DATA/.test(line)) { data = true; socket.write('354 send data\r\n'); }
        else if (/^QUIT/.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = String(smtp.address().port); process.env.MAIL_FROM = 'test@qayd.example';
  const { createApp } = require('../dist/app'); const { hashPassword } = require('../dist/auth');
  const db = new PrismaClient(); const app = await createApp(); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(); apiTarget = base; const suffix = randomBytes(5).toString('hex'); const password = randomBytes(18).toString('hex');
  const makeEmail = tag => `${tag}-${suffix}@example.test`;
  async function call(path, body, cookie, origin = process.env.APP_ORIGIN) {
    const res = await fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0], headers: res.headers };
  }
  const register = email => ({ officeName: 'مكتب اختبار', fullName: 'مالك الاختبار', email, phone: '+970599123456', password, confirmPassword: password });
  const login = async email => { const r = await call('/auth/login', { email, password }); assert.equal(r.status, 201, JSON.stringify(r.body)); assert.match(r.headers.get('set-cookie'), /HttpOnly/); return r.cookie; };
  const takeToken = kind => {
    const message = messages.at(-1); const split = message.indexOf('\n\n');
    const headers = message.slice(0, split); const body = message.slice(split + 2);
    const raw = /Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8') : body.replace(/=\n/g, '').replace(/=3D/g, '=');
    const match = raw.match(new RegExp(`#${kind}=([a-f0-9]{64})`)); assert.ok(match, `Missing ${kind} link`); return match[1];
  };
  try {
    const admin = await db.user.create({ data: { email: makeEmail('admin'), fullName: 'Platform Admin', phone: '+970599123456', role: 'SUPER_ADMIN', passwordHash: await hashPassword(password) } });
    const adminCookie = await login(admin.email);
    let a, b, cookieA, cookieB;
    await t.test('registration, validation, duplicates, CSRF and role separation', async () => {
      assert.equal((await call('/auth/register', register(makeEmail('a')), undefined, 'https://attacker.example')).status, 403);
      assert.equal((await call('/auth/register', { ...register(makeEmail('a')), officeId: 'injected' })).status, 400);
      assert.equal((await call('/auth/register', register(makeEmail('a')))).status, 201);
      assert.equal((await call('/auth/register', register(makeEmail('b')))).status, 201);
      assert.equal((await call('/auth/register', register(makeEmail('a')))).status, 409);
      a = await db.user.findUniqueOrThrow({ where: { email: makeEmail('a') } }); b = await db.user.findUniqueOrThrow({ where: { email: makeEmail('b') } });
      assert.match(a.passwordHash, /^\$argon2id\$/); assert.equal(a.phoneVerifiedAt, null);
      assert.equal(await db.trial.count({ where: { officeId: a.officeId } }), 0);
      cookieA = await login(a.email); cookieB = await login(b.email);
      assert.equal((await call('/office/employees', undefined, cookieA)).status, 403);
      assert.equal((await call('/platform/offices', undefined, cookieA)).status, 403);
      assert.equal((await call('/notifications', undefined, cookieA)).status, 200);
      assert.equal((await call('/office/employees', undefined, adminCookie)).status, 403);
    });
    await t.test('information request and concurrent approval start exactly one seven-day trial', async () => {
      assert.equal((await call(`/platform/offices/${a.officeId}/review`, { decision: 'MORE_INFO', note: 'معلومات إضافية' }, adminCookie)).status, 201);
      assert.equal((await call('/office/registration-response', { note: 'المعلومات المطلوبة للمراجعة' }, cookieA)).status, 201);
      const approvals = await Promise.all([1, 2].map(() => call(`/platform/offices/${a.officeId}/review`, { decision: 'APPROVE', note: 'approved' }, adminCookie)));
      assert.deepEqual(approvals.map(r => r.status).sort(), [201, 409]);
      const trial = await db.trial.findUniqueOrThrow({ where: { officeId: a.officeId } }); assert.equal(trial.expiresAt - trial.startsAt, 7 * 86400000);
      assert.equal((await call(`/platform/offices/${b.officeId}/review`, { decision: 'APPROVE', note: '' }, adminCookie)).status, 201);
    });
    let employee, employeeCookie;
    await t.test('invitation delivery, single-use activation and cross-tenant ID tampering', async () => {
      const r = await call('/office/employees', { fullName: 'موظف الاختبار', email: makeEmail('employee'), phone: '+970599123456', role: 'LAWYER', permissions: ['audit.read'] }, cookieA);
      assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.emailDelivery, 'SENT'); employee = r.body.user; const token = takeToken('invite');
      assert.equal((await call(`/office/employees/${employee.id}/resend`, {}, cookieB)).status, 404);
      assert.equal((await call('/auth/activate', { token, password })).status, 201);
      assert.equal((await call('/auth/activate', { token, password })).status, 400);
      employeeCookie = await login(employee.email);
      assert.equal((await call('/office/employees', undefined, employeeCookie)).status, 403);
      assert.equal((await call('/office/audit', undefined, employeeCookie)).status, 200);
      assert.equal((await call(`/office/employees/${employee.id}`, { role: 'LAWYER', status: 'DISABLED', permissions: [] }, cookieB)).status, 404);
      const listB = await call('/office/employees', undefined, cookieB); assert.equal(listB.body.items.some(u => u.id === employee.id), false);
      const auditB = await call('/office/audit', undefined, cookieB); assert.ok(auditB.body.items.every(x => x.officeId === b.officeId));
    });
    await t.test('trial expiry, annual restoration and no platform access to employee data', async () => {
      const expiredAt = new Date(Date.now() - 1000);
      await db.trial.update({ where: { officeId: a.officeId }, data: { startsAt: new Date(expiredAt.getTime() - 7 * 86400000), expiresAt: expiredAt } });
      assert.equal((await call('/office/employees', undefined, cookieA)).status, 403);
      assert.equal((await call('/auth/me', undefined, cookieA)).body.access.reason, 'EXPIRED');
      assert.equal((await call(`/platform/offices/${a.officeId}/subscriptions`, { reference: 'approval-1', amount: '1200.00', currency: 'ILS', method: 'CASH', cardLast4: '', paidAt: new Date().toISOString() }, adminCookie)).status, 201);
      assert.equal((await call(`/platform/offices/${a.officeId}/subscriptions`, { reference: 'approval-1', amount: '1200.00', currency: 'ILS', method: 'CASH', cardLast4: '', paidAt: new Date().toISOString() }, adminCookie)).status, 409);
      assert.equal((await call('/office/employees', undefined, cookieA)).status, 200);
      const metadata = await call('/platform/offices', undefined, adminCookie); assert.ok(!JSON.stringify(metadata.body).includes('passwordHash')); assert.ok(!JSON.stringify(metadata.body).includes(employee.email));
      const audit = await call('/platform/audit', undefined, adminCookie); assert.ok(!audit.body.items.some(x => x.action === 'EMPLOYEE_INVITED'));
    });
    await require('./legal-workflows.cjs')(t, { base, call, db, a, b, cookieA, cookieB, adminCookie, employee });
    await require('./case-form-workflows.cjs')(t, { call, db, a, b, cookieA, cookieB, adminCookie });
    await require('./notifications-workflows.cjs')(t, { call, db, a, b, cookieA, cookieB, adminCookie, employeeCookie });
    await require('./platform-workflows.cjs')(t, { call, db, adminCookie, cookieA, a, password, makeEmail, register, login });
    await t.test('phone changes, email verification, password recovery and disabling revoke sessions', async () => {
      assert.equal((await call('/auth/profile', { fullName: 'مالك محدث', phone: '+970599987654' }, cookieA)).body.user.phoneVerifiedAt, null);
      assert.equal((await call('/auth/verification-email', {}, cookieA)).status, 201); const token = takeToken('verify');
      assert.equal((await call('/auth/verify-email', { token })).status, 201); assert.equal((await call('/auth/verify-email', { token })).status, 400);
      assert.equal((await call('/auth/forgot-password', { email: employee.email })).status, 201); const resetToken = takeToken('reset');
      assert.equal((await call('/auth/reset-password', { token: resetToken, password })).status, 201);
      assert.equal((await call('/auth/me', undefined, employeeCookie)).status, 401);
      assert.equal((await call('/auth/reset-password', { token: resetToken, password })).status, 400);
      const active = await login(employee.email);
      assert.equal((await call(`/office/employees/${employee.id}`, { role: 'LAWYER', status: 'DISABLED', permissions: [] }, cookieA)).status, 201);
      assert.equal((await call('/auth/me', undefined, active)).status, 401);
    });
    await t.test('browser registration, pending status, approval, employee invitation, profile and mobile navigation', { skip: process.env.QAYD_BROWSER_TEST !== 'true' }, async () => {
      const { chromium } = require('playwright-core');
      const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const screenshotDir = path.resolve(__dirname, '../../.local-test/screenshots'); fs.mkdirSync(screenshotDir, { recursive: true });
      try {
        await page.goto(process.env.APP_ORIGIN); await page.getByRole('button', { name: 'جرّب مجانًا', exact: true }).click();
        await page.getByLabel('اسم مكتب المحاماة', { exact: true }).fill('مكتب اختبار المتصفح');
        await page.getByLabel('اسم المالك الكامل', { exact: true }).fill('مالك المتصفح');
        await page.getByLabel('رقم الهاتف', { exact: true }).fill('+970599123456');
        await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(makeEmail('browser'));
        await page.getByLabel('كلمة المرور (12 حرفًا على الأقل)', { exact: true }).fill(password);
        await page.getByLabel('تأكيد كلمة المرور', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'إرسال طلب التسجيل', exact: true }).click();
        await page.getByText('تم تسجيل طلب المكتب وبانتظار مراجعة الإدارة.', { exact: false }).waitFor();
        await page.getByRole('button', { name: 'تسجيل الدخول ومتابعة الطلب' }).click();
        await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(makeEmail('browser'));
        await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
        await page.getByRole('dialog').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
        await page.getByRole('heading', { name: 'حالة طلب المكتب' }).waitFor();
        const owner = await db.user.findUniqueOrThrow({ where: { email: makeEmail('browser') } });
        assert.equal(await db.trial.count({ where: { officeId: owner.officeId } }), 0);
        assert.equal((await call(`/platform/offices/${owner.officeId}/review`, { decision: 'APPROVE', note: 'browser QA' }, adminCookie)).status, 201);
        await page.getByRole('button', { name: 'تحديث الحالة' }).click();
        await page.getByRole('heading', { name: 'مرحبًا، مالك المتصفح' }).waitFor();
        assert.ok(!(await page.locator('.trial-banner').innerText()).includes('متبقي 8 يوم'));
        await page.getByRole('button', { name: 'الإشعارات', exact: true }).click();
        await page.getByRole('dialog').getByRole('heading', { name: 'التجربة مفعّلة', exact: true }).waitFor();
        await page.getByRole('dialog').getByRole('button', { name: 'تحديد كمقروء', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
        await page.screenshot({ path: path.join(screenshotDir, 'office-desktop.png'), fullPage: true });
        await page.locator('.sidebar').getByRole('button', { name: 'الموظفون', exact: true }).click();
        await page.getByRole('button', { name: 'إضافة موظف', exact: true }).click();
        await page.getByLabel('الاسم الكامل', { exact: true }).fill('موظف المتصفح');
        await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(makeEmail('browser-employee'));
        await page.getByLabel('رقم الهاتف', { exact: true }).fill('+970599123456');
        await page.getByRole('button', { name: 'إنشاء وإرسال دعوة' }).click();
        await page.getByRole('cell', { name: makeEmail('browser-employee'), exact: false }).waitFor();
        const employee = await db.user.findUniqueOrThrow({ where: { email: makeEmail('browser-employee') } }); assert.equal(employee.officeId, owner.officeId);
        await page.locator('.sidebar').getByRole('button', { name: 'العملاء والموكلون', exact: true }).click();
        await page.getByRole('button', { name: 'إضافة موكل', exact: true }).click();
        await page.getByRole('dialog').getByLabel('الاسم', { exact: true }).fill('موكل المتصفح');
        await page.getByRole('dialog').getByLabel('الهاتف بالصيغة الدولية', { exact: true }).fill('+970599111222');
        await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByRole('cell', { name: 'موكل المتصفح', exact: true }).waitFor();
        await page.locator('.sidebar').getByRole('button', { name: 'المحاكم', exact: true }).click();
        await page.getByRole('button', { name: 'إضافة محكمة', exact: true }).click();
        await page.getByRole('dialog').getByLabel('الاسم', { exact: true }).fill('محكمة المتصفح');
        await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByRole('cell', { name: 'محكمة المتصفح', exact: true }).waitFor();
        await page.locator('.sidebar').getByRole('button', { name: 'القضايا والملفات', exact: true }).click();
        await page.getByRole('button', { name: 'إضافة قضية', exact: true }).click();
        assert.equal(await page.getByRole('dialog').locator('input[placeholder="بحث في سجلات المكتب"]').count(), 0);
        await page.getByLabel('اسم المُوكِّل', { exact: true }).fill('موكل من القضية');
        await page.getByLabel('رقم الملف الداخلي', { exact: true }).fill('BROWSER-NEW');
        await page.getByLabel('رقم القضية الرسمي', { exact: true }).fill('2026/NEW');
        await page.getByLabel('نوع القضية', { exact: true }).fill('مدنية');
        await page.getByLabel('تاريخ استلام القضية', { exact: true }).fill('2026-10-10');
        await page.getByLabel('المحكمة', { exact: true }).selectOption({ label: 'محكمة المتصفح' });
        await page.getByLabel('المحامي المسؤول', { exact: true }).selectOption({ label: 'مالك المتصفح' });
        await page.screenshot({ path: path.join(screenshotDir, 'new-case-form.png'), fullPage: true });
        await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByRole('cell', { name: 'BROWSER-NEW', exact: false }).waitFor();
        await page.getByRole('button', { name: 'إضافة قضية', exact: true }).click();
        await page.getByLabel('رقم الملف الداخلي', { exact: true }).fill('BROWSER-001');
        await page.getByLabel('رقم القضية الرسمي', { exact: true }).fill('2026/001');
        await page.getByLabel('نوع القضية', { exact: true }).fill('مدنية');
        await page.getByLabel('تاريخ استلام القضية', { exact: true }).fill('2026-10-10');
        await page.getByLabel('المُوكِّل لديه سجل سابق', { exact: true }).check();
        await page.getByLabel('المُوكِّل', { exact: true }).selectOption({ label: 'موكل من القضية' });
        await page.getByLabel('المحكمة', { exact: true }).selectOption({ label: 'محكمة المتصفح' });
        await page.getByLabel('المحامي المسؤول', { exact: true }).selectOption({ label: 'مالك المتصفح' });
        await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByRole('cell', { name: 'BROWSER-001', exact: false }).waitFor();
        const inline = await db.client.findFirstOrThrow({ where: { officeId: owner.officeId, name: 'موكل من القضية' } });
        assert.equal(await db.legalCase.count({ where: { clientId: inline.id } }), 2);
        await page.getByRole('row').filter({ hasText: 'BROWSER-001' }).getByRole('button', { name: 'عرض الملف', exact: true }).click();
        await page.getByRole('button', { name: 'إضافة جلسة', exact: true }).click();
        await page.getByLabel('موعد الجلسة (التوقيت المحلي)', { exact: true }).fill('2026-10-09T10:00');
        await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByRole('button', { name: 'تأجيل — لم تنعقد', exact: true }).click();
        await page.getByLabel('سبب التأجيل', { exact: true }).fill('تأجيل اختبار المتصفح');
        await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByText('مؤجلة — لم تنعقد', { exact: false }).waitFor();
        const savedCase = await db.legalCase.findFirstOrThrow({ where: { officeId: owner.officeId, internalNumber: 'BROWSER-001' }, include: { hearings: { include: { reschedules: true } } } });
        assert.equal(savedCase.hearings[0].status, 'POSTPONED'); assert.equal(savedCase.hearings[0].reschedules.length, 1);
        await page.getByLabel('ملف القضية', { exact: true }).setInputFiles({ name: 'browser-proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n') });
        await page.getByRole('button', { name: 'رفع الملف', exact: true }).click();
        await page.getByRole('cell', { name: 'browser-proof.pdf', exact: true }).waitFor();
        const downloaded = page.waitForEvent('download'); await page.getByRole('link', { name: 'تنزيل الملف', exact: true }).click();
        assert.equal((await downloaded).suggestedFilename(), 'browser-proof.pdf');
        assert.equal(await db.caseAttachment.count({ where: { officeId: owner.officeId, caseId: savedCase.id } }), 1);
        await page.screenshot({ path: path.join(screenshotDir, 'case-detail.png'), fullPage: true });
        await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.live-mobile-nav select').selectOption('settings');
        await page.getByLabel('الاسم الكامل', { exact: true }).fill('مالك تم تحديثه');
        await page.getByRole('button', { name: 'حفظ', exact: true }).click();
        await page.getByText('تم حفظ الإجراء بنجاح.', { exact: true }).waitFor();
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).fullName, 'مالك تم تحديثه');
        await page.screenshot({ path: path.join(screenshotDir, 'settings-mobile.png'), fullPage: true });
        assert.deepEqual(errors, []);
      } catch (error) { await page.screenshot({ path: path.join(screenshotDir, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
      finally { await browser.close(); }
    });
    await t.test('platform management desktop and mobile browser workflow', { skip: process.env.QAYD_BROWSER_TEST !== 'true' }, async () => { await require('./platform-browser.cjs')({ call, register, makeEmail, admin, password, db }); });
    await t.test('suspension, logout and session expiry', async () => {
      assert.equal((await call(`/platform/offices/${b.officeId}/status`, { suspended: true, reason: 'Test suspension' }, adminCookie)).status, 201);
      assert.equal((await call('/office/employees', undefined, cookieB)).status, 403);
      assert.equal((await call('/auth/logout', {}, cookieA)).status, 201); assert.equal((await call('/auth/me', undefined, cookieA)).status, 401);
      await db.session.updateMany({ where: { userId: admin.id }, data: { expiresAt: new Date(0) } });
      assert.equal((await call('/platform/offices', undefined, adminCookie)).status, 401);
      assert.equal((await call('/health/ready')).status, 200);
    });
  } finally { await app.close(); await db.$disconnect(); await new Promise(resolve => smtp.close(resolve)); await new Promise(resolve => web.close(resolve)); }
});
