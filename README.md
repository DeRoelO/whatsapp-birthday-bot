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

1. Open the dashboard at `http://localhost:3000` and go to **Settings**.
2. Fill in your iCloud credentials, schedule and message templates.
3. Click **WhatsApp koppelen** in the navigation, or open `http://localhost:3000/settings#whatsapp`. The old `/qr` URL redirects here.
4. Scan the QR code using WhatsApp's **Linked devices > Link a device**, or enter your own WhatsApp number (including country code) and click **Koppelcode aanvragen**. On your phone choose the option to link with a phone number and enter the code. Refreshed codes appear automatically.
5. Wait for **Verbonden en klaar om berichten te versturen** before sending a test message. Authentication alone does not mean WhatsApp is ready.

The phone-code button becomes available when WhatsApp has loaded the linking screen. If startup or restoring a session stalls, Settings shows an error after two minutes. Use **Verbinding opnieuw starten** to restart the browser while preserving the saved session. Container logs provide additional browser errors. The bot loads the current WhatsApp Web app instead of a fixed historical HTML snapshot.

Automatic birthday tasks wait while WhatsApp is offline and recheck every 30 seconds until the end of the same local day. Pending tasks are kept in memory; startup reconstructs today's unsent birthdays after a restart. The bot rechecks current contact data, exclusions, scheduler settings and sending history before sending. It does not automatically retry ambiguous delivery errors, to avoid duplicate messages.

### Updating an existing installation

Back up `data/` and `.wwebjs_auth/` before upgrading. In your existing checkout:

```sh
git pull
docker compose up -d --build
docker compose logs --tail=100 -f bot
```

The existing bind mounts retain the database and WhatsApp session. Do not delete these folders to resolve a synchronization or startup error. The Docker image uses Node.js 24 on Debian Bookworm and Google Chrome for Linux amd64. Native development requires Node.js 22 or later; Node.js 24 is recommended.

### Validation

```sh
PUPPETEER_SKIP_DOWNLOAD=true npm ci
npm test
docker build -t whatsapp-birthday-bot-test .
```

Tests use temporary databases and fake WhatsApp clients; they never send real messages. CI runs the tests on Node.js 24 and validates the Docker build for pull requests.

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
