import cron from 'node-cron';
import { getBirthdayContactsToday, addLog, updateLastMessageYear, getSetting } from '../db/database.js';
import { sendMessage } from './whatsapp.js';

const DEFAULT_TEMPLATES = [
    "Hoi [NAAM], van harte gefeliciteerd met je [LEEFTIJD] verjaardag! 🎉 Maak er een mooie dag van!",
    "Gefeliciteerd [NAAM]! 🎂 Ik wens je een hele fijne [LEEFTIJD] verjaardag toe.",
    "Hey [NAAM]! Van harte gefeliciteerd! 🎈 [LEEFTIJD] jaar alweer, geniet ervan!"
];

const parseTime = (timeStr, defaultHour, defaultMinute) => {
    if (!timeStr) return { hour: defaultHour, minute: defaultMinute };
    const parts = timeStr.split(':');
    return { hour: parseInt(parts[0], 10), minute: parseInt(parts[1], 10) };
};

export const startBirthdayScheduler = () => {
    // Run every day at 00:05
    cron.schedule('5 0 * * *', async () => {
        console.log('Birthday Scheduler: Dagelijkse check draait...');
        const enabled = await getSetting('scheduler_enabled', process.env.SCHEDULER_ENABLED || 'true');
        if (enabled !== 'true') {
            console.log('Birthday Scheduler: Scheduler is uitgeschakeld in settings.');
            return;
        }
        await checkAndScheduleBirthdays(false);
    });
    
    console.log('Birthday Scheduler: Startup check loopt...');
    (async () => {
        const enabled = await getSetting('scheduler_enabled', process.env.SCHEDULER_ENABLED || 'true');
        if (enabled === 'true') {
            await checkAndScheduleBirthdays(false);
        } else {
            console.log('Birthday Scheduler: Scheduler is handmatig uitgeschakeld via GUI.');
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
        console.log('Birthday Scheduler: Geen (nieuwe) verjaardagen gevonden voor vandaag.');
        return { success: true, count: 0, message: 'Geen verjaardagen vandaag (of allemaal al verstuurd).' };
    }

    console.log(`Birthday Scheduler: ${contacts.length} verjaardagen vandaag!`);

    let sentCount = 0;
    
    const templatesWithAgeStr = await getSetting('templates_with_age', "Hoi [NAAM], van harte gefeliciteerd met je [LEEFTIJD]e verjaardag!\nGefeliciteerd [NAAM]! Ik wens je een hele fijne [LEEFTIJD]e verjaardag toe.");
    const templatesWithoutAgeStr = await getSetting('templates_without_age', "Hoi [NAAM], van harte gefeliciteerd met je verjaardag!\nGefeliciteerd [NAAM]! Ik wens je een hele fijne verjaardag toe.");
    
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
            console.log(`Birthday Scheduler: Contact ${contact.name} overgeslagen via uitsluitingenlijst.`);
            continue;
        }

        let delayMs = 0;
        
        if (forceNow) {
            delayMs = sentCount * 5000; // 5 sec tussen elk force-bericht
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
            console.log(`Birthday Scheduler (Force): Bericht voor ${contact.name} wordt over ${delayMs/1000} sec verstuurd`);
        } else {
            console.log(`Birthday Scheduler: Bericht voor ${contact.name} gepland op ${new Date(Date.now() + delayMs).toLocaleTimeString('nl-NL')}`);
        }

        setTimeout(() => {
            executeSend(contact, message, currentYear);
        }, Math.max(0, delayMs));
        
        sentCount++;
    }
    
    return { success: true, count: sentCount, message: `${sentCount} berichten ${forceNow ? 'direct verstuurd' : 'ingepland'}.` };
};

const generateMessage = (contact, currentYear, templatesWithAge, templatesWithoutAge, includeAgeSetting) => {
    let hasAgeInfo = contact.birth_year && includeAgeSetting;
    let templates = hasAgeInfo ? templatesWithAge : templatesWithoutAge;
    
    // Safety fallback
    if (!templates || templates.length === 0) templates = hasAgeInfo ? templatesWithoutAge : templatesWithAge;
    if (!templates || templates.length === 0) templates = ["Gefeliciteerd [NAAM]!"];
    
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
    console.log(`Birthday Scheduler: Bericht versturen naar ${contact.name} (${contact.phone})...`);
    try {
        await sendMessage(contact.phone, message);
        await addLog(contact.id, contact.phone, contact.name, message, 'success');
        await updateLastMessageYear(contact.id, currentYear);
        console.log(`Birthday Scheduler: Succesvol verzonden naar ${contact.name}`);
    } catch (err) {
        console.error(`Birthday Scheduler: Fout bij verzenden naar ${contact.name}:`, err.message);
        await addLog(contact.id, contact.phone, contact.name, message, `failed: ${err.message}`);
    }
};
