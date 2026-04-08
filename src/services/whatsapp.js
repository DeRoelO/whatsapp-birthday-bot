import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';

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

import fs from 'fs';
import path from 'path';

const clearLocks = (dir) => {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                if (fs.lstatSync(fullPath).isDirectory()) {
                    clearLocks(fullPath);
                } else if (file === 'SingletonLock' || file === 'SingletonCookie') {
                    try { fs.unlinkSync(fullPath); } catch (e) {}
                }
            } catch (innerErr) {
                // Ignore stat errors for individual files
            }
        }
    } catch(e) {}
};

const startClient = () => {
    if (client) {
        try { client.destroy(); } catch (_) {}
    }

    console.log('WhatsApp: Clearing Chrome locks before initialization...');
    clearLocks('./.wwebjs_auth');
    
    console.log('WhatsApp: Creating client instance...');
    client = createClient();

    let lastQrLog = 0;
    client.on('qr', async (qr) => {
        const now = Date.now();
        if (now - lastQrLog > 60000) {
            console.log('WhatsApp: QR Code received, waiting for scan. (Check the GUI Settings tab to scan it)');
            lastQrLog = now;
        }
        
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
        console.log('WhatsApp: Reconnecting in 5 seconds...');
        setTimeout(startClient, 5000);
    });

    console.log('WhatsApp: Initializing client (this may take 30-60 seconds in Docker)...');
    
    // Safety timeout: If it hasn't reached 'qr' or 'ready' in 90 seconds, log it.
    const initTimeout = setTimeout(() => {
        if (!isReady && !qrCodeDataUrl) {
            console.warn('WhatsApp: Initialization is taking unusually long. Checkout the logs for browser errors.');
        }
    }, 90000);

    client.initialize().then(() => {
        console.log('WhatsApp: initialize() resolved.');
    }).catch((err) => {
        clearTimeout(initTimeout);
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
