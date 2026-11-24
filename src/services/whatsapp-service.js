const BROWSER_ERROR_RE = /timed out|protocol error|target closed|session closed|execution context was destroyed|detached/i;

// Dependency injection keeps lifecycle and pairing behavior testable without a real account.
export class WhatsAppService {
    constructor({
        createClient,
        qrToDataUrl,
        clearLocks = () => {},
        timeoutMs = 120000,
        pairingTimeoutMs = 30000,
        idleTimeoutMs = 120000,
        retryDelayMs = 10000,
        destroyTimeoutMs = 15000
    }) {
        Object.assign(this, { createClient, qrToDataUrl, clearLocks, timeoutMs, pairingTimeoutMs, idleTimeoutMs, retryDelayMs, destroyTimeoutMs });
        this.client = null;
        this.activeSends = 0;
        this.readyWaiters = [];
        this.status = { state: 'starting', connected: false, qrUrl: null, pairingCode: null, error: null };
    }

    getStatus() { return { ...this.status }; }
    isAvailable() { return this.status.connected || this.status.state === 'idle'; }

    setStatus(state, extra = {}) {
        this.status = { state, connected: state === 'ready', qrUrl: null, pairingCode: null, error: null, ...extra };
        if (state === 'ready') {
            this.resolveWaiters();
            this.scheduleIdle();
        } else if (['qr', 'code', 'error'].includes(state)) {
            this.rejectWaiters(this.status.error || 'WhatsApp is not ready. Check the connection in Settings.');
        }
    }

    resolveWaiters() {
        const waiters = this.readyWaiters.splice(0);
        for (const w of waiters) w.resolve(true);
    }

    rejectWaiters(message) {
        const waiters = this.readyWaiters.splice(0);
        for (const w of waiters) {
            const err = new Error(message);
            err.code = 'WHATSAPP_NOT_READY';
            w.reject(err);
        }
    }

    scheduleIdle() {
        clearTimeout(this.idleTimer);
        if (!this.idleTimeoutMs || this.idleTimeoutMs <= 0) return;
        if (this.status.state !== 'ready' || this.activeSends > 0) return;
        this.idleTimer = setTimeout(() => {
            this.sleep().catch(err => console.error('WhatsApp: Failed to enter sleep mode:', err.message));
        }, this.idleTimeoutMs);
        this.idleTimer.unref?.();
    }

    async destroyClient(client) {
        if (!client) return;
        client.removeAllListeners();
        let timer;
        try {
            await Promise.race([
                client.destroy(),
                new Promise(resolve => {
                    timer = setTimeout(resolve, this.destroyTimeoutMs);
                    timer.unref?.();
                })
            ]);
        } catch (err) {
            console.warn('WhatsApp: Error while closing browser:', err?.message || err);
        } finally {
            clearTimeout(timer);
        }
    }

    async sleep() {
        if (this.status.state !== 'ready' || this.activeSends > 0 || this.starting) return;
        clearTimeout(this.idleTimer);
        clearTimeout(this.watchdog);
        clearTimeout(this.retryTimer);
        const previous = this.client;
        this.launchController?.abort();
        this.client = null;
        this.setStatus('idle');
        await this.destroyClient(previous);
        this.clearLocks();
        console.log('WhatsApp: Session put to sleep to save RAM (will wake automatically when needed).');
    }

