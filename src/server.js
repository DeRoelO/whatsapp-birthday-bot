import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as wa from './services/whatsapp.js';
import { 
    getStats, getLogs, getSetting, getAllSettings, getUpcomingBirthdays, 
    addLog, setSetting, getAllContacts, getMergeSuggestions, getManualMerges,
    addManualMerge, removeManualMerge, updateSuggestionStatus, resetDatabase,
    getIgnoredSuggestions
} from './db/database.js';
import { checkAndScheduleBirthdays } from './services/birthday.js';
import { syncContacts } from './services/sync.js';

import { translations } from './locales/translations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Translation Middleware
app.use(async (req, res, next) => {
    const lang = await getSetting('language', 'en');
    res.locals.t = translations[lang] || translations.en;
    res.locals.currentLang = lang;
    next();
});

app.get('/', async (req, res) => {
    try {
        const stats = await getStats();
        const connected = wa.isConnected();
        const settings = await getAllSettings();
        const upcoming = await getUpcomingBirthdays(60);
        res.render('index', { stats, connected, settings, upcoming, page: 'dashboard' });
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

// GET Settings Page
app.get('/settings', async (req, res) => {
    try {
        const settings = await getAllSettings();
        
        const config = {
            carddav_url: settings.carddav_url || 'https://contacts.icloud.com/',
            carddav_username: settings.carddav_username || '',
            carddav_password: settings.carddav_password || '',
            scheduler_enabled: settings.scheduler_enabled || 'true',
            include_age: settings.include_age || 'true',
            weekday_start: settings.weekday_start || '06:30',
            weekday_end: settings.weekday_end || '07:30',
            weekend_start: settings.weekend_start || process.env.SCHEDULE_WEEKEND_START || '08:30',
            weekend_end: settings.weekend_end || process.env.SCHEDULE_WEEKEND_END || '09:30',
            templates_with_age: settings.templates_with_age || "Hi [NAAM], wishing you a very happy [LEEFTIJD]th birthday!\nHappy Birthday [NAAM]! I hope you have a wonderful [LEEFTIJD]th birthday.",
            templates_without_age: settings.templates_without_age || "Hi [NAAM], wishing you a very happy birthday!\nHappy Birthday [NAAM]! I hope you have a wonderful birthday.",
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

// API endpoint for text message
app.post('/api/test-message', async (req, res) => {
    const phone = req.body.phone;
    const text = "🤖 Hello! This is a test message from your WhatsApp Birthday Bot. If you receive this, the connection is working perfectly!";
    try {
        if (!phone) throw new Error("Phone number is required.");
        await wa.sendMessage(phone, text);
        await addLog(null, phone, 'Test Message', text, 'success');
        res.json({ success: true });
    } catch (err) {
        if (phone) await addLog(null, phone, 'Test Message', text, `failed: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API endpoint for WhatsApp connection status and QR code
app.get('/api/whatsapp/status', (req, res) => {
    res.json({
        connected: wa.isConnected(),
        qrUrl: wa.getQrCodeDataUrl()
    });
});


// Contacts Management Page
app.get('/contacts', async (req, res) => {
    try {
        const stats = await getStats();
        const lastSync = await getSetting('last_sync', 'Never');
        const suggestions = await getMergeSuggestions();
        const ignoredSuggestions = await getIgnoredSuggestions();
        const manualMerges = await getManualMerges();
        const allContacts = await getAllContacts();

        res.render('contacts', {
            stats,
            lastSync,
            suggestions,
            ignoredSuggestions,
            manualMerges,
            allContacts,
            page: 'contacts'
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// API: Approve Merge
app.post('/api/merges', async (req, res) => {
    try {
        const { masterId, slaveId } = req.body;
        await addManualMerge(masterId, slaveId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Unmerge
app.delete('/api/merges/:slaveId', async (req, res) => {
    try {
        await removeManualMerge(req.params.slaveId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Ignore Suggestion
app.post('/api/suggestions/:id/ignore', async (req, res) => {
    try {
        await updateSuggestionStatus(req.params.id, 'ignored');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Unignore Suggestion
app.post('/api/suggestions/:id/unignore', async (req, res) => {
    try {
        await updateSuggestionStatus(req.params.id, 'pending');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Reset Database
app.post('/api/database/reset', async (req, res) => {
    try {
        await resetDatabase();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API endpoint for search/autocomplete
app.get('/api/contacts', async (req, res) => {
    try {
        const contacts = await getAllContacts();
        res.json(contacts);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export const startServer = (port) => {
    app.listen(port, () => {
        console.log(`Web GUI running on port ${port}`);
    });
};
