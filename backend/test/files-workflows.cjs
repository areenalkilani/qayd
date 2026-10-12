const assert = require('node:assert/strict');
const { unzipSync } = require('fflate');
module.exports = async function fileWorkflows(t, { base, call, db, a, cookieA, cookieB, adminCookie, caseItem }) {
  const bytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  let file;
  async function upload(cookie, name, data, type = 'application/pdf') {
    const body = new FormData(); body.append('file', new Blob([data], { type }), name);
    const r = await fetch(`${base}/api/files/cases/${caseItem.id}`, { method: 'POST', body, headers: { Cookie: cookie, Origin: process.env.APP_ORIGIN } });
    return { status: r.status, body: await r.json() };
  }
  await t.test('private uploads reject forged types, enforce office scope and hide storage keys', async () => {
    assert.equal((await upload(cookieA, 'fake.pdf', Buffer.from('<script>alert(1)</script>'))).status, 400);
    assert.equal((await upload(cookieA, 'file.exe', bytes)).status, 400);
    assert.equal((await upload(cookieB, 'report.pdf', bytes)).status, 404);
    const result = await upload(cookieA, 'تقرير.pdf', bytes); assert.equal(result.status, 201, JSON.stringify(result.body)); file = result.body; assert.equal(file.originalName, 'تقرير.pdf');
    const record = await db.caseAttachment.findUniqueOrThrow({ where: { id: file.id } }); assert.equal(record.officeId, a.officeId); assert.equal(record.size, bytes.length); assert.ok(!record.storageKey.includes('تقرير'));
    const list = await call(`/files?caseId=${caseItem.id}`, undefined, cookieA); assert.equal(list.body.total, 1); assert.ok(!JSON.stringify(list.body).includes('storageKey'));
    const other = await call(`/files?caseId=${caseItem.id}`, undefined, cookieB); assert.equal(other.body.total, 0);
  });
  await t.test('authenticated file and ZIP download retain exact content and block cross-tenant/platform access', async () => {
    const url = `${base}/api/files/${file.id}/download`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Cookie: cookieB } })).status, 404);
    assert.equal((await fetch(url, { headers: { Cookie: adminCookie } })).status, 403);
    const download = await fetch(url, { headers: { Cookie: cookieA } }); assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const zip = await fetch(`${base}/api/files/cases/${caseItem.id}/archive`, { headers: { Cookie: cookieA } }); assert.equal(zip.status, 200);
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer())); assert.equal(Object.keys(files).length, 1); assert.deepEqual(Buffer.from(Object.values(files)[0]), bytes);
    assert.equal((await fetch(`${base}/api/files/cases/${caseItem.id}/archive`, { headers: { Cookie: cookieB } })).status, 404);
    assert.ok(await db.audit.count({ where: { officeId: a.officeId, targetId: caseItem.id, action: 'DOCUMENT_DOWNLOADED' } }));
  });
};
