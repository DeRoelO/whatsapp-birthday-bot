import { createDAVClient } from 'tsdav';
import { upsertContact, getSetting, setSetting, run } from '../db/database.js';

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

        // --- Option C v2: Smart Merging ---
        const mergedPeople = [];
        
        const getWords = (n) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 1);

        for (const parsed of rawContacts) {
            const w2 = getWords(parsed.name);
            
            // Find existing person to merge with
            let match = mergedPeople.find(p => {
                const w1 = getWords(p.name);
                // Match if first two words are identical (e.g. "Jan Janssen")
                if (w1.length >= 2 && w2.length >= 2) {
                    return w1[0] === w2[0] && w1[1] === w2[1];
                }
                // Fallback for identical single names
                if (w1.length === 1 && w2.length === 1) {
                    return w1[0] === w2[0];
                }
                return false;
            });

            if (match) {
                console.log(`Sync: Merging "${parsed.name}" into master record "${match.name}"`);
                // Merge data: newest/longest name wins, but keep birthday/phone if available
                if (parsed.name.length > match.name.length) match.name = parsed.name;
                if (!match.phone && parsed.phone) match.phone = parsed.phone;
                if (!match.birth_day && parsed.birth_day) {
                    match.birth_day = parsed.birth_day;
                    match.birth_month = parsed.birth_month;
                    match.birth_year = parsed.birth_year;
                }
                // Keep the original remote_id for cleanup tracking
            } else {
                mergedPeople.push(parsed);
            }
        }

        // Only keep those that have BOTH a phone and a birthday
        const finalContacts = mergedPeople.filter(p => p.phone && p.birth_day && p.birth_month);

        const syncedRemoteIds = [];
        for (const contact of finalContacts) {
            await upsertContact(contact);
            syncedRemoteIds.push(contact.remote_id);
            totalProcessed++;
        }

        // Cleanup: Remove contacts that were NOT in this sync (filtered out by merging or deleted from iCloud)
        if (syncedRemoteIds.length > 0) {
            const placeholders = syncedRemoteIds.map(() => '?').join(',');
            await run(`DELETE FROM contacts WHERE remote_id NOT IN (${placeholders})`, syncedRemoteIds);
        }

        console.log(`Sync: Synchronization finished. Processed ${totalProcessed} unique merged contacts.`);
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
    let nickname = null;
    let phone = null;
    let bday = null;

    for (const line of lines) {
        if (line.startsWith('FN:')) {
            name = line.substring(3).trim();
        } else if (line.startsWith('NICKNAME:')) {
            nickname = line.substring(9).trim();
        } else if (line.startsWith('TEL')) {
            const parts = line.split(':');
            if (parts.length > 1) {
                const typeInfo = parts[0].toUpperCase();
                const num = parts.slice(1).join(':').trim();
                const formatted = formatPhone(num);
                
                // Prioritize: CELL/MOBILE > PREF > anything else
                if (!phone || typeInfo.includes('CELL') || typeInfo.includes('MOBILE')) {
                    phone = formatted;
                    // If we found a mobile number, we can stop looking
                    if (typeInfo.includes('CELL') || typeInfo.includes('MOBILE')) break;
                } else if (typeInfo.includes('PREF') && (!phone || !phone.includes('CELL'))) {
                    phone = formatted;
                }
            }
        } else if (line.startsWith('BDAY')) {
            const parts = line.split(':');
            if (parts.length > 1) {
                bday = parts.slice(1).join(':').trim();
            }
        }
    }

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
        // Sanity check: ignore implausible years (e.g., Apple's default 1604, or year = current year)
        if (age < 12 || age > 90) {
            birth_year = null;
        }
    }

    return {
        remote_id: remoteId,
        name,
        nickname,
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
