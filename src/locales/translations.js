export const translations = {
    en: {
        nav_dashboard: "Dashboard",
        nav_contacts: "Contacts",
        nav_settings: "Settings",
        
        dashboard_title: "Dashboard",
        dashboard_subtitle: "Overview of the Automated WhatsApp Birthday Bot.",
        sync_contacts: "Sync Contacts",
        force_run: "Force Run Today's Birthdays",
        
        welcome_title: "Welcome to the WhatsApp Birthday Bot!",
        welcome_desc: "It looks like no iCloud credentials have been configured yet. Please go to Settings to enter your CardDAV credentials!",
        
        status_connected: "Connected",
        status_disconnected: "Disconnected",
        scan_qr: "Scan QR Code",
        
        stats_contacts: "Total Contacts",
        stats_birthdays: "Birthdays Today",
        stats_messages: "Messages Sent",
        last_sync: "Last sync",
        never_sync: "Never synced",
        
        upcoming_title: "Upcoming Birthdays",
        upcoming_desc: "Birthdays expected within the next 60 days.",
        logs_title: "Message Logs",
        logs_subtitle: "History of recently sent or attempted automated messages.",
        no_logs: "No messages sent.",
        sent: "Sent",
        failed: "Failed",
        
        calendar_title: "Birthday Calendar",
        calendar_subtitle: "All known birthdays from your contacts.",
        no_birthdays_cal: "No birthdays found in your contact list.",
        
        col_time: "Time",
        col_recipient: "Recipient",
        col_message: "Message",
        col_status: "Status",
        
        automation_title: "Automation & Bot Status",
        enable_scheduler: "Enable automatic daily scheduler",
        include_age: "Include [AGE] if provided by contact info",
        language_selection: "GUI Language",
        
        credentials_title: "iCloud Sync Credentials",
        carddav_url: "iCloud Server URL (CardDAV)",
        apple_id: "Apple ID (Email)",
        app_password: "App-Specific Password",
        
        schedule_title: "Schedule Windows",
        schedule_desc: "The bot picks a random time within the window every day to act more human-like.",
        weekdays: "Weekdays (Mon-Fri)",
        weekends: "Weekends (Sat-Sun)",
        to: "to",
        
        template_title: "Message Templates",
        template_desc: "Separate suggestions by typing them on a **new line (enter)**. Use [NAME] and [AGE] as dynamic variables.",
        with_age: "Messages WITH Age (if known)",
        without_age: "Messages WITHOUT Age (fallback/unknown age)",
        btn_export: "Export",
        btn_import: "Import",
        
        blocklist_title: "Excluded Contacts (Blocklist)",
        blocklist_desc: "Search for a contact to block them from automated messages.",
        
        apple_help_title: "How to create an App-Specific Password",
        apple_help_desc: "Because you have Two-Factor Authentication enabled on your Apple ID, you cannot use your normal Apple password for this bot. Apple requires you to generate a unique 'App-Specific password'.",
        apple_help_step1: "Go to appleid.apple.com and sign in.",
        apple_help_step2: "Click on App-Specific Passwords.",
        apple_help_step3: "Click Generate an app-specific password or the + button.",
        apple_help_step4: "Enter a name (e.g., 'WhatsApp Birthday Bot') and click Create.",
        apple_help_step5: "Copy the generated password and paste it into the field on this page.",
        got_it: "Got it!",
        
        test_success: "Test message sent successfully!",
        test_failed: "Error",
        request_failed: "Request failed. Is your connection down?",
        import_success: "Templates imported successfully! Don't forget to click Save Settings.",
        invalid_json: "Invalid JSON file.",
        
        contacts_title: "Contact Management",
        contacts_subtitle: "Manage merge suggestions and manual contact links with extra insight.",
        tab_suggestions: "Suggestions",
        tab_merges: "Active Merges",
        tab_all: "All Contacts",
        tab_ignored: "Ignored",
        
        no_suggestions: "No new merge suggestions. Everything is clean!",
        no_merges: "No manual merges active yet.",
        no_ignored: "You haven't ignored any suggestions yet.",
        
        keep_master: "Keep as Master",
        ignore: "Ignore",
        restore: "Restore",
        unmerge: "Unmerge",
        
        col_master: "Master Contact",
        col_slave: "Merged From (Slave)",
        col_contact_a: "Contact A",
        col_contact_b: "Contact B",
        col_action: "Action",
        
        search_contacts: "Search contact names, phone, company...",
        reset_db: "Reset Database",
        danger_zone: "Danger Zone",
        danger_desc: "Clear all contacts, merges, and suggestions to start fresh. Settings are kept.",
        
        confirm_unmerge: "Are you sure you want to restore \"[NAME]\" as a separate contact?",
        confirm_reset: "WARNING: This will delete ALL contacts, active merges, and suggestions from the bot's database. Your iCloud sync settings will be preserved. Are you absolutely sure?",
        
        no_birthdays_desc: "No upcoming birthdays found. Try syncing your contacts!",
        
        col_date: "Date",
        col_name: "Name",
        col_age: "Age",
        col_days: "Days Left",
        
        turns: "Turns",
        unknown: "Unknown",
        today: "Today!",
        tomorrow: "Tomorrow",
        in_days: "In [DAYS] days",
        
        success_saved: "Your settings have been saved."
    },
    nl: {
        nav_dashboard: "Dashboard",
        nav_contacts: "Contacten",
        nav_settings: "Instellingen",
        
        automation_title: "Automatisering & Bot Status",
        enable_scheduler: "Schakel dagelijkse scheduler in",
        include_age: "Gebruik [AGE] indien bekend bij contact",
        language_selection: "Taal van de GUI",
        
        credentials_title: "iCloud Sync Gegevens",
        carddav_url: "iCloud Server URL (CardDAV)",
        apple_id: "Apple ID (E-mail)",
        app_password: "App-specifiek Wachtwoord",
        
        schedule_title: "Tijdsvensters",
        schedule_desc: "De bot kiest elke dag een willekeurig tijdstip binnen het venster om menselijker over te komen.",
        weekdays: "Doordeweeks (Ma-Vr)",
        weekends: "Weekend (Za-Zo)",
        to: "tot",
        
        template_title: "Bericht Templates",
        template_desc: "Scheid suggesties door ze op een **nieuwe regel (enter)** te typen. Gebruik [NAME] en [AGE] voor variabelen.",
        with_age: "Berichten MET Leeftijd (indien bekend)",
        without_age: "Berichten ZONDER Leeftijd (fallback)",
        btn_export: "Exporteren",
        btn_import: "Importeren",
        
        blocklist_title: "Uitgesloten Contacten (Blocklist)",
        blocklist_desc: "Zoek een contact om deze te blokkeren voor automatische berichten.",
        
        apple_help_title: "Hoe maak je een App-specifiek wachtwoord?",
        apple_help_desc: "Omdat je Twee-factor-authenticatie hebt ingeschakeld op je Apple ID, kun je niet je normale wachtwoord gebruiken. Apple vereist een uniek 'App-specifiek wachtwoord'.",
        apple_help_step1: "Ga naar appleid.apple.com en log in.",
        apple_help_step2: "Klik op App-specifieke wachtwoorden.",
        apple_help_step3: "Klik op Maak een app-specifiek wachtwoord of de + knop.",
        apple_help_step4: "Voer een naam in (bijv. 'WhatsApp Birthday Bot') en klik op Maak aan.",
        apple_help_step5: "Kopieer het gegenereerde wachtwoord en plak het in het veld op deze pagina.",
        got_it: "Begrepen!",
        
        test_success: "Testbericht succesvol verzonden!",
        test_failed: "Fout",
        request_failed: "Aanvraag mislukt. Is de server bereikbaar?",
        import_success: "Templates succesvol geïmporteerd! Vergeet niet op Instellingen Opslaan te klikken.",
        invalid_json: "Ongeldig JSON bestand.",
        
        dashboard_title: "Dashboard",
        dashboard_subtitle: "Overzicht van de Automatische WhatsApp Verjaardag Bot.",
        sync_contacts: "Contacten Synchroniseren",
        force_run: "Handmatig Verjaardagen Controleren",
        
        welcome_title: "Welkom bij de WhatsApp Verjaardag Bot!",
        welcome_desc: "Het lijkt erop dat er nog geen iCloud gegevens zijn ingesteld. Ga naar Instellingen om je CardDAV gegevens in te voeren!",
        
        status_connected: "Verbonden",
        status_disconnected: "Niet verbonden",
        scan_qr: "Scan QR Code",
        
        stats_contacts: "Totaal Contacten",
        stats_birthdays: "Verjaardagen Vandaag",
        stats_messages: "Berichten Verstuurd",
        last_sync: "Laatste sync",
        never_sync: "Nooit gesynchroniseerd",
        
        upcoming_title: "Aankomende Verjaardagen",
        upcoming_desc: "Verjaardagen verwacht in de komende 60 dagen.",
        no_birthdays_desc: "Geen aankomende verjaardagen gevonden. Probeer je contacten te syncen!",
        
        col_date: "Datum",
        col_name: "Naam",
        col_age: "Leeftijd",
        col_days: "Dagen te gaan",
        
        turns: "Wordt",
        unknown: "Onbekend",
        today: "Vandaag!",
        tomorrow: "Morgen",
        in_days: "Over [DAYS] dagen",
        
        success_saved: "Je instellingen zijn opgeslagen."
    }
};
