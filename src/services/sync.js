import { createDAVClient } from 'tsdav';
import { upsertContact, getSetting, setSetting, run, getAllContacts, addMergeSuggestion, get } from '../db/database.js';

export const syncContacts = async () => {
    const url = (await getSetting('carddav_url')) || process.env.CARDDAV_URL;
    const username = (await getSetting('carddav_username')) || process.env.CARDDAV_USERNAME;
    const password = (await getSetting('carddav_password')) || process.env.CARDDAV_PASSWORD;

    if (!url || !username || !password) {
        console.warn('Sync: Missing CardDAV credentials. Please fill them out in the Settings GUI or .env file. Sync skipped.');
        return { success: false, error: 'Missing credentials' };
    }

    try {
        console.log('Sync: Starting CardDAV synchronization...');
        const client = await createDAVClient({
            serverUrl: url,
            credentials: { username, password },
            authMethod: 'Basic',
            defaultAccountType: 'carddav'
        });

        const addressBooks = await client.fetchAddressBooks();
        if (!addressBooks || addressBooks.length === 0) {
            console.log('Sync: No address books found.');
            return { success: false, error: 'No address books found' };
        }

        let totalProcessed = 0;
        const rawContacts = [];

        for (const ab of addressBooks) {
            console.log(`Sync: Fetching address book: ${ab.url}`);
            const vcards = await client.fetchVCards({ addressBook: ab });

            for (const item of vcards) {
                const contact = parseVCard(item.data, item.url);
                if (contact) {
                    rawContacts.push(contact);
                }
            }
        }

        const syncedRemoteIds = [];
        for (const contact of rawContacts) {
            const id = await upsertContact(contact);
            syncedRemoteIds.push(contact.remote_id);
            totalProcessed++;
        }

        // --- Suggestion Logic (Improved Dutch name matching) ---
        console.log('Sync: Analyzing contacts for merge suggestions...');
        const dbContacts = await getAllContacts(); 
        
        // Dutch particles to ignore for the "prefix/core" matching
        const particles = ['van', 'de', 'der', 'den', 'het', 't', 'v.d.', 'vd'];
        const getCoreWords = (n) => n.toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1 && !particles.includes(w));
        
        for (let i = 0; i < dbContacts.length; i++) {
            for (let j = i + 1; j < dbContacts.length; j++) {
                const c1 = dbContacts[i];
                const c2 = dbContacts[j];
                
                // If they have the same phone (and it's not empty), they are candidates but probably already unique by remote_id
                if (c1.phone && c1.phone === c2.phone) continue; 

                const w1 = getCoreWords(c1.name);
                const w2 = getCoreWords(c2.name);
                
                let isMatch = false;
                
                // Strategy: Match if they share at least 2 "core" words in any order
                // This covers "Jan Janssen" and "Jan Janssen Prive" even if "Prive" is a core word
                // Or if one is just "Jan" and another "Jan Janssen", they won't match (only 1 word shared)
                const shared = w1.filter(w => w2.includes(w));
                if (shared.length >= 2) {
                    isMatch = true;
                } else if (w1.length === 1 && w2.length === 1 && w1[0] === w2[0]) {
                    // Small names (e.g. "Mama" and "Mama")
                    isMatch = true;
                }

                if (isMatch) {
                    // Check if already merged
                    const existingMerge = await get(`SELECT master_id FROM manual_merges WHERE (master_id = ? AND slave_id = ?) OR (master_id = ? AND slave_id = ?)`, [c1.id, c2.id, c2.id, c1.id]);
                    if (!existingMerge) {
                        await addMergeSuggestion(c1.id, c2.id);
                    }
                }
            }
        }

        // Cleanup: Remove contacts that were NOT in this sync
        if (syncedRemoteIds.length > 0) {
            const placeholders = syncedRemoteIds.map(() => '?').join(',');
            await run(`DELETE FROM contacts WHERE remote_id NOT IN (${placeholders})`, syncedRemoteIds);
        }

        console.log(`Sync: Synchronization finished. Processed ${totalProcessed} contacts.`);
        await setSetting('last_sync', new Date().toISOString());
        return { success: true, count: totalProcessed };
    } catch (err) {
        console.error('Sync: Error during synchronization:', err);
        return { success: false, error: err.message };
    }
};

const parseVCard = (vcardString, remoteId) => {
    const lines = vcardString.split(/\r?\n/);
    let name = '';
    let nickname = '';
    let phone = '';
    let company = '';
    let email = '';
    let bday = null;

    let phones = [];

    for (const line of lines) {
        if (line.startsWith('FN:')) {
            name = line.substring(3).trim();
        } else if (line.startsWith('NICKNAME:')) {
            nickname = line.substring(9).trim();
        } else if (line.startsWith('ORG:')) {
            company = line.substring(4).split(';')[0].replace(/\\/g, '').trim();
        } else if (line.startsWith('EMAIL')) {
            const parts = line.split(':');
            if (parts.length > 1) email = parts[1].trim();
        } else if (line.startsWith('TEL')) {
            const parts = line.split(':');
            if (parts.length > 1) {
                const typeInfo = parts[0].toUpperCase();
                const num = parts.slice(1).join(':').trim();
                const formatted = formatPhone(num);
                phones.push({ num: formatted, isMobile: typeInfo.includes('CELL') || typeInfo.includes('MOBILE') });
            }
        } else if (line.startsWith('BDAY')) {
            const parts = line.split(':');
            if (parts.length > 1) {
                bday = parts.slice(1).join(':').trim();
            }
        }
    }

    // Pick best phone
    const mobile = phones.find(p => p.isMobile);
    phone = mobile ? mobile.num : (phones[0] ? phones[0].num : '');

    if (!name && nickname) name = nickname;
    if (!name) name = 'Unknown';

    let birth_year = null, birth_month = null, birth_day = null;
    if (bday) {
        if (bday.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const parts = bday.split('-');
            birth_year = parseInt(parts[0], 10);
            birth_month = parseInt(parts[1], 10);
            birth_day = parseInt(parts[2], 10);
        } else if (bday.match(/^--\d{2}-\d{2}$/)) {
            const parts = bday.split('-');
            birth_month = parseInt(parts[2], 10);
            birth_day = parseInt(parts[3], 10);
        } else if (bday.match(/^\d{8}$/)) {
            birth_year = parseInt(bday.substring(0, 4), 10);
            birth_month = parseInt(bday.substring(4, 6), 10);
            birth_day = parseInt(bday.substring(6, 8), 10);
        }
    }

    if (birth_year !== null) {
        const currentYear = new Date().getFullYear();
        const age = currentYear - birth_year;
        if (age < 12 || age > 110) birth_year = null;
    }

    return {
        remote_id: remoteId,
        name,
        nickname,
        company,
        email,
        phone,
        birth_day,
        birth_month,
        birth_year
    };
};

const formatPhone = (rawPhone) => {
    let cleaned = rawPhone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('06') && cleaned.length === 10) {
        cleaned = '+31' + cleaned.substring(1);
    } else if (cleaned.startsWith('0031')) {
        cleaned = '+31' + cleaned.substring(4);
    }
    return cleaned;
};
