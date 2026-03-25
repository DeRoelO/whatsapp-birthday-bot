import cron from 'node-cron';
import { getBirthdayContactsToday, addLog, updateLastMessageYear, getSetting } from '../db/database.js';
import { sendMessage } from './whatsapp.js';

const DEFAULT_TEMPLATES = [
    "Hi [NAAM], wishing you a very happy [LEEFTIJD]th birthday! 🎉 Have a great day!",
    "Happy Birthday [NAAM]! 🎂 I hope you have a wonderful [LEEFTIJD]th birthday.",
    "Hey [NAAM]! Happy birthday! 🎈 [LEEFTIJD] years already, enjoy it!"
];

const parseTime = (timeStr, defaultHour, defaultMinute) => {
    if (!timeStr) return { hour: defaultHour, minute: defaultMinute };
    const parts = timeStr.split(':');
    return { hour: parseInt(parts[0], 10), minute: parseInt(parts[1], 10) };
};

export const startBirthdayScheduler = () => {
    // Run every day at 00:05
    cron.schedule('5 0 * * *', async () => {
        console.log('Birthday Scheduler: Daily check running...');
        const enabled = await getSetting('scheduler_enabled', process.env.SCHEDULER_ENABLED || 'true');
        if (enabled !== 'true') {
            console.log('Birthday Scheduler: Scheduler disabled in settings.');
            return;
        }
        await checkAndScheduleBirthdays(false);
    });
    
    console.log('Birthday Scheduler: Startup check running...');
    (async () => {
        const enabled = await getSetting('scheduler_enabled', process.env.SCHEDULER_ENABLED || 'true');
        if (enabled === 'true') {
            await checkAndScheduleBirthdays(false);
        } else {
            console.log('Birthday Scheduler: Scheduler manually disabled via GUI.');
        }
    })();
};

