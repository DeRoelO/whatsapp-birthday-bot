import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';

let client;
let isReady = false;
let qrCodeDataUrl = null;

export const initWhatsApp = () => {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        puppeteer: {
            // Arguments to make it run smoothly inside Docker (Debian/Ubuntu)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        }
    });

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
    });

    client.on('disconnected', (reason) => {
        console.log('WhatsApp: Disconnected', reason);
        isReady = false;
        // The client might need to be reinitialized or we wait for reconnection
        // depending on the disconnect reason. For now, just mark not ready.
    });

    client.initialize();
};

export const isConnected = () => isReady;

export const getQrCodeDataUrl = () => qrCodeDataUrl;

export const sendMessage = async (phone, text) => {
    if (!isReady) {
        throw new Error('WhatsApp client is not ready. Please wait for it to connect.');
    }

    // Phone numbers from CardDAV could be anything, but we need them in format 31612345678@c.us
    const cleanPhone = phone.replace(/[^0-9]/g, ''); // strip out + and dashes
    const chatId = `${cleanPhone}@c.us`;

    try {
        await client.sendMessage(chatId, text);
        return true;
    } catch (err) {
        console.error(`WhatsApp: Error sending message to ${phone}:`, err);
        throw err;
    }
};
