const assert = require('node:assert/strict');
module.exports = async (t, { call, db, a, b, cookieA, cookieB, adminCookie }) => {
  await t.test('case dropdowns include all active office options and exclude foreign records', async () => {
    const clients = Array.from({ length: 24 }, (_, i) => ({ officeId: a.officeId, name: `Options client ${i}`, phone: '' }));
    await db.client.createMany({ data: clients });
    const all = await call('/legal/options/clients', undefined, cookieA);
    assert.equal(all.status, 200); assert.ok(all.body.length >= 24);
    const foreign = await db.client.findMany({ where: { officeId: b.officeId }, select: { id: true } });
    assert.ok(all.body.every(c => !foreign.some(x => x.id === c.id)));
    assert.ok(all.body.every(c => Object.keys(c).every(k => ['id','name','phone'].includes(k))));
    const archived = await db.client.create({ data: { officeId: a.officeId, name: 'Archived option', phone: '', archivedAt: new Date() } });
    assert.ok(!(await call('/legal/options/clients', undefined, cookieA)).body.some(c => c.id === archived.id));
    assert.equal((await call('/legal/options/clients', undefined, adminCookie)).status, 403);
    assert.equal((await call('/legal/options/unknown', undefined, cookieA)).status, 404);
  });
  await t.test('new client and case save atomically; existing client links further cases without duplication', async () => {
    const court = await db.court.findFirstOrThrow({ where: { officeId: a.officeId, active: true } });
    const otherCourt = await db.court.findFirstOrThrow({ where: { officeId: b.officeId } });
    const input = { internalNumber: 'INLINE-CLIENT-001', courtNumber: 'INLINE-1', courtId: court.id, type: 'Civil', receivedAt: new Date().toISOString(), newClient: { name: 'Inline client' }, lawyerId: a.id };
    const result = await call('/legal/cases', input, cookieA);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const clientId = result.body.clientId;
    assert.equal((await db.client.findUniqueOrThrow({ where: { id: clientId } })).officeId, a.officeId);
    assert.equal((await call('/legal/cases', { ...input, newClient: { name: 'Should roll back' } }, cookieA)).status, 409);
    assert.equal(await db.client.count({ where: { officeId: a.officeId, name: 'Should roll back' } }), 0);
    assert.equal((await call('/legal/cases', { ...input, internalNumber: 'FOREIGN-COURT', courtId: otherCourt.id, newClient: { name: 'Foreign rollback' } }, cookieA)).status, 400);
    assert.equal(await db.client.count({ where: { officeId: a.officeId, name: 'Foreign rollback' } }), 0);
    assert.equal((await call('/legal/cases', { ...input, internalNumber: 'INVALID', clientId }, cookieA)).status, 400);
    const { newClient, ...existingInput } = input;
    assert.equal((await call('/legal/cases', { ...existingInput, internalNumber: 'INLINE-CLIENT-002', clientId }, cookieA)).status, 201);
    const linked = await call(`/legal/cases?clientId=${clientId}`, undefined, cookieA);
    assert.equal(linked.body.total, 2);
    assert.equal(await db.client.count({ where: { officeId: a.officeId, name: newClient.name } }), 1);
    assert.equal((await call(`/legal/cases?clientId=${clientId}`, undefined, cookieB)).body.total, 0);
  });
};
