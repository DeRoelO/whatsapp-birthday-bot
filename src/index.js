import 'dotenv/config';
import { startServer } from './server.js';
import { initWhatsApp } from './services/whatsapp.js';
import { syncContacts } from './services/sync.js';
import { startBirthdayScheduler } from './services/birthday.js';
import cron from 'node-cron';

const PORT = process.env.PORT || 3000;

const startApp = async () => {
    console.log('--- WhatsApp Birthday Bot Starting ---');

    // 1. Initialise Web GUI
    startServer(PORT);

    // 2. Initialise WhatsApp Web
    initWhatsApp();

    // 3. Start Birthday Scheduler (which checks and schedules messages for today)
    startBirthdayScheduler();

    // 4. Run an initial CardDAV synchronization
    console.log('Starting initial sync... (can take a few seconds)');
    await syncContacts();

    // 5. Schedule daily CardDAV sync at 02:00 AM
    cron.schedule('0 2 * * *', async () => {
        console.log('Cronjob: Daily CardDAV sync starting...');
        await syncContacts();
    });
};

startApp();
