import test from 'node:test';
import assert from 'node:assert/strict';
import { BirthdayQueue } from '../src/services/birthday-queue.js';
function setup(options = {}) {
    const timers = [];
    const sent = [];
    let online = false;
    let date = new Date(2026, 9, 29, 10);
    const queue = new BirthdayQueue({
        isConnected: () => online,
        send: async (...args) => { sent.push(args); },
        isEligible: async () => true,
        now: () => date,
        setTimer: (callback, delay) => { timers.push({ callback, delay }); },
        ...options
    });
    return { queue, timers, sent, online: value => { online = value; }, date: value => { date = value; } };
}

test('offline birthday waits, duplicate scheduling is ignored, and sends once after ready', async () => {
    const x = setup();
    assert.equal(x.queue.schedule({ id: 1 }, 'hello', 2026, 0), true);
    assert.equal(x.queue.schedule({ id: 1 }, 'hello', 2026, 0), false);
    await x.timers.shift().callback();
    assert.equal(x.sent.length, 0);
    assert.equal(x.timers[0].delay, 30000);
    x.online(true);
    await x.timers.shift().callback();
    assert.equal(x.sent.length, 1);
    assert.equal(x.queue.pending.size, 0);
});

test('queued birthday expires at midnight', async () => {
    const x = setup();
    x.queue.schedule({ id: 1 }, 'hello', 2026, 0);
    await x.timers.shift().callback();
    x.date(new Date(2026, 9, 30, 0, 1));
    x.online(true);
    await x.timers.shift().callback();
    assert.equal(x.sent.length, 0);
    assert.equal(x.queue.pending.size, 0);
});

test('rechecks persisted history, current birthday and settings before sending', async () => {
    const x = setup({ isEligible: async () => false });
    x.online(true);
    x.queue.schedule({ id: 1 }, 'hello', 2026, 0);
    await x.timers.shift().callback();
    assert.equal(x.sent.length, 0);
    assert.equal(x.queue.pending.size, 0);
});

test('a disconnect immediately before send defers without recording a delivery failure', async () => {
    let attempts = 0;
    const x = setup({ send: async () => {
        attempts++;
        if (attempts === 1) throw Object.assign(new Error('not ready'), { code: 'WHATSAPP_NOT_READY' });
    } });
    x.online(true);
    x.queue.schedule({ id: 1 }, 'hello', 2026, 0);
    await x.timers.shift().callback();
    assert.equal(x.queue.pending.size, 1);
    assert.equal(x.timers[0].delay, 30000);
    await x.timers.shift().callback();
    assert.equal(attempts, 2);
    assert.equal(x.queue.pending.size, 0);
});

test('send now advances an existing scheduled task without leaving a duplicate timer', async () => {
    const x = setup();
    x.online(true);
    x.queue.schedule({ id: 1 }, 'scheduled', 2026, 60000);
    assert.equal(x.queue.schedule({ id: 1 }, 'forced', 2026, 0, true), true);
    await x.timers.shift().callback(); // A cancelled callback is harmless even if already queued.
    assert.equal(x.sent.length, 0);
    await x.timers.shift().callback();
    assert.equal(x.sent.length, 1);
    assert.equal(x.sent[0][1], 'forced');
});
