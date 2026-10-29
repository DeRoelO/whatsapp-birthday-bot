(() => {
    const el = id => document.getElementById(id);
    let busy = false;
    let status = {};
    const labels = {
        starting: 'WhatsApp wordt gestart...',
        qr: 'Scan de QR-code of vraag een koppelcode aan.',
        code: 'Vul de koppelcode in op je telefoon.',
        authenticated: 'Aangemeld. WhatsApp laadt je sessie; verzenden is nog niet mogelijk.',
        ready: 'Verbonden en klaar om berichten te versturen.',
        reconnecting: 'De verbinding wordt opnieuw gestart...',
        error: 'WhatsApp kon niet worden gestart. Bekijk de melding hieronder.'
    };
    function render(data) {
        status = data;
        el('waStatusText').textContent = labels[data.state] || 'Verbindingsstatus onbekend.';
        el('waConnectionError').textContent = data.error || '';
        el('waLinkOptions').hidden = data.connected;
        el('btnRequestPairCode').disabled = busy || !['qr', 'code'].includes(data.state);
        el('waUseQr').hidden = data.state !== 'code';
        el('waUseQr').disabled = busy;
        el('waRestart').disabled = busy;
        const image = el('waQrImage');
        image.hidden = !data.qrUrl;
        if (data.qrUrl && image.getAttribute('src') !== data.qrUrl) image.src = data.qrUrl;
        if (!data.qrUrl) image.removeAttribute('src');
        const code = data.pairingCode || '';
        el('waPairCodeResult').textContent = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
        el('waQrHelp').hidden = Boolean(data.qrUrl);
    }
    async function post(url, body) {
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}), signal: AbortSignal.timeout(40000)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Deze actie is niet gelukt.');
        return data;
    }
    async function refresh() {
        const response = await fetch('/api/whatsapp/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Verbindingsstatus ophalen mislukt.');
        render(await response.json());
    }
    async function action(url, body) {
        busy = true;
        el('waPairError').textContent = '';
        render(status);
        try {
            await post(url, body);
            await refresh();
        } catch (err) {
            el('waPairError').textContent = err.message;
        } finally {
            busy = false;
            render(status);
        }
    }
    el('btnRequestPairCode').addEventListener('click', () => action('/api/whatsapp/pair', { phone: el('waPairPhone').value.trim() }));
    el('waRestart').addEventListener('click', () => action('/api/whatsapp/restart'));
    el('waUseQr').addEventListener('click', () => action('/api/whatsapp/qr'));
    async function poll() {
        try { await refresh(); }
        catch { el('waConnectionError').textContent = 'Geen verbinding met de bot. We proberen het opnieuw.'; }
        setTimeout(poll, 3000);
    }
    poll();
})();
