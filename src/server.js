import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStats, getUpcomingBirthdays, getLogs, getAllSettings, setSetting } from './db/database.js';
import * as wa from './services/whatsapp.js';
import { syncContacts } from './services/sync.js';
import { checkAndScheduleBirthdays } from './services/birthday.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', async (req, res) => {
    try {
        const stats = await getStats();
        const connected = wa.isConnected();
        res.render('index', { stats, connected, page: 'dashboard' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/calendar', async (req, res) => {
    try {
        const upcoming = await getUpcomingBirthdays(60);
        res.render('calendar', { upcoming, page: 'calendar' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/logs', async (req, res) => {
    try {
        const logs = await getLogs(100);
        res.render('logs', { logs, page: 'logs' });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/qr', (req, res) => {
    const connected = wa.isConnected();
    const qrCodeUrl = wa.getQrCodeDataUrl();
    res.render('qr', { connected, qrCodeUrl, page: 'qr' });
});

// GET Settings Page
app.get('/settings', async (req, res) => {
    try {
        const settings = await getAllSettings();
        
        const config = {
            carddav_url: settings.carddav_url || process.env.CARDDAV_URL || '',
            carddav_username: settings.carddav_username || process.env.CARDDAV_USERNAME || '',
            carddav_password: settings.carddav_password || process.env.CARDDAV_PASSWORD || '',
            scheduler_enabled: settings.scheduler_enabled || process.env.SCHEDULER_ENABLED || 'true',
            include_age: settings.include_age || process.env.INCLUDE_AGE || 'true',
            weekday_start: settings.weekday_start || process.env.SCHEDULE_WEEKDAY_START || '06:30',
            weekday_end: settings.weekday_end || process.env.SCHEDULE_WEEKDAY_END || '07:30',
            weekend_start: settings.weekend_start || process.env.SCHEDULE_WEEKEND_START || '08:30',
            weekend_end: settings.weekend_end || process.env.SCHEDULE_WEEKEND_END || '09:30',
            templates_with_age: settings.templates_with_age || "Hoi [NAAM], van harte gefeliciteerd met je [LEEFTIJD]e verjaardag!\nGefeliciteerd [NAAM]! Ik wens je een hele fijne [LEEFTIJD]e verjaardag toe.",
            templates_without_age: settings.templates_without_age || "Hoi [NAAM], van harte gefeliciteerd met je verjaardag!\nGefeliciteerd [NAAM]! Ik wens je een hele fijne verjaardag toe.",
            excluded_contacts: settings.excluded_contacts || ""
        };

        const connected = wa.isConnected();
        res.render('settings', { config, connected, page: 'settings', saved: req.query.saved });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// POST Save Settings
app.post('/settings', async (req, res) => {
    try {
        const keys = [
            'carddav_url', 'carddav_username', 'carddav_password', 
            'scheduler_enabled', 'include_age', 
            'weekday_start', 'weekday_end', 'weekend_start', 'weekend_end',
            'templates_with_age', 'templates_without_age', 'excluded_contacts'
        ];
        
        const data = { ...req.body };
        // HTML checkboxes only send when checked
        data.scheduler_enabled = data.scheduler_enabled ? 'true' : 'false';
        data.include_age = data.include_age ? 'true' : 'false';

        for (const key of keys) {
            if (data[key] !== undefined) {
                await setSetting(key, data[key]);
            }
        }
        res.redirect('/settings?saved=true');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// API endpoint for manual sync
app.post('/api/sync', async (req, res) => {
    try {
        const result = await syncContacts();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API endpoint for manual send today
app.post('/api/send-today', async (req, res) => {
    try {
        const result = await checkAndScheduleBirthdays(true);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export const startServer = (port) => {
    app.listen(port, () => {
        console.log(`Web GUI running on port ${port}`);
    });
};
