/**
 * anchemeno — Logica Popup UI
 */

const DEFAULT_DOMAIN = 'ilpost.it';

const toggleEnabledEl = document.getElementById('toggle-enabled');
const statusPillEl = document.getElementById('status-pill');
const parenCounterEl = document.getElementById('paren-counter');
const siteHintEl = document.getElementById('site-hint');
const domainInputEl = document.getElementById('domain-input');
const saveDomainBtnEl = document.getElementById('save-domain-btn');
const useCurrentSiteBtnEl = document.getElementById('use-current-site-btn');

let activeTabId = null;
let activeTabHostname = '';

/**
 * Estrae il dominio pulito da un URL o stringa di dominio
 */
function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let cleaned = input.trim().toLowerCase();
  if (cleaned === '*') return '*';
  cleaned = cleaned.replace(/^[a-z]+:\/\//i, '');
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  if (cleaned.startsWith('www.')) {
    cleaned = cleaned.slice(4);
  }
  return cleaned;
}

/**
 * Aggiorna i controlli visivi del popup in base allo stato ricevuto
 */
function renderStatus({ enabled, isMatchedSite, articleCount, parenCount, hostname }) {
  toggleEnabledEl.checked = Boolean(enabled);

  if (enabled && isMatchedSite) {
    statusPillEl.textContent = 'Parentesi nascoste';
    statusPillEl.classList.remove('is-off');
  } else if (!enabled) {
    statusPillEl.textContent = 'Testo visibile';
    statusPillEl.classList.add('is-off');
  } else {
    statusPillEl.textContent = 'Inattivo su questo sito';
    statusPillEl.classList.add('is-off');
  }

  parenCounterEl.textContent = String(parenCount ?? 0);

  if (!hostname) {
    siteHintEl.textContent = 'Apri una pagina web per filtrare i tag <article>.';
  } else if (!isMatchedSite) {
    siteHintEl.textContent = `Scheda corrente (${hostname}) diversa dal dominio configurato.`;
  } else if (!articleCount) {
    siteHintEl.textContent = `Attivo su ${hostname} — nessun tag <article> in questa pagina.`;
  } else {
    siteHintEl.textContent = enabled
      ? `Attivo su ${hostname} (${articleCount} <article> analizzati).`
      : `Filtro in pausa su ${hostname}: tutte le parentesi sono visibili.`;
  }
}

/**
 * Invia un messaggio al content script della scheda attiva e aggiorna la UI
 */
async function syncWithActiveTab(messagePayload) {
  if (!activeTabId) return;
  try {
    const response = await chrome.tabs.sendMessage(activeTabId, messagePayload);
    if (response) {
      renderStatus({
        enabled: response.enabled,
        isMatchedSite: response.isMatchedSite,
        articleCount: response.articleCount,
        parenCount: response.parenCount,
        hostname: activeTabHostname
      });
    }
  } catch (_err) {
    // La scheda corrente potrebbe essere chrome:// o non avere ancora il content script caricato
    const stored = await chrome.storage.local.get({
      enabled: true,
      targetDomain: DEFAULT_DOMAIN
    });
    const isMatched =
      Boolean(activeTabHostname) &&
      stored.targetDomain
        .split(',')
        .map(normalizeDomain)
        .some(d => d === '*' || activeTabHostname === d || activeTabHostname.endsWith('.' + d));

    renderStatus({
      enabled: stored.enabled,
      isMatchedSite: isMatched,
      articleCount: 0,
      parenCount: 0,
      hostname: activeTabHostname
    });
  }
}

/**
 * Salva il dominio configurato e aggiorna la scheda attiva
 */
async function saveDomain(newDomainRaw) {
  const cleanedList = newDomainRaw
    .split(',')
    .map(normalizeDomain)
    .filter(Boolean)
    .join(', ');

  const targetDomain = cleanedList || DEFAULT_DOMAIN;
  domainInputEl.value = targetDomain;

  try {
    await chrome.storage.local.set({ targetDomain });
    await syncWithActiveTab({
      type: 'UPDATE_SETTINGS',
      targetDomain
    });
  } catch (err) {
    console.error('[anchemeno] Errore salvataggio dominio:', err);
  }
}

toggleEnabledEl.addEventListener('change', async () => {
  const enabled = toggleEnabledEl.checked;
  try {
    await chrome.storage.local.set({ enabled });
    await syncWithActiveTab({
      type: 'UPDATE_SETTINGS',
      enabled
    });
  } catch (err) {
    console.error('[anchemeno] Errore cambio stato:', err);
  }
});

saveDomainBtnEl.addEventListener('click', async () => {
  await saveDomain(domainInputEl.value);
});

domainInputEl.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    await saveDomain(domainInputEl.value);
  }
});

useCurrentSiteBtnEl.addEventListener('click', async () => {
  if (!activeTabHostname) return;
  await saveDomain(activeTabHostname);
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const stored = await chrome.storage.local.get({
      enabled: true,
      targetDomain: DEFAULT_DOMAIN
    });

    toggleEnabledEl.checked = Boolean(stored.enabled);
    domainInputEl.value = stored.targetDomain || DEFAULT_DOMAIN;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      activeTabId = tab.id;
      if (tab.url && /^https?:/i.test(tab.url)) {
        activeTabHostname = normalizeDomain(new URL(tab.url).hostname);
      }
    }

    if (!activeTabHostname) {
      useCurrentSiteBtnEl.disabled = true;
    }

    await syncWithActiveTab({ type: 'GET_STATUS' });
  } catch (err) {
    console.error('[anchemeno] Errore avvio popup:', err);
  }
});
