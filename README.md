# Automated WhatsApp Birthday Bot

A robust, headless Node.js application that synchronizes your iCloud contacts via CardDAV and automatically sends personalized birthday wishes via WhatsApp Web. 
It runs completely locally in a Docker container and features a built-in ExpressJS dashboard to monitor scheduled messages, configure settings, exclude contacts, and securely link your WhatsApp account.
**Zero configuration required before starting!**

---

## Features

- **Multi-Language GUI:** Support for both **English** and **Dutch**. Toggle language instantly from the Settings page.
- **Zero-Config Startup:** Just spin up the Docker container. All configurations are handled through a friendly Web UI.
- **iCloud (CardDAV) Sync:** Automatically fetches your contacts periodically to make sure nobody is left out.
- **Advanced Contact Management:**
    - **Merge Suggestions:** Automatically identifies duplicate contacts and suggests merges.
    - **Master Selection:** Choose which contact's details (name/photo) to keep during a merge.
    - **Ignored Suggestions:** Review and restore previously ignored merge suggestions.
    - **Enhanced Matching:** Intelligent substring and fuzzy matching to catch variants while avoiding false positives.
- **Headless WhatsApp Web:** Uses Puppeteer to run WhatsApp securely and seamlessly from a Docker container.
- **Human-like Timing:** Schedules messages randomly within a configurable realistic timeframe.
- **Dynamic Messages:** Set multiple template messages. The bot dynamically replaces the `[NAME]` and `[AGE]` variables. Common Dutch placeholders (`[NAAM]`, `[LEEFTIJD]`) are still supported for backward compatibility.
- **Exclusion List:** Blacklist specific contacts from ever receiving automated messages.
- **Centralized Dashboard:** A clean Bootstrap 5 web interface. From the GUI you can verify connection status, manage contacts, view logs, and edit preferences.

---

## Quickstart

### Prerequisites
- Docker & Docker Compose installed.
- An Apple ID with CardDAV contacts.
- An Apple App-Specific Password (created via appleid.apple.com).
- A WhatsApp account on your smartphone to link to the headless browser.

### 1. Clone & Start
```bash
git clone https://github.com/DeRoelO/whatsapp-birthday-bot.git
cd whatsapp-birthday-bot
docker-compose up -d --build
```
*Note: The first build might take a minute or two as it installs the required Chromium dependencies for the headless browser.*

### 2. Configure via the Web GUI
1. Open your browser and navigate to the web GUI: `http://localhost:3000`
2. Go to the **Settings** tab to:
    - Fill in your iCloud credentials.
    - Choose your preferred language (English or Dutch).
    - Link your WhatsApp account by scanning the QR code displayed in the **WhatsApp Connection** card.
    - Define your message templates and schedule.
3. Use the **Contacts** tab to:
    - Review and approve merge suggestions for duplicate contacts.
    - Search through all contacts and manage the exclusion list.
4. The bot will now automatically sync contacts and schedule birthday wishes!

---

## Project Structure

```text
├── src/
│   ├── db/
│   │   └── database.js       # SQLite connections, settings and helper queries
│   ├── services/
│   │   ├── whatsapp.js       # WhatsApp-web.js client and QR logic
│   │   ├── sync.js           # iCloud CardDAV fetching and vCard parsing
│   │   └── birthday.js       # Birthday scheduling, exclusion validation and CRON logic
│   ├── views/                # EJS templates for the Web GUI
│   └── index.js              # Application entry point & setup
├── docker-compose.yml        # Docker composition and volumes
├── Dockerfile                # Environment recipe for Node.js + Puppeteer
└── package.json              # NPM dependencies
```

---

## Security & Privacy Notice
- **Local Everything:** This bot does not send your contact data or messages to any external API. Everything happens locally via the WhatsApp Web protocol and your iCloud.
- **Session Keys & Configs:** Your WhatsApp session keys and SQLite database (which stores the credentials entered in the UI) are stored safely inside local volumes (`/data` and `/.wwebjs_auth`). Do not share these folders.
- **Git Ignore:** The `.gitignore` file ensures your database and authentication keys are completely isolated and never accidentally pushed to GitHub.

---

## Contributing
Feel free to open an issue or submit a pull request if you'd like to add new template messages, webhooks, or support for Google Contacts.

## License
This project is open-source and available under the MIT License.
