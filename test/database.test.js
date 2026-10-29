import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'birthday-bot-test-'));
process.env.DATA_DIR = dir;
const { default: db, upsertContact, run, get, all } = await import('../src/db/database.js');
const { syncContacts } = await import('../src/services/sync.js');
const sample = { remote_id: 'https://example.invalid/person.vcf', name: 'Test', nickname: 'T', company: 'Company', email: 'test@example.invalid', phone: '+31612345678', birth_day: 29, birth_month: 10, birth_year: 1990 };

test.after(async () => {
    await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
    await fs.rm(dir, { recursive: true, force: true });
});

test('parallel upserts of one remote_id preserve ID, metadata, logs and merge links', async () => {
    const ids = await Promise.all(Array.from({ length: 30 }, () => upsertContact(sample)));
    assert.equal(new Set(ids).size, 1);
    assert.equal((await get('SELECT COUNT(*) AS count FROM contacts')).count, 1);
    const id = ids[0];
    const slave = await upsertContact({ ...sample, remote_id: 'slave' });
    await run('UPDATE contacts SET last_message_year = 2026 WHERE id = ?', [id]);
    await run('INSERT INTO logs(contact_id, status) VALUES (?, ?)', [id, 'success']);
    await run('INSERT INTO manual_merges(master_id, slave_id) VALUES (?, ?)', [id, slave]);
    assert.equal(await upsertContact({ ...sample, name: 'Updated', company: '', email: '', birth_day: null, birth_month: null, birth_year: null }), id);
    const row = await get('SELECT * FROM contacts WHERE id = ?', [id]);
    assert.equal(row.name, 'Updated');
    assert.equal(row.last_message_year, 2026);
    assert.equal(row.company, sample.company);
    assert.equal(row.email, sample.email);
    assert.equal(row.birth_year, sample.birth_year);
    assert.equal((await all('SELECT * FROM logs WHERE contact_id = ?', [id])).length, 1);
    assert.equal((await get('SELECT master_id FROM manual_merges WHERE slave_id = ?', [slave])).master_id, id);
    assert.equal(await upsertContact({ ...sample, birth_year: 1991 }), id);
    assert.equal((await get('SELECT birth_year FROM contacts WHERE id = ?', [id])).birth_year, 1991);
});

test('rejects missing remote identities', async () => {
    for (const remote_id of [null, undefined, '', ' ']) await assert.rejects(upsertContact({ ...sample, remote_id }), /remote_id/);
});

test('concurrent sync requests share one promise and allow a later sync', async () => {
    delete process.env.CARDDAV_URL;
    delete process.env.CARDDAV_USERNAME;
    delete process.env.CARDDAV_PASSWORD;
    const first = syncContacts();
    assert.equal(syncContacts(), first);
    assert.equal((await first).success, false);
    const next = syncContacts();
    assert.notEqual(next, first);
    await next;
});
