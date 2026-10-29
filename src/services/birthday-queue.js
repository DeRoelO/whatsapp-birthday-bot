// One pending task per contact/day. Offline tasks wait until connected, up to midnight.
export class BirthdayQueue {
    constructor({ isConnected, send, isEligible, now = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout }) {
        Object.assign(this, { isConnected, send, isEligible, now, setTimer, clearTimer });
        this.pending = new Map();
    }
    schedule(contact, message, year, delayMs, forceNow = false) {
        const day = this.now().toDateString();
        const key = `${day}:${contact.id}`;
        const existing = this.pending.get(key);
        if (existing) {
            if (!forceNow || existing.running) return false;
            this.clearTimer(existing.timer);
        }
        const task = { contact, message, year, day, forceNow };
        this.pending.set(key, task);
        const arm = delay => {
            task.timer = this.setTimer(() => attempt(), Math.max(0, delay));
        };
        const attempt = async () => {
            if (this.pending.get(key) !== task) return;
            task.running = true;
            let retry = false;
            try {
                if (this.now().toDateString() !== day) return;
                if (!this.isConnected()) { retry = true; return; }
                // Recheck persisted history and current contact/settings before sending.
                if (!await this.isEligible(contact, forceNow)) return;
                if (!this.isConnected()) { retry = true; return; }
                await this.send(contact, message, year);
            } catch (err) {
                if (err.code === 'WHATSAPP_NOT_READY') retry = true;
                else console.error('Birthday Scheduler: Scheduled task failed:', err.message);
            } finally {
                task.running = false;
                if (retry) arm(30000);
                else this.pending.delete(key);
            }
        };
        arm(delayMs);
        return true;
    }
}
