import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'birthday-bot-http-'));
process.env.DATA_DIR = dir;
const { startServer } = await import('../src/server.js');
const { default: db } = await import('../src/db/database.js');
const server = startServer(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
});

test('settings exposes QR and code controls before WhatsApp has initialized', async () => {
    const response = await fetch(`${base}/settings`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Koppelcode aanvragen/);
    assert.match(html, /id="waPairPhone"/);
    assert.match(html, /id="waQrImage"/);
    assert.match(html, /whatsapp-settings.js/);
    const legacy = await fetch(`${base}/qr`, { redirect: 'manual' });
    assert.equal(legacy.status, 302);
    assert.equal(legacy.headers.get('location'), '/settings#whatsapp');
});

test('status distinguishes startup from ready and pairing rejects bad or premature requests', async () => {
    const status = await (await fetch(`${base}/api/whatsapp/status`)).json();
    assert.equal(status.state, 'starting');
    assert.equal(status.connected, false);
    for (const phone of [null, 123]) {
        const response = await fetch(`${base}/api/whatsapp/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
        assert.equal(response.status, 400);
    }
    const response = await fetch(`${base}/api/whatsapp/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+31612345678' }) });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /not ready/);
    const manualSend = await (await fetch(`${base}/api/send-today`, { method: 'POST' })).json();
    assert.equal(manualSend.success, false);
    assert.equal(manualSend.count, 0);
});
