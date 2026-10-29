import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { WhatsAppService } from './whatsapp-service.js';

const { Client, LocalAuth } = pkg;
const service = new WhatsAppService({
    createClient: ({ signal }) => new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        // Load the current WhatsApp Web application, never a hardcoded 2024 HTML snapshot.
        webVersionCache: { type: 'none' },
        puppeteer: {
            signal,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--disable-gpu'],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        }
    }),
    qrToDataUrl: qr => qrcode.toDataURL(qr),
    clearLocks: () => {
        // Called only after our previous browser has closed. Keep all session data.
        for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
            try { fs.unlinkSync(path.join('.wwebjs_auth', 'session', name)); }
            catch (err) { if (err.code !== 'ENOENT') console.warn(`WhatsApp: Could not remove stale ${name}: ${err.message}`); }
        }
    }
});

export const initWhatsApp = () => service.start().catch(err => {
    service.setStatus('error', { error: err.message });
    console.error('WhatsApp: Could not start client:', err.message);
});
export const reinitWhatsApp = initWhatsApp;
export const isConnected = () => service.getStatus().connected;
export const getQrCodeDataUrl = () => service.getStatus().qrUrl;
export const getStatus = () => service.getStatus();
export const requestPairingCode = phone => service.requestPairingCode(phone);
export const cancelPairingCode = () => service.cancelPairingCode();
export const sendMessage = (phone, text) => service.sendMessage(phone, text);
