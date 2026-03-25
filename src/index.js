import 'dotenv/config';
import { startServer } from './server.js';
import { initWhatsApp, reinitWhatsApp } from './services/whatsapp.js';
import { syncContacts } from './services/sync.js';
import { startBirthdayScheduler } from './services/birthday.js';
import cron from 'node-cron';

const PORT = process.env.PORT || 3000;

// Global crash guard — whatsapp-web.js throws unhandled rejections internally
// when WhatsApp Web navigates after QR scan. We catch them here and restart the client.
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('Execution context was destroyed') || msg.includes('LifecycleWatcher') || msg.includes('Navigating frame was detached')) {
        console.error('WhatsApp: Internal Puppeteer crash detected. Restarting WhatsApp client in 5 seconds...');
        setTimeout(() => reinitWhatsApp(), 5000);
    } else {
        console.error('Unhandled Promise Rejection:', reason);
    }
});

process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes('Execution context was destroyed') || msg.includes('LifecycleWatcher') || msg.includes('Navigating frame was detached')) {
        console.error('WhatsApp: Internal Puppeteer fatal error. Restarting WhatsApp client in 5 seconds...');
        setTimeout(() => reinitWhatsApp(), 5000);
    } else {
        console.error('Uncaught Exception:', err);
        process.exit(1);
    }
});

const startApp = async () => {
    console.log('--- WhatsApp Birthday Bot Starting ---');

    startServer(PORT);
    initWhatsApp();
    startBirthdayScheduler();

    console.log('Starting initial sync... (can take a few seconds)');
    await syncContacts();

    cron.schedule('0 2 * * *', async () => {
        console.log('Cronjob: Daily CardDAV sync starting...');
        await syncContacts();
    });
};

startApp();
