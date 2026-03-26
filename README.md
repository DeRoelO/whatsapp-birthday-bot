# Automated WhatsApp Birthday Bot

A robust, headless Node.js application that synchronizes your iCloud contacts via CardDAV and automatically sends personalized birthday wishes via WhatsApp Web. 
It runs completely locally in a Docker container and features a built-in ExpressJS dashboard to monitor scheduled messages, configure settings, exclude contacts, and securely link your WhatsApp account.
**Zero configuration required before starting!**

---

## Features

- **Zero-Config Startup:** Just spin up the Docker container. All configurations are handled through a friendly Web UI.
- **iCloud (CardDAV) Sync:** Automatically fetches your contacts periodically to make sure nobody is left out.
- **Deduplication:** Merges and normalises phone numbers automatically so duplicate contacts won't receive double messages.
- **Headless WhatsApp Web:** Uses Puppeteer to run WhatsApp securely and seamlessly from a Docker container.
- **Human-like Timing:** Schedules messages randomly within a configurable realistic timeframe (e.g. 06:30-07:30 on weekdays and 08:30-09:30 on weekends).
- **Dynamic Messages:** Set multiple template messages. The bot dynamically replaces the `[NAAM]` and `[LEEFTIJD]` variables based on the contact's details. You can provide specific templates for contacts with or without a known age.
- **Exclusion List:** Blacklist specific contacts (by name or phone number) from ever receiving automated messages.
- **Web GUI / Dashboard:** A clean Bootstrap 5 web interface. From the GUI you can verify connection status, view a calendar of upcoming birthdays, trigger manual syncs/sends, and edit configuration preferences.

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
2. Go to the **Settings** tab. Fill in your iCloud credentials, set your preferred schedule, and define your message templates.
3. Go to the **WhatsApp** tab (`http://localhost:3000/qr`).
4. Open WhatsApp on your smartphone, go to **Linked Devices > Link a Device**, and scan the QR code displayed on the webpage.
5. Once the QR code is successfully scanned, the status will update to **Connected**. The session and settings are persistently stored inside Docker volumes, meaning they survive container restarts!

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
