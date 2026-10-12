const assert = require('node:assert/strict');
module.exports = async (t, { call, db, a, b, cookieA, cookieB, adminCookie, employeeCookie }) => {
  await t.test('notifications stay available during trials, expiry and suspension; reads are private and persistent', async () => {
    assert.equal((await call('/notifications')).status, 401);
    const initial = await call('/notifications', undefined, cookieB);
    assert.equal(initial.status, 200);
    assert.ok(initial.body.items.some(i => i.title === 'التجربة مفعّلة'));
    const key = initial.body.items.find(i => i.key.startsWith('event:')).key;
    assert.equal((await call('/notifications/read', { key }, cookieA)).status, 404);
    assert.equal((await call('/notifications/read', { key }, cookieB)).status, 201);
    assert.ok((await call('/notifications', undefined, cookieB)).body.items.find(i => i.key === key).read);
    const trial = await db.trial.findUniqueOrThrow({ where: { officeId: b.officeId } });
    const end = new Date(Date.now() - 1000);
    await db.trial.update({ where: { officeId: b.officeId }, data: { startsAt: new Date(end.getTime() - 604800000), expiresAt: end } });
    assert.equal((await call('/legal/cases', undefined, cookieB)).status, 403);
    const expired = await call('/notifications', undefined, cookieB);
    assert.equal(expired.status, 200); assert.ok(expired.body.items.some(i => i.key.includes(':EXPIRED:')));
    assert.equal((await call(`/platform/offices/${b.officeId}/status`, { suspended: true, reason: 'notification test' }, adminCookie)).status, 201);
    const paused = await call('/notifications', undefined, cookieB);
    assert.equal(paused.status, 200); assert.ok(paused.body.items.some(i => i.key.includes(':SUSPENDED:')));
    await db.trial.update({ where: { officeId: b.officeId }, data: { startsAt: trial.startsAt, expiresAt: trial.expiresAt } });
    assert.equal((await call(`/platform/offices/${b.officeId}/status`, { suspended: false, reason: 'notification test complete' }, adminCookie)).status, 201);
  });
  await t.test('legal notifications respect tenant and user permissions; platform never receives case data', async () => {
    const c = await db.legalCase.findFirstOrThrow({ where: { officeId: a.officeId, internalNumber: 'INLINE-CLIENT-001' } });
    const hearing = await db.hearing.create({ data: { officeId: a.officeId, caseId: c.id, courtId: c.courtId, lawyerId: a.id, scheduledAt: new Date(Date.now() + 3600000) } });
    const legalKey = `hearing:${hearing.id}:`;
    assert.ok((await call('/notifications', undefined, cookieA)).body.items.some(i => i.key.startsWith(legalKey)));
    for (const cookie of [cookieB, employeeCookie, adminCookie]) {
      const response = await call('/notifications', undefined, cookie);
      assert.equal(response.status, 200); assert.ok(!response.body.items.some(i => i.key.startsWith(legalKey)));
    }
    const old = process.env.REQUIRE_EMAIL_VERIFICATION; process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    try { assert.ok(!(await call('/notifications', undefined, cookieA)).body.items.some(i => i.key.startsWith(legalKey))); }
    finally { if (old === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION; else process.env.REQUIRE_EMAIL_VERIFICATION = old; }
  });
};
