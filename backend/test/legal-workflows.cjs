const assert = require('node:assert/strict');
module.exports = async function legalWorkflows(t, { base, call, db, a, b, cookieA, cookieB, adminCookie, employee }) {
  let client, court, caseItem, otherClient, otherCourt, hearing;
  await t.test('clients and courts persist, duplicate court normalization and tenant filtering', async () => {
    client = (await call('/legal/clients', { name: 'موكل القضية', phone: '+970599234567', address: 'رام الله', notes: 'اختبار' }, cookieA)).body;
    otherClient = (await call('/legal/clients', { name: 'موكل المكتب الثاني', phone: '+970599234568' }, cookieB)).body;
    court = (await call('/legal/courts', { name: 'محكمة اختبار', address: 'رام الله' }, cookieA)).body;
    otherCourt = (await call('/legal/courts', { name: 'محكمة اختبار' }, cookieB)).body;
    assert.ok(client.id); assert.ok(court.id); assert.ok(otherCourt.id);
    assert.equal((await call('/legal/courts', { name: ' محكمة   اختبار ' }, cookieA)).status, 409);
    assert.equal((await call(`/legal/clients/${client.id}`, { name: 'اختراق', phone: '+970599234568' }, cookieB)).status, 404);
    const list = await call('/legal/clients?search=' + encodeURIComponent('موكل'), undefined, cookieB); assert.ok(list.body.items.every(c => c.officeId === b.officeId));
    assert.equal((await call('/legal/clients', undefined, adminCookie)).status, 403);
  });
  await t.test('case creation selects existing client; API and composite database FKs reject foreign-office links', async () => {
    const input = { internalNumber: 'TEST-001', courtNumber: 'COURT-001', type: 'مدنية', clientId: client.id, courtId: court.id, lawyerId: a.id, receivedAt: new Date().toISOString() };
    assert.equal((await call('/legal/cases', { ...input, clientId: otherClient.id }, cookieA)).status, 400);
    assert.equal((await call('/legal/cases', { ...input, courtId: otherCourt.id }, cookieA)).status, 400);
    assert.equal((await call('/legal/cases', { ...input, lawyerId: b.id }, cookieA)).status, 400);
    const result = await call('/legal/cases', input, cookieA); assert.equal(result.status, 201, JSON.stringify(result.body)); caseItem = result.body;
    assert.equal((await call('/legal/cases', input, cookieA)).status, 409);
    assert.equal((await call(`/legal/cases/${caseItem.id}`, undefined, cookieB)).status, 404);
    await assert.rejects(db.legalCase.create({ data: { ...input, receivedAt: new Date(), internalNumber: 'CROSS-TENANT-FK', officeId: a.officeId, clientId: otherClient.id, creatorId: a.id } }));
    assert.equal((await call(`/legal/clients/${client.id}/archive`, { archived: true }, cookieA)).status, 201);
    assert.equal((await call('/legal/cases', { ...input, internalNumber: 'ARCHIVED-CLIENT' }, cookieA)).status, 400);
    assert.equal((await call(`/legal/clients/${client.id}/archive`, { archived: false }, cookieA)).status, 201);
  });
  await t.test('reassignment records previous/new lawyer, actor and reason; stale version cannot overwrite', async () => {
    assert.equal((await call(`/legal/cases/${caseItem.id}/assign`, { lawyerId: employee.id, reason: 'تكليف محامي جديد', version: 1 }, cookieA)).status, 201);
    assert.equal((await call(`/legal/cases/${caseItem.id}/assign`, { lawyerId: a.id, reason: 'تغيير متزامن', version: 1 }, cookieA)).status, 409);
    const details = (await call(`/legal/cases/${caseItem.id}`, undefined, cookieA)).body;
    assert.equal(details.lawyerId, employee.id); assert.equal(details.assignments[0].previousLawyerId, a.id); assert.equal(details.assignments[0].newLawyerId, employee.id); assert.equal(details.assignments[0].actorId, a.id);
  });
  await t.test('postponement preserves history and never increments completed hearings; overlap warnings are nonblocking', async () => {
    const when = new Date(Date.now() - 2 * 86400000).toISOString();
    const input = { caseId: caseItem.id, courtId: court.id, lawyerId: employee.id, scheduledAt: when };
    const result = await call('/legal/hearings', input, cookieA); assert.equal(result.status, 201); hearing = result.body.item;
    const overlap = await call('/legal/hearings', input, cookieA); assert.equal(overlap.status, 201); assert.ok(overlap.body.conflicts.length > 0);
    assert.equal((await call(`/legal/hearings/${hearing.id}/postpone`, { nextAt: null, reason: 'لم تنعقد الجلسة', version: 1 }, cookieB)).status, 404);
    assert.equal((await call(`/legal/hearings/${hearing.id}/postpone`, { nextAt: null, reason: 'لم تنعقد الجلسة', version: 1 }, cookieA)).status, 201);
    const pending = await db.hearing.findUniqueOrThrow({ where: { id: hearing.id }, include: { reschedules: true } });
    assert.equal(pending.status, 'POSTPONED'); assert.equal(pending.scheduledAt, null); assert.equal(pending.reschedules[0].previousAt.toISOString(), when);
    const dash = await call('/legal/dashboard', undefined, cookieA); assert.equal(dash.body.completedHearings, 0); assert.equal(dash.body.postponedHearings, 1);
    const newDate = new Date(Date.now() - 86400000).toISOString();
    assert.equal((await call(`/legal/hearings/${hearing.id}/postpone`, { nextAt: newDate, reason: 'تحديد موعد بديل', version: 2 }, cookieA)).status, 201);
    assert.equal((await call(`/legal/hearings/${hearing.id}/complete`, { status: 'HELD_ACTIVE', outcome: 'استمعت المحكمة للأطراف', version: 3 }, cookieA)).status, 201);
    assert.equal((await call(`/legal/hearings/${hearing.id}/postpone`, { nextAt: null, reason: 'تعديل غير مسموح', version: 4 }, cookieA)).status, 409);
  });
  await t.test('deadlines are independent, completion audited, archive preserves records and reopen works', async () => {
    const result = await call('/legal/procedures', { caseId: caseItem.id, title: 'إيداع مذكرة', assignedId: employee.id, dueAt: new Date(Date.now() - 1000).toISOString() }, cookieA);
    assert.equal(result.status, 201); const procedure = result.body;
    assert.equal((await call('/legal/dashboard', undefined, cookieA)).body.overdueProcedures, 1);
    assert.equal((await call(`/legal/procedures/${procedure.id}/status`, { status: 'DONE', version: 1 }, cookieB)).status, 404);
    assert.equal((await call(`/legal/procedures/${procedure.id}/status`, { status: 'DONE', version: 1 }, cookieA)).status, 201);
    assert.ok((await db.legalProcedure.findUniqueOrThrow({ where: { id: procedure.id } })).completedAt);
    assert.equal((await call(`/legal/cases/${caseItem.id}/status`, { status: 'ARCHIVED', reason: 'أرشفة اختبار', version: 2 }, cookieA)).status, 201);
    const archived = (await call(`/legal/cases/${caseItem.id}`, undefined, cookieA)).body; assert.equal(archived.hearings.length, 2); assert.equal(archived.procedures.length, 1);
    assert.equal((await call(`/legal/cases/${caseItem.id}/status`, { status: 'ACTIVE', reason: 'إعادة فتح اختبار', version: 3 }, cookieA)).status, 201);
    const second = archived.hearings.find(h => h.id !== hearing.id);
    assert.equal((await call(`/legal/hearings/${second.id}/complete`, { status: 'HELD_COMPLETED', outcome: 'صدر الحكم وانتهت القضية', version: 1 }, cookieA)).status, 201);
    assert.equal((await db.legalCase.findUniqueOrThrow({ where: { id: caseItem.id } })).status, 'CLOSED');
    assert.equal((await call('/legal/dashboard', undefined, cookieA)).body.completedHearings, 2);
    assert.equal((await call('/legal/dashboard', undefined, cookieB)).body.activeCases, 0);
  });
  await require('./files-workflows.cjs')(t, { base, call, db, a, cookieA, cookieB, adminCookie, caseItem });
};
