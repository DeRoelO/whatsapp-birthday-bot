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
    )`);

    // Manual Merges table (Master/Slave relationship)
    db.run(`CREATE TABLE IF NOT EXISTS manual_merges (
        master_id INTEGER,
        slave_id INTEGER UNIQUE,
        PRIMARY KEY(master_id, slave_id),
        FOREIGN KEY (master_id) REFERENCES contacts (id),
        FOREIGN KEY (slave_id) REFERENCES contacts (id)
    )`);

    // Merge Suggestions table
    db.run(`CREATE TABLE IF NOT EXISTS merge_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_a_id INTEGER,
        contact_b_id INTEGER,
        status TEXT DEFAULT 'pending',
        UNIQUE(contact_a_id, contact_b_id),
        FOREIGN KEY (contact_a_id) REFERENCES contacts (id),
        FOREIGN KEY (contact_b_id) REFERENCES contacts (id)
    )`, () => {
        dbReadyResolve();
    });
});

// Wrapper for queries (Waits for tables to be created first!)
export const run = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

export const get = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

export const all = async (sql, params = []) => {
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
    
    // 1. Get all IDs of contacts who have a birthday today
    const birthdayPeople = await all(
        `SELECT id FROM contacts WHERE birth_day = ? AND birth_month = ?`,
        [day, month]
    );
    if (birthdayPeople.length === 0) return [];

    const birthdayIds = birthdayPeople.map(p => p.id);

    // 2. Find all related IDs (Masters and Slaves of those who have a birthday)
    // We want: The birthday person itself, their master (if they are a slave), and all their slaves (if they are a master)
    const relatedIds = new Set(birthdayIds);
    
    // Find masters of these birthday people
    const masters = await all(`SELECT master_id FROM manual_merges WHERE slave_id IN (${birthdayIds.map(() => '?').join(',')})`, birthdayIds);
    masters.forEach(m => relatedIds.add(m.master_id));

    // Find slaves of these birthday people (and their masters)
    const allIdsArray = Array.from(relatedIds);
    const slaves = await all(`SELECT slave_id FROM manual_merges WHERE master_id IN (${allIdsArray.map(() => '?').join(',')})`, allIdsArray);
    slaves.forEach(s => relatedIds.add(s.slave_id));

    // 3. Fetch all data for this entire "cluster" of people
    const clusterIds = Array.from(relatedIds);
    const clusterData = await all(
        `SELECT c.*, m.master_id FROM contacts c 
         LEFT JOIN manual_merges m ON c.id = m.slave_id
         WHERE c.id IN (${clusterIds.map(() => '?').join(',')})`,
        clusterIds
    );

    // 4. Group by Master
    const results = new Map();
    for (const c of clusterData) {
        const effectiveMasterId = c.master_id || c.id;
        
        let m = results.get(effectiveMasterId);
        if (!m) {
            // Find the actual master record in clusterData
            m = clusterData.find(d => d.id === effectiveMasterId) || { ...c, id: effectiveMasterId, master_id: null };
            results.set(effectiveMasterId, { ...m });
            m = results.get(effectiveMasterId);
        }

        // Aggregate data into master
        if (!m.phone && c.phone) m.phone = c.phone;
        if (!m.birth_day && c.birth_day) {
            m.birth_day = c.birth_day;
            m.birth_month = c.birth_month;
            m.birth_year = c.birth_year;
        }
    }

    // 5. Filter for those who actually have a birthday today AND a phone, and aren't double-sent
    return Array.from(results.values()).filter(p => 
        p.phone && 
        p.birth_day === day && 
        p.birth_month === month && 
        (p.last_message_year === null || p.last_message_year < year)
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

export const getAllContacts = async () => {
    return await all(`SELECT id, name, nickname, phone FROM contacts ORDER BY name ASC`);
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

// --- Contact Management Helpers ---

export const addManualMerge = async (masterId, slaveId) => {
    await run(`INSERT OR REPLACE INTO manual_merges (master_id, slave_id) VALUES (?, ?)`, [masterId, slaveId]);
    await run(`UPDATE merge_suggestions SET status = 'approved' WHERE (contact_a_id = ? AND contact_b_id = ?) OR (contact_a_id = ? AND contact_b_id = ?)`, [masterId, slaveId, slaveId, masterId]);
};

export const removeManualMerge = async (slaveId) => {
    await run(`DELETE FROM manual_merges WHERE slave_id = ?`, [slaveId]);
};

export const getManualMerges = async () => {
    return await all(`
        SELECT m.*, c1.name as master_name, c2.name as slave_name 
        FROM manual_merges m
        JOIN contacts c1 ON m.master_id = c1.id
        JOIN contacts c2 ON m.slave_id = c2.id
    `);
};

export const getMergeSuggestions = async () => {
    return await all(`
        SELECT s.*, c1.name as name_a, c1.phone as phone_a, c2.name as name_b, c2.phone as phone_b
        FROM merge_suggestions s
        JOIN contacts c1 ON s.contact_a_id = c1.id
        JOIN contacts c2 ON s.contact_b_id = c2.id
        WHERE s.status = 'pending'
    `);
};

export const addMergeSuggestion = async (idA, idB) => {
    await run(`INSERT OR IGNORE INTO merge_suggestions (contact_a_id, contact_b_id) VALUES (?, ?)`, [idA, idB]);
};

export const updateSuggestionStatus = async (id, status) => {
    await run(`UPDATE merge_suggestions SET status = ? WHERE id = ?`, [status, id]);
};

export const deleteContact = async (id) => {
    await run(`DELETE FROM contacts WHERE id = ?`, [id]);
};

export default db;
