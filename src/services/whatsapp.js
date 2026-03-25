import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Remove stale Chromium lock files left by a previous container
const cleanupLocks = () => {
    // Resolve absolute path: src/services/whatsapp.js → ../../.wwebjs_auth/session
    const sessionDir = path.resolve(__dirname, '../../.wwebjs_auth/session');
    console.log(`WhatsApp: Checking for stale locks in ${sessionDir}`);
    try {
        if (!fs.existsSync(sessionDir)) return;
        const files = fs.readdirSync(sessionDir);
        for (const f of files) {
            if (f.startsWith('Singleton')) {
                const full = path.join(sessionDir, f);
                fs.unlinkSync(full);
                console.log(`WhatsApp: Removed stale lock: ${f}`);
            }
        }
    } catch (e) {
        console.warn('WhatsApp: Lock cleanup failed:', e.message);
    }
};

let client;
let isReady = false;
let qrCodeDataUrl = null;

const createClient = () => new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    }
});

let isRestarting = false;

const startClient = async () => {
    if (isRestarting) {
        console.log('WhatsApp: Restart already in progress, skipping duplicate.');
        return;
    }
    isRestarting = true;

    if (client) {
        try {
            await client.destroy();
            console.log('WhatsApp: Old client destroyed.');
        } catch (e) {
            console.warn('WhatsApp: Could not cleanly destroy old client:', e.message);
        }
        client = null;
    }

    // Remove any stale Chromium lock files from previous container runs
    cleanupLocks();

    // Brief pause to let Chromium fully release file locks
    await new Promise(resolve => setTimeout(resolve, 3000));

    isRestarting = false;
    client = createClient();

    client.on('qr', async (qr) => {
        console.log('WhatsApp: QR Code received, waiting for scan.');
        try {
            qrCodeDataUrl = await qrcode.toDataURL(qr);
        } catch (err) {
            console.error('WhatsApp: Failed to generate QR Data URL', err);
        }
    });

    client.on('ready', () => {
        isReady = true;
        qrCodeDataUrl = null;
        console.log('WhatsApp: Web client is ready and connected!');
    });

    client.on('authenticated', () => {
        console.log('WhatsApp: Authenticated successfully.');
    });

    client.on('auth_failure', (msg) => {
        console.error('WhatsApp: Authentication failed', msg);
        isReady = false;
        console.log('WhatsApp: Retrying in 10 seconds...');
        setTimeout(startClient, 10000);
    });

    client.on('disconnected', (reason) => {
        console.log('WhatsApp: Disconnected -', reason);
        isReady = false;
        if (!isRestarting) {
            console.log('WhatsApp: Reconnecting in 5 seconds...');
            setTimeout(() => startClient(), 5000);
        }
    });

    client.initialize().catch((err) => {
        console.error('WhatsApp: Initialization error:', err.message);
        isReady = false;
        console.log('WhatsApp: Retrying initialization in 10 seconds...');
        setTimeout(startClient, 10000);
    });
};

export const initWhatsApp = () => {
    startClient();
};

export const reinitWhatsApp = () => {
    if (isRestarting) {
        console.log('WhatsApp: Restart already in progress, skipping.');
        return;
    }
    console.log('WhatsApp: Reinitializing client...');
    startClient();
};

export const isConnected = () => isReady;

export const getQrCodeDataUrl = () => qrCodeDataUrl;

export const sendMessage = async (phone, text) => {
    if (!isReady) {
        throw new Error('WhatsApp client is not ready. Please scan the QR code first.');
    }

    // Normalize phone number to international format (no +, no spaces)
    let cleanPhone = phone.replace(/[^0-9]/g, '');

    // Auto-correct Dutch local numbers: 06xxxxxxxx → 316xxxxxxxx
    if (cleanPhone.startsWith('06') && cleanPhone.length === 10) {
        cleanPhone = '31' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('00')) {
        cleanPhone = cleanPhone.substring(2);
    }

    const chatId = `${cleanPhone}@c.us`;

    try {
        await client.sendMessage(chatId, text);
        return true;
    } catch (err) {
        console.error(`WhatsApp: Error sending message to ${phone}:`, err);
        throw err;
    }
};
