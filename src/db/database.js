import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

let dbReadyResolve;
const dbReady = new Promise(resolve => dbReadyResolve = resolve);

db.serialize(() => {
    // Contacts table
    db.run(`CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT UNIQUE,
        name TEXT NOT NULL,
        nickname TEXT,
        phone TEXT UNIQUE NOT NULL,
        birth_day INTEGER,
        birth_month INTEGER,
        birth_year INTEGER,
        last_message_year INTEGER
    )`);

    // Message Logs table
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER,
        phone TEXT,
        name TEXT,
        message TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT,
        FOREIGN KEY (contact_id) REFERENCES contacts (id)
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`, () => {
        // Resolve the promise once the last table is definitively created
        dbReadyResolve();
    });
});

// Wrapper for queries (Waits for tables to be created first!)
const run = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

const get = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

const all = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

export const getSetting = async (key, defaultValue = null) => {
    const row = await get(`SELECT value FROM settings WHERE key = ?`, [key]);
    return row ? row.value : defaultValue;
};

export const setSetting = async (key, value) => {
    await run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
};

export const getAllSettings = async () => {
    const rows = await all(`SELECT * FROM settings`);
    const dict = {};
    for (const r of rows) dict[r.key] = r.value;
    return dict;
};

export const upsertContact = async (contact) => {
    const existing = await get(`SELECT id, birth_day, birth_month, birth_year FROM contacts WHERE phone = ?`, [contact.phone]);
    
    if (existing) {
        const bDay = contact.birth_day || existing.birth_day;
        const bMonth = contact.birth_month || existing.birth_month;
        const bYear = contact.birth_year || existing.birth_year;
        
        await run(
            `UPDATE contacts SET remote_id = ?, name = ?, nickname = ?, birth_day = ?, birth_month = ?, birth_year = ? WHERE phone = ?`,
            [contact.remote_id, contact.name, contact.nickname, bDay, bMonth, bYear, contact.phone]
        );
        return existing.id;
    } else {
        const res = await run(
            `INSERT INTO contacts (remote_id, name, nickname, phone, birth_day, birth_month, birth_year) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [contact.remote_id, contact.name, contact.nickname, contact.phone, contact.birth_day, contact.birth_month, contact.birth_year]
        );
        return res.id;
    }
};

export const getBirthdayContactsToday = async () => {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    
    return await all(
        `SELECT * FROM contacts 
         WHERE birth_day = ? AND birth_month = ? 
         AND (last_message_year IS NULL OR last_message_year < ?)`,
        [day, month, year]
    );
};

export const updateLastMessageYear = async (contactId, year) => {
    await run(`UPDATE contacts SET last_message_year = ? WHERE id = ?`, [year, contactId]);
};

export const addLog = async (contactId, phone, name, message, status) => {
    await run(
        `INSERT INTO logs (contact_id, phone, name, message, status) VALUES (?, ?, ?, ?, ?)`,
        [contactId, phone, name, message, status]
    );
};

export const getLogs = async (limit = 100) => {
    return await all(`SELECT * FROM logs ORDER BY sent_at DESC LIMIT ?`, [limit]);
};

export const getStats = async () => {
    const totalContactsRes = await get(`SELECT COUNT(*) as count FROM contacts`);
    const totalLogsRes = await get(`SELECT COUNT(*) as count FROM logs WHERE status = 'success'`);
    return {
        totalContacts: totalContactsRes ? totalContactsRes.count : 0,
        totalMessagesSent: totalLogsRes ? totalLogsRes.count : 0
    };
};

export const getUpcomingBirthdays = async (days = 30) => {
    const contacts = await all(`SELECT * FROM contacts WHERE birth_day IS NOT NULL AND birth_month IS NOT NULL`);
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const inNDays = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

    const upcoming = [];
    for (const c of contacts) {
        let bDateThisYear = new Date(today.getFullYear(), c.birth_month - 1, c.birth_day);

        let age = null;
        if (c.birth_year) {
            const rawAge = today.getFullYear() - c.birth_year;
            // Sanity check: ignore implausible ages (too old or too young to be a real contact)
            if (rawAge >= 12 && rawAge <= 90) {
                age = rawAge;
            }
        }

        const addContact = (date, ageVal) => {
            const daysUntil = Math.round((date - today) / (24 * 60 * 60 * 1000));
            const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
            upcoming.push({ ...c, next_birthday_date: date, age: ageVal, daysUntil, dateStr });
        };

        if (bDateThisYear < today) {
            const nextDate = new Date(today.getFullYear() + 1, c.birth_month - 1, c.birth_day);
            if (nextDate <= inNDays) {
                addContact(nextDate, age !== null ? age + 1 : null);
            }
        } else if (bDateThisYear <= inNDays) {
            addContact(bDateThisYear, age);
        }
    }

    upcoming.sort((a, b) => a.next_birthday_date - b.next_birthday_date);
    return upcoming;
};

export default db;