    scheduleRetry(error, state = 'reconnecting') {
        clearTimeout(this.watchdog);
        clearTimeout(this.idleTimer);
        this.setStatus(state, { error });
        console.error('WhatsApp:', error);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
            this.start().catch(err => this.setStatus('error', { error: err.message }));
        }, this.retryDelayMs);
        this.retryTimer.unref?.();
    }

    watchStartup() {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
            if (!this.status.connected && this.status.state !== 'idle') {
                this.scheduleRetry(
                    'WhatsApp is taking too long to start or restore the session. Restarting automatically...',
                    'error'
                );
            }
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
        clearTimeout(this.idleTimer);
        this.setStatus('starting');
        const previous = this.client;
        this.launchController?.abort();
        this.client = null; // Ignore events from a closing client.
        await this.destroyClient(previous);
        this.clearLocks();
        this.launchController = new AbortController();
        const current = this.createClient({ signal: this.launchController.signal });
        this.client = current;
        const active = () => this.client === current;
        const retry = (error) => {
            if (!active()) return;
            this.scheduleRetry(error, 'reconnecting');
        };
        current.on('qr', async qr => {
            if (!active() || ['ready', 'authenticated', 'code', 'reconnecting'].includes(this.status.state)) return;
            clearTimeout(this.watchdog);
            clearTimeout(this.retryTimer);
            clearTimeout(this.idleTimer);
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
                if (!active()) await this.destroyClient(current);
            });
    }

    async ensureReady(waitMs = this.timeoutMs) {
        if (this.status.connected) {
            clearTimeout(this.idleTimer);
            return true;
        }
        if (['qr', 'code'].includes(this.status.state)) {
            const error = new Error('WhatsApp is not ready. Link your account in Settings first.');
            error.code = 'WHATSAPP_NOT_READY';
            throw error;
        }
        if (this.status.state === 'idle' || this.status.state === 'error' || !this.client) {
            console.log('WhatsApp: Waking up session...');
            await this.start();
            if (this.status.connected) {
                clearTimeout(this.idleTimer);
                return true;
            }
        }
        return new Promise((resolve, reject) => {
            const waiter = { resolve: null, reject: null };
            const timer = setTimeout(() => {
                const idx = this.readyWaiters.indexOf(waiter);
                if (idx !== -1) this.readyWaiters.splice(idx, 1);
                const err = new Error('Timed out waiting for WhatsApp to become ready.');
                err.code = 'WHATSAPP_NOT_READY';
                reject(err);
            }, waitMs);
            timer.unref?.();
            waiter.resolve = (val) => { clearTimeout(timer); resolve(val); };
            waiter.reject = (err) => { clearTimeout(timer); reject(err); };
            this.readyWaiters.push(waiter);
        });
    }

    async keepAlive() {
        console.log('WhatsApp: Keep-alive check starting...');
        try {
            await this.ensureReady();
            console.log('WhatsApp: Keep-alive check succeeded; session will return to sleep automatically.');
            this.scheduleIdle();
            return true;
        } catch (err) {
            console.error('WhatsApp: Keep-alive check failed:', err.message);
            return false;
        }
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
        const normalized = normalizePhone(phone);
        if (this.status.state === 'idle') {
            await this.ensureReady();
        } else if (!this.status.connected) {
            const error = new Error('WhatsApp is not ready. Check the connection in Settings.');
            error.code = 'WHATSAPP_NOT_READY';
            throw error;
        }
        this.activeSends++;
        clearTimeout(this.idleTimer);
        try {
            await this.client.sendMessage(`${normalized}@c.us`, text);
            return true;
        } catch (err) {
            if (BROWSER_ERROR_RE.test(err?.message || '')) {
                this.scheduleRetry(`Send failed due to browser error (${err.message}). Restarting...`, 'reconnecting');
                const retryErr = new Error(`WhatsApp browser stalled (${err.message}); restarting to retry.`);
                retryErr.code = 'WHATSAPP_NOT_READY';
                throw retryErr;
            }
            throw err;
        } finally {
            this.activeSends--;
            this.scheduleIdle();
        }
    }

    async stop() {
        clearTimeout(this.retryTimer);
        clearTimeout(this.watchdog);
        clearTimeout(this.idleTimer);
        this.rejectWaiters('WhatsApp service stopped.');
        const previous = this.client;
        this.launchController?.abort();
        this.client = null;
        this.setStatus('starting');
        await this.destroyClient(previous);
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