export const checkAndScheduleBirthdays = async (forceNow = false) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const dayOfWeek = today.getDay(); 
    
    let isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    const wE_Start = await getSetting('weekend_start', process.env.SCHEDULE_WEEKEND_START || '08:30');
    const wE_End = await getSetting('weekend_end', process.env.SCHEDULE_WEEKEND_END || '09:30');
    const wD_Start = await getSetting('weekday_start', process.env.SCHEDULE_WEEKDAY_START || '06:30');
    const wD_End = await getSetting('weekday_end', process.env.SCHEDULE_WEEKDAY_END || '07:30');

    let start, end;
    if (isWeekend) {
        start = parseTime(wE_Start, 8, 30);
        end = parseTime(wE_End, 9, 30);
    } else {
        start = parseTime(wD_Start, 6, 30);
        end = parseTime(wD_End, 7, 30);
    }
    
    const startMins = start.hour * 60 + start.minute;
    const endMins = end.hour * 60 + end.minute;
    const windowMins = Math.max(1, endMins - startMins);
    
    const contacts = await getBirthdayContactsToday();
    if (contacts.length === 0) {
        console.log('Birthday Scheduler: No (new) birthdays found for today.');
        return { success: true, count: 0, message: 'No birthdays today (or all already sent).' };
    }

    console.log(`Birthday Scheduler: ${contacts.length} birthdays today!`);

    let sentCount = 0;
    
    const templatesWithAgeStr = await getSetting('templates_with_age', "Hi [NAAM], wishing you a very happy [LEEFTIJD]th birthday!\nHappy Birthday [NAAM]! I hope you have a wonderful [LEEFTIJD]th birthday.");
    const templatesWithoutAgeStr = await getSetting('templates_without_age', "Hi [NAAM], wishing you a very happy birthday!\nHappy Birthday [NAAM]! I hope you have a wonderful birthday.");
    
    const templatesWithAge = templatesWithAgeStr.split('\n').map(t => t.trim()).filter(Boolean);
    const templatesWithoutAge = templatesWithoutAgeStr.split('\n').map(t => t.trim()).filter(Boolean);

    const includeAgeStr = await getSetting('include_age', process.env.INCLUDE_AGE || 'true');
    const includeAgeSetting = includeAgeStr === 'true';

    const excludedStr = await getSetting('excluded_contacts', '');
    const excludedList = excludedStr.split('\n').map(e => e.trim().toLowerCase()).filter(Boolean);

    for (const contact of contacts) {
        if (!contact.phone) continue;

        // Controleer of contact in de uitsluitingen lijst staat
        let isExcluded = false;
        const cPhone = contact.phone.toLowerCase();
        const cName = (contact.name || '').toLowerCase();
        const cNick = (contact.nickname || '').toLowerCase();

        for (const ex of excludedList) {
            if (cPhone.includes(ex) || cName.includes(ex) || cNick.includes(ex)) {
                isExcluded = true;
                break;
            }
        }

        if (isExcluded) {
            console.log(`Birthday Scheduler: Skipped contact ${contact.name} (exclusion list).`);
            continue;
        }

        let delayMs = 0;
        
        if (forceNow) {
            delayMs = sentCount * 5000; // 5 sec interval for forced messages
        } else {
            const randomMinutesAdd = Math.floor(Math.random() * windowMins);
            let targetTime = new Date(today);
            targetTime.setHours(start.hour, start.minute + randomMinutesAdd, 0, 0);

            const now = new Date();
            if (targetTime < now) {
                targetTime = new Date(now.getTime() + (Math.random() * 5 * 60000)); 
            }
            delayMs = targetTime.getTime() - now.getTime();
        }

        const message = generateMessage(contact, currentYear, templatesWithAge, templatesWithoutAge, includeAgeSetting);

        if (forceNow) {
            console.log(`Birthday Scheduler (Force): Message for ${contact.name} will be sent in ${delayMs/1000} sec.`);
        } else {
            console.log(`Birthday Scheduler: Message for ${contact.name} scheduled at ${new Date(Date.now() + delayMs).toLocaleTimeString('en-US')}`);
        }

        setTimeout(() => {
            executeSend(contact, message, currentYear);
        }, Math.max(0, delayMs));
        
        sentCount++;
    }
    
    return { success: true, count: sentCount, message: `${sentCount} messages ${forceNow ? 'sent immediately' : 'scheduled'}.` };
};

const generateMessage = (contact, currentYear, templatesWithAge, templatesWithoutAge, includeAgeSetting) => {
    let hasAgeInfo = contact.birth_year && includeAgeSetting;
    let templates = hasAgeInfo ? templatesWithAge : templatesWithoutAge;
    
    // Safety fallback
    if (!templates || templates.length === 0) templates = hasAgeInfo ? templatesWithoutAge : templatesWithAge;
    if (!templates || templates.length === 0) templates = ["Happy Birthday [NAAM]!"];
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    let displayName = contact.nickname;
    if (!displayName) {
        displayName = contact.name.split(' ')[0];
    }

    let ageText = "";
    if (hasAgeInfo) {
        const age = currentYear - contact.birth_year;
        ageText = `${age}`;
    }

    let message = template.replace(/\[NAAM\]/g, displayName);
    
    if (ageText) {
        message = message.replace(/\[LEEFTIJD\]/g, ageText);
    } else {
        message = message.replace(/\s?\[LEEFTIJD\]\w?/g, ''); // Removes [LEEFTIJD] and optional following letter like "e"
    }

    return message.trim();
};

const executeSend = async (contact, message, currentYear) => {
    console.log(`Birthday Scheduler: Sending message to ${contact.name} (${contact.phone})...`);
    try {
        await sendMessage(contact.phone, message);
        await addLog(contact.id, contact.phone, contact.name, message, 'success');
        await updateLastMessageYear(contact.id, currentYear);
        console.log(`Birthday Scheduler: Successfully sent to ${contact.name}`);
    } catch (err) {
        console.error(`Birthday Scheduler: Failed to send to ${contact.name}:`, err.message);
        await addLog(contact.id, contact.phone, contact.name, message, `failed: ${err.message}`);
    }
};
