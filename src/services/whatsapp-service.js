// Dependency injection keeps lifecycle and pairing behavior testable without a real account.
export class WhatsAppService {
    constructor({ createClient, qrToDataUrl, clearLocks = () => {}, timeoutMs = 120000, pairingTimeoutMs = 30000 }) {
        Object.assign(this, { createClient, qrToDataUrl, clearLocks, timeoutMs, pairingTimeoutMs });
        this.client = null;
        this.status = { state: 'starting', connected: false, qrUrl: null, pairingCode: null, error: null };
    }

    getStatus() { return { ...this.status }; }
    setStatus(state, extra = {}) {
        this.status = { state, connected: state === 'ready', qrUrl: null, pairingCode: null, error: null, ...extra };
    }

    watchStartup() {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
            if (!this.status.connected) this.setStatus('error', {
                error: 'WhatsApp is taking too long to start or restore the session. Restart the connection below and check the container logs.'
            });
        }, this.timeoutMs);
        this.watchdog.unref?.();
    }

    start() {
        if (this.starting) return this.starting;
        this.starting = this.restart().finally(() => { this.starting = null; });
        return this.starting;
    }

    async restart() {
        clearTimeout(this.retryTimer);
        clearTimeout(this.watchdog);
        this.setStatus('starting');
        const previous = this.client;
        this.launchController?.abort();
        this.client = null; // Ignore events from a closing client.
        if (previous) {
            previous.removeAllListeners();
            await previous.destroy(); // Release Chrome's profile before opening another browser.
        }
        this.clearLocks();
        this.launchController = new AbortController();
        const current = this.createClient({ signal: this.launchController.signal });
        this.client = current;
        const active = () => this.client === current;
        const retry = (error) => {
            if (!active()) return;
            clearTimeout(this.watchdog);
            this.setStatus('reconnecting', { error });
            console.error('WhatsApp:', error);
            clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => {
                this.start().catch(err => this.setStatus('error', { error: err.message }));
            }, 10000);
            this.retryTimer.unref?.();
        };
        current.on('qr', async qr => {
            if (!active() || ['ready', 'authenticated', 'code', 'reconnecting'].includes(this.status.state)) return;
            clearTimeout(this.watchdog);
            clearTimeout(this.retryTimer);
            try {
                const qrUrl = await this.qrToDataUrl(qr);
                if (active() && !this.status.connected && this.status.state !== 'authenticated') {
                    if (this.status.state === 'code') return;
                    this.setStatus('qr', { qrUrl });
                }
            } catch (err) { if (active()) this.setStatus('error', { error: err.message }); }
        });
        current.on('code', code => {
            if (active() && ['qr', 'code'].includes(this.status.state)) {
                clearTimeout(this.retryTimer);
                this.setStatus('code', { pairingCode: code });
            }
        });
        current.on('authenticated', () => {
            if (!active()) return;
            clearTimeout(this.retryTimer);
            this.setStatus('authenticated');
            console.log('WhatsApp: Authenticated; waiting for the client to become ready.');
            this.watchStartup();
        });
        current.on('ready', () => {
            if (!active()) return;
            clearTimeout(this.watchdog);
            clearTimeout(this.retryTimer);
            this.setStatus('ready');
            console.log('WhatsApp: Web client is ready and connected!');
        });
        current.on('auth_failure', () => retry('Authentication failed. Retrying in 10 seconds.'));
        current.on('disconnected', reason => retry(`Disconnected (${reason}). Retrying in 10 seconds.`));
        this.watchStartup();
        // Do not await initialization: QR/pairing can be needed before it completes.
        Promise.resolve().then(() => current.initialize()).catch(err => retry(`Initialization failed: ${err?.message || err}`))
            .finally(async () => {
                // A browser launch can finish after a user requested a restart.
                if (!active()) await current.destroy().catch(() => {});
            });
    }

    async requestPairingCode(phone) {
        const normalized = normalizePhone(phone);
        if (this.status.connected) throw new Error('WhatsApp is already connected.');
        if (!['qr', 'code'].includes(this.status.state)) {
            throw new Error('WhatsApp is not ready to link yet. Wait for the QR code, or restart the connection if startup is stuck.');
        }
        if (this.pairing) throw new Error('A pairing code request is already in progress.');
        const current = this.client;
        this.pairing = true;
        let timer;
        try {
            const code = await Promise.race([
                current.requestPairingCode(normalized),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Pairing code request timed out. Restart the connection before trying again.')), this.pairingTimeoutMs); })
            ]);
            if (current !== this.client || this.status.connected || this.status.state === 'authenticated') {
                throw new Error('The connection changed. Check its status before requesting another code.');
            }
            this.setStatus('code', { pairingCode: code });
            return code;
        } catch (err) {
            if (current === this.client && !this.status.connected && this.status.state !== 'authenticated') {
                this.setStatus('error', { error: err.message });
            }
            throw err;
        } finally {
            clearTimeout(timer);
            this.pairing = false;
        }
    }

    async cancelPairingCode() {
        if (this.pairing) throw new Error('Wait for the pairing request to finish first.');
        if (this.status.state !== 'code') throw new Error('No pairing code is active.');
        const current = this.client;
        this.setStatus('starting');
        this.watchStartup();
        try {
            await current.cancelPairingCode();
        } catch (err) {
            if (current === this.client) this.setStatus('error', { error: err.message });
            throw err;
        }
    }

    async sendMessage(phone, text) {
        if (!this.status.connected) {
            const error = new Error('WhatsApp is not ready. Check the connection in Settings.');
            error.code = 'WHATSAPP_NOT_READY';
            throw error;
        }
        await this.client.sendMessage(`${normalizePhone(phone)}@c.us`, text);
        return true;
    }

    async stop() {
        clearTimeout(this.retryTimer);
        clearTimeout(this.watchdog);
        const previous = this.client;
        this.launchController?.abort();
        this.client = null;
        this.setStatus('starting');
        if (previous) { previous.removeAllListeners(); await previous.destroy(); }
    }
}

export function normalizePhone(phone) {
    if (typeof phone !== 'string' || !/^[+\d\s().-]+$/.test(phone)) throw new Error('Enter a valid phone number with country code.');
    let number = phone.replace(/\D/g, '');
    if (number.startsWith('06') && number.length === 10) number = '31' + number.substring(1);
    else if (number.startsWith('00')) number = number.substring(2);
    if (!/^[1-9]\d{6,14}$/.test(number)) throw new Error('Enter a valid phone number with country code.');
    return number;
}
