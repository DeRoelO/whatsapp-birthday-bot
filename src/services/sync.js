import { createDAVClient } from 'tsdav';
import { upsertContact, getSetting, setSetting } from '../db/database.js';

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

        let totalSynced = 0;

        for (const ab of addressBooks) {
            console.log(`Sync: Fetching address book: ${ab.url}`);
            
            const vcards = await client.fetchVCards({ 
                addressBook: ab
            });

            for (const item of vcards) {
                const contact = parseVCard(item.data, item.url);
                if (contact && contact.phone) {
                    await upsertContact(contact);
                    totalSynced++;
                }
            }
        }

        console.log(`Sync: Synchronization finished. Processed ${totalSynced} contacts with phone numbers.`);
        await setSetting('last_sync', new Date().toISOString());
        return { success: true, count: totalSynced };
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
            if (parts.length > 1 && !phone) {
                let num = parts.slice(1).join(':').trim();
                phone = formatPhone(num);
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
