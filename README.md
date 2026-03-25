# 🎂 Automated WhatsApp Birthday Bot

A robust, headless Node.js application that synchronizes your iCloud contacts via CardDAV and automatically sends personalized birthday wishes via WhatsApp Web. 
It runs completely locally in a Docker container and features a built-in ExpressJS dashboard to monitor scheduled messages, view logs, and securely link your WhatsApp account.

---

## ✨ Features

- **🍏 iCloud (CardDAV) Sync:** Automatically fetches your contacts periodically to make sure nobody is left out.
- **👯‍♂️ Deduplication:** Merges and normalises phone numbers automatically so duplicate contacts won't receive double messages.
- **🤖 Headless WhatsApp Web:** Uses Puppeteer & `whatsapp-web.js` to run WhatsApp directly from a Docker container.
- **🎭 Human-like Timing:** Schedules messages randomly within a realistic timeframe:
  - Weekdays: between `06:30 - 07:30`
  - Weekends: between `08:30 - 09:30`
- **🎉 Dynamic Messages:** Randomly selects from 15 custom birthday templates, adapting text automatically with the `[Nickname]` (or First Name) and exact `[Age]` calculation based on the contact's birth year.
- **📊 Web GUI / Dashboard:** A clean Bootstrap 5 web interface allowing you to see WhatsApp connection status, view a calendar of upcoming birthdays, and check historical message logs.

---

## 🏗️ Technology Stack

- **Backend:** Node.js (ES Modules)
- **GUI Server:** Express.js + EJS Templates + Bootstrap 5
- **WhatsApp API:** [whatsapp-web.js](https://wwebjs.dev/)
- **Contact Sync:** [tsdav](https://github.com/natrim/tsdav) for CardDAV protocols
- **Database:** SQLite3
- **Containerization:** Docker & Docker Compose

---

## 🚀 Installation & Setup

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose installed.
- An Apple ID with CardDAV contacts.
- An **Apple App-Specific Password**. You can create one via [appleid.apple.com](https://appleid.apple.com/).
- A WhatsApp account on your phone to link to the headless browser.

### 1. Clone the repository
```bash
git clone https://github.com/YourUsername/whatsapp-birthday-bot.git
cd whatsapp-birthday-bot
```

### 2. Configure Environment Variables
Copy the example environment file and edit the configuration:
```bash
cp .env.example .env
```
Open `.env` and fill in your details:
```env
PORT=3000

# iCloud CardDAV configuration
CARDDAV_URL=https://contacts.icloud.com/
CARDDAV_USERNAME=your-apple-id@icloud.com
CARDDAV_PASSWORD=your-app-specific-password
```

### 3. Deploy via Docker Compose
Run the following command to build the image and bring the container up in detached mode:
```bash
docker-compose up -d --build
```
*Note: The first build might take a minute or two as it installs the required Chromium dependencies for the headless browser.*

---

## 📲 Usage & Linking WhatsApp

1. Open your browser and navigate to the web GUI: `http://localhost:3000`
2. Go to the **WhatsApp** tab (`http://localhost:3000/qr`).
3. Open WhatsApp on your smartphone, go to **Linked Devices > Link a Device**, and scan the QR code displayed on the webpage.
4. Once the QR code is successfully scanned, the status will update to **Connected**. The session is persistently stored inside the `.wwebjs_auth` Docker volume, meaning it survives container restarts!
5. Check out the **Calendar** tab to verify that your contacts have been synced correctly.

---

## 📂 Project Structure

```text
├── src/
│   ├── db/
│   │   └── database.js       # SQLite connections and helper queries
│   ├── services/
│   │   ├── whatsapp.js       # WhatsApp-web.js client and QR logic
│   │   ├── sync.js           # iCloud CardDAV fetching and vCard parsing
│   │   └── birthday.js       # Birthday scheduling, templates, and CRON logic
│   ├── views/                # EJS templates for the Web GUI
│   └── index.js              # Application entry point & setup
├── .env.example              # Credentials template
├── docker-compose.yml        # Docker composition and volumes
├── Dockerfile                # Environment recipe for Node.js + Puppeteer
└── package.json              # NPM dependencies
```

---

## 🛡️ Security & Privacy Notice
- **Local Everything:** This bot does not send your contact data or messages to any external API. Everything happens locally via the WhatsApp Web protocol and your iCloud.
- **Session Keys:** Your WhatsApp session keys are stored locally within the `/.wwebjs_auth` volume. Do not share this folder with anyone.
- **Git Ignore:** The `.gitignore` file ensures your database (`/data/database.sqlite`), `.env` file, and authentication keys are completely isolated and never pushed to GitHub.

---

## 🤝 Contributing
Feel free to open an issue or submit a pull request if you'd like to add new template messages, webhooks, or support for Google Contacts.

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
