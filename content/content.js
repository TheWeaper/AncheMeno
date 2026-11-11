/**
 * anchemeno — Content Script
 * Individua e avvolge il testo tra parentesi tonde (...) all'interno dei tag <article>,
 * preservando link (<a>) e tag di formattazione annidati, con attivazione/disattivazione istantanea.
 */

(() => {
  'use strict';

  const WRAPPER_CLASS = 'anchemeno-paren-wrapper';
  const ACTIVE_ROOT_CLASS = 'anchemeno-active';
  const DEFAULT_DOMAIN = 'ilpost.it';
  const BATCH_SIZE = 20;

  const IGNORED_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'CODE',
    'PRE',
    'TEXTAREA',
    'INPUT',
    'SVG',
    'MATH',
    'CANVAS',
    'IFRAME'
  ]);

  const IGNORED_CLASSES = new Set([
    'wp-caption-text'
  ]);

  const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, figcaption, dd, dt, td, th, div, section, header, footer, article';
  const PUNCTUATION_OR_SPACE_RE = /^[\s,.;:!?)\]}\u00BB\u201D]/;

  let currentSettings = {
    enabled: true,
    targetDomain: DEFAULT_DOMAIN
  };

  let isScanning = false;
  let pendingRescan = false;

  /**
   * Normalizza un hostname o URL in un dominio pulito (senza protocollo, path o www.)
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
   * Verifica se l'hostname della pagina corrente corrisponde al dominio configurato
   */
  function isCurrentSiteMatched(targetDomainStr) {
    if (!targetDomainStr || !targetDomainStr.trim()) return false;
    const currentHost = normalizeDomain(window.location.hostname);
    if (!currentHost) return false;

    const targets = targetDomainStr
      .split(',')
      .map(normalizeDomain)
      .filter(Boolean);

    for (const target of targets) {
      if (target === '*') return true;
      if (currentHost === target || currentHost.endsWith('.' + target)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Applica o rimuove la classe CSS che nasconde i wrapper delle parentesi
   */
  function applyVisibilityState() {
    const shouldHide =
      Boolean(currentSettings.enabled) &&
      isCurrentSiteMatched(currentSettings.targetDomain);

    document.documentElement.classList.toggle(ACTIVE_ROOT_CLASS, shouldHide);
  }

  /**
   * Controlla se un nodo di testo deve essere ignorato (es. dentro <script>, classe esclusa come wp-caption-text o già wrappato)
   */
  function shouldIgnoreTextNode(textNode) {
    let el = textNode.parentElement;
    while (el && el !== document.body) {
      if (IGNORED_TAGS.has(el.tagName)) return true;
      if (el.classList) {
        if (el.classList.contains(WRAPPER_CLASS)) return true;
        for (const cls of IGNORED_CLASSES) {
          if (el.classList.contains(cls)) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Restituisce il contenitore di blocco più vicino dentro <article>
   */
  function getClosestBlock(node, articleEl) {
    const parent = node.parentElement;
    if (!parent) return articleEl;
    const block = parent.closest(BLOCK_SELECTOR);
    if (block && articleEl.contains(block)) {
      return block;
    }
    return articleEl;
  }

  /**
   * Raggruppa i nodi di testo di un <article> per elemento di blocco, così che una
   * parentesi non chiusa in un paragrafo non si accoppi mai con un paragrafo successivo.
   */
  function collectBlockGroupsInArticle(articleEl) {
    const blockMap = new Map();
    const walker = document.createTreeWalker(
      articleEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || shouldIgnoreTextNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      const block = getClosestBlock(currentNode, articleEl);
      let list = blockMap.get(block);
      if (!list) {
        list = [];
        blockMap.set(block, list);
      }
      list.push(currentNode);
      currentNode = walker.nextNode();
    }

    return Array.from(blockMap.values());
  }

  /**
   * Trova tutte le coppie bilanciate (...) in una sequenza di nodi di testo appartenenti allo stesso blocco.
   * Supporta parentesi che attraversano link <a> o tag inline (<em>, <strong>, <span>) e parentesi annidate.
   */
  function findBalancedParenthesisRanges(textNodes) {
    const ranges = [];
    let depth = 0;
    let startNode = null;
    let startOffset = 0;

    for (let nIdx = 0; nIdx < textNodes.length; nIdx++) {
      const node = textNodes[nIdx];
      const text = node.nodeValue || '';

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(') {
          if (depth === 0) {
            startNode = node;
            startOffset = i;
          }
          depth++;
        } else if (ch === ')' && depth > 0) {
          depth--;
          if (depth === 0 && startNode) {
            const endNode = node;
            const endOffset = i + 1;

            // Gestione intelligente dello spazio antecedente per evitare doppi spazi o spazi prima della virgola
            let effectiveStartOffset = startOffset;
            if (startOffset > 0) {
              const prevChar = startNode.nodeValue[startOffset - 1];
              if (prevChar === ' ' || prevChar === '\u00A0') {
                const nextChar =
                  endOffset < endNode.nodeValue.length
                    ? endNode.nodeValue[endOffset]
                    : nIdx + 1 < textNodes.length
                      ? (textNodes[nIdx + 1].nodeValue || '')[0] || ''
                      : '';
                if (!nextChar || PUNCTUATION_OR_SPACE_RE.test(nextChar)) {
                  effectiveStartOffset = startOffset - 1;
                }
              }
            }

            ranges.push({
              startNode,
              startOffset: effectiveStartOffset,
              endNode,
              endOffset
            });
            startNode = null;
          }
        }
      }
    }

    return ranges;
  }

  /**
   * Avvolge i range trovati in un singolo blocco procedendo in ordine inverso
   * (dalla fine del blocco all'inizio) per non invalidare gli offset dei nodi precedenti.
   */
  function wrapBlockRanges(textNodes) {
    const matchedRanges = findBalancedParenthesisRanges(textNodes);
    if (matchedRanges.length === 0) return 0;

    let wrappedCount = 0;
    for (let i = matchedRanges.length - 1; i >= 0; i--) {
      const item = matchedRanges[i];
      try {
        if (!item.startNode.isConnected || !item.endNode.isConnected) continue;
        const range = document.createRange();
        range.setStart(item.startNode, item.startOffset);
        range.setEnd(item.endNode, item.endOffset);

        const wrapper = document.createElement('span');
        wrapper.className = WRAPPER_CLASS;
        wrapper.appendChild(range.extractContents());
        range.insertNode(wrapper);
        wrappedCount++;
      } catch (err) {
        // Ignora eventuali nodi mutati contemporaneamente dalla pagina
      }
    }
    return wrappedCount;
  }

  /**
   * Scansiona tutti i tag <article> della pagina suddividendo il lavoro in batch con requestAnimationFrame
   */
  async function scanArticles() {
    if (!isCurrentSiteMatched(currentSettings.targetDomain)) {
      applyVisibilityState();
      return countWrappedParentheses();
    }

    if (isScanning) {
      pendingRescan = true;
      return countWrappedParentheses();
    }

    isScanning = true;
    applyVisibilityState();

    try {
      const articles = Array.from(document.querySelectorAll('article'));
      const allBlockGroups = [];

      for (const article of articles) {
        const groups = collectBlockGroupsInArticle(article);
        for (const group of groups) {
          if (group.some(node => (node.nodeValue || '').includes('(') || (node.nodeValue || '').includes(')'))) {
            allBlockGroups.push(group);
          }
        }
      }

      for (let i = 0; i < allBlockGroups.length; i += BATCH_SIZE) {
        const batch = allBlockGroups.slice(i, i + BATCH_SIZE);
        await new Promise(resolve => {
          requestAnimationFrame(() => {
            for (const textNodes of batch) {
              wrapBlockRanges(textNodes);
            }
            resolve();
          });
        });

        if (globalThis.scheduler?.yield) {
          await globalThis.scheduler.yield();
        }
      }
    } finally {
      isScanning = false;
      if (pendingRescan) {
        pendingRescan = false;
        await scanArticles();
      }
    }

    return countWrappedParentheses();
  }

  /**
   * Conta il numero totale di espressioni tra parentesi individuate dentro <article>
   */
  function countWrappedParentheses() {
    return document.querySelectorAll(`article .${WRAPPER_CLASS}`).length;
  }

  /**
   * Osserva modifiche dinamiche al DOM (es. caricamento asincrono degli articoli)
   */
  function setupMutationObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      if (!isCurrentSiteMatched(currentSettings.targetDomain)) return;

      let hasRelevantAddition = false;
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            if (added.classList && added.classList.contains(WRAPPER_CLASS)) {
              continue;
            }
            if (
              added.tagName === 'ARTICLE' ||
              added.closest?.('article') ||
              added.querySelector?.('article')
            ) {
              hasRelevantAddition = true;
              break;
            }
          } else if (added.nodeType === Node.TEXT_NODE) {
            const parent = added.parentElement;
            if (
              parent &&
              !parent.classList.contains(WRAPPER_CLASS) &&
              parent.closest('article')
            ) {
              hasRelevantAddition = true;
              break;
            }
          }
        }
        if (hasRelevantAddition) break;
      }

      if (hasRelevantAddition) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          scanArticles();
        }, 120);
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  /**
   * Gestione messaggi dal popup
   */
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        if (message?.type === 'GET_STATUS') {
          await scanArticles();
          sendResponse({
            enabled: currentSettings.enabled,
            targetDomain: currentSettings.targetDomain,
            isMatchedSite: isCurrentSiteMatched(currentSettings.targetDomain),
            articleCount: document.querySelectorAll('article').length,
            parenCount: countWrappedParentheses(),
            hostname: normalizeDomain(window.location.hostname)
          });
        } else if (message?.type === 'UPDATE_SETTINGS') {
          if (typeof message.enabled === 'boolean') {
            currentSettings.enabled = message.enabled;
          }
          if (typeof message.targetDomain === 'string') {
            currentSettings.targetDomain = message.targetDomain;
          }
          applyVisibilityState();
          const parenCount = await scanArticles();
          sendResponse({
            ok: true,
            enabled: currentSettings.enabled,
            targetDomain: currentSettings.targetDomain,
            isMatchedSite: isCurrentSiteMatched(currentSettings.targetDomain),
            articleCount: document.querySelectorAll('article').length,
            parenCount
          });
        }
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  });

  /**
   * Ascolta cambi di stato su chrome.storage.local (sincronizza più schede aperte)
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.enabled) {
      currentSettings.enabled = Boolean(changes.enabled.newValue);
    }
    if (changes.targetDomain) {
      currentSettings.targetDomain = changes.targetDomain.newValue || DEFAULT_DOMAIN;
    }
    applyVisibilityState();
    scanArticles();
  });

  /**
   * Inizializzazione all'apertura della pagina
   */
  async function init() {
    try {
      const stored = await chrome.storage.local.get({
        enabled: true,
        targetDomain: DEFAULT_DOMAIN
      });
      currentSettings.enabled = Boolean(stored.enabled);
      currentSettings.targetDomain = stored.targetDomain || DEFAULT_DOMAIN;
      applyVisibilityState();
      await scanArticles();
      setupMutationObserver();
    } catch (err) {
      console.error('[anchemeno] Errore di inizializzazione:', err);
    }
  }

  init();
})();
