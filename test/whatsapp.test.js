import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WhatsAppService, normalizePhone } from '../src/services/whatsapp-service.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(t, options = {}) {
    const clients = [];
    class FakeClient extends EventEmitter {
        async initialize() { if (options.failInitialize) throw new Error('browser failed'); }
        async destroy() { this.destroyed = true; }
        async requestPairingCode(phone) { this.phone = phone; return 'ABCD1234'; }
        async cancelPairingCode() { this.emit('qr', 'new-qr'); }
        async sendMessage(id, text) { this.sent = { id, text }; }
    }
    const service = new WhatsAppService({
        createClient: () => { const client = new FakeClient(); clients.push(client); return client; },
        qrToDataUrl: async qr => `data:${qr}`, ...options
    });
    t.after(() => service.stop());
    return { service, clients };
}

test('normalizes phone numbers and rejects malformed input', () => {
    for (const phone of ['+31 6 12345678', '0612345678', '0031612345678']) assert.equal(normalizePhone(phone), '31612345678');
    for (const phone of [null, 123, 'abc31612345678', '123', '+0123456789']) assert.throws(() => normalizePhone(phone));
});

test('pairing waits for QR readiness, updates codes, and only ready allows sending', async t => {
    const { service, clients } = setup(t);
    await service.start();
    const client = clients[0];
    await assert.rejects(service.requestPairingCode('0612345678'), /not ready/);
    client.emit('qr', 'qr-1');
    await tick();
    assert.equal(service.getStatus().qrUrl, 'data:qr-1');
    assert.equal(await service.requestPairingCode('0612345678'), 'ABCD1234');
    assert.equal(client.phone, '31612345678');
    client.emit('code', 'NEWC0DE1');
    assert.equal(service.getStatus().pairingCode, 'NEWC0DE1');
    client.emit('authenticated');
    assert.equal(service.getStatus().state, 'authenticated');
    assert.equal(service.getStatus().pairingCode, null);
    await assert.rejects(service.sendMessage('0612345678', 'test'), /not ready/);
    client.emit('ready');
    await service.sendMessage('0612345678', 'test');
    assert.deepEqual(client.sent, { id: '31612345678@c.us', text: 'test' });
    assert.equal(service.getStatus().qrUrl, null);
    await assert.rejects(service.requestPairingCode('0612345678'), /already connected/);
});

test('cancel pairing restores QR and concurrent restarts close the previous browser first', async t => {
    const { service, clients } = setup(t);
    await service.start();
    clients[0].emit('qr', 'first');
    await tick();
    await service.requestPairingCode('0612345678');
    await service.cancelPairingCode();
    await tick();
    assert.equal(service.getStatus().state, 'qr');
    let close;
    clients[0].destroy = () => new Promise(resolve => { close = resolve; });
    const first = service.start();
    const second = service.start();
    assert.equal(first, second);
    assert.equal(clients.length, 1);
    close();
    await first;
    assert.equal(clients.length, 2);
    clients[0].emit('ready');
    assert.equal(service.getStatus().connected, false);
});

test('stuck startup and authenticated sessions show an error instead of an endless spinner', async t => {
    const { service, clients } = setup(t, { timeoutMs: 10 });
    await service.start();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(service.getStatus().state, 'error');
    clients[0].emit('authenticated');
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(service.getStatus().state, 'error');
});

test('pair request times out, rejects concurrent requests, and requires recovery', async t => {
    const { service, clients } = setup(t, { pairingTimeoutMs: 10 });
    await service.start();
    clients[0].emit('qr', 'first');
    await tick();
    clients[0].requestPairingCode = () => new Promise(() => {});
    const pending = service.requestPairingCode('0612345678');
    await assert.rejects(service.requestPairingCode('0612345678'), /already in progress/);
    await assert.rejects(pending, /timed out/);
    assert.equal(service.getStatus().state, 'error');
});

test('disconnected clears stale QR/code and initialization failures expose an error', async t => {
    const { service, clients } = setup(t);
    await service.start();
    clients[0].emit('qr', 'qr');
    await tick();
    clients[0].emit('disconnected', 'LOGOUT');
    assert.equal(service.getStatus().state, 'reconnecting');
    assert.equal(service.getStatus().qrUrl, null);
    const failing = setup(t, { failInitialize: true });
    await failing.service.start();
    await tick();
    assert.equal(failing.service.getStatus().state, 'reconnecting');
    assert.match(failing.service.getStatus().error, /browser failed/);
});
