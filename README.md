# (–) anchemeno

**anchemeno** è un'estensione per browser basati su Chromium (Manifest V3) che individua e nasconde automaticamente gli incisi tra parentesi tonde `(...)` all'interno degli articoli di giornale (`<article>`), rendendo la lettura più scorrevole e lineare.

Con un clic dal popup puoi attivare o disattivare il filtro in tempo reale (senza ricaricare la pagina), vedere quante parentesi sono state rimosse nell'articolo e scegliere su quali siti di informazione applicarlo.

---

## ✨ Caratteristiche principali

- **Rimozione istantanea e reversibile:** nasconde il testo tra parentesi tonde `(...)` all'interno dei tag `<article>` tramite CSS, permettendo di mostrarlo o nasconderlo all'istante con lo switch nel popup.
- **Preservazione di link e formattazione:** gestisce correttamente parentesi che contengono o attraversano link (`<a>`), grassetti (`<strong>`), corsivi (`<em>`) e parentesi annidate.
- **Spaziatura intelligente:** rimuove automaticamente lo spazio antecedente alla parentesi aperta quando è seguita da punteggiatura (es. `parola (inciso),` diventa `parola,`), evitando doppi spazi o spazi prima di virgole e punti.
- **Contatore in tempo reale:** il popup mostra il numero esatto di espressioni tra parentesi individuate nella pagina aperta.
- **Dominio configurabile:** preimpostata su `ilpost.it`, permette di configurare qualsiasi dominio (es. `repubblica.it, corriere.it`), usare con un clic il dominio della scheda attiva oppure inserire `*` per attivarla su tutti i siti.
- **Supporto contenuti dinamici:** utilizza un `MutationObserver` e scansioni suddivise in batch (`requestAnimationFrame`) per gestire articoli caricati dinamicamente senza bloccare il rendering della pagina.

---

## 🚀 Installazione (Modalità Sviluppatore)

1. Clona o scarica questo repository sul tuo computer:
   ```bash
   git clone https://github.com/TheWeaper/AncheMeno.git
   ```
2. Apri Google Chrome (o un altro browser Chromium come Brave, Edge, Arc) e vai all'indirizzo:
   ```text
   chrome://extensions/
   ```
3. Attiva l'interruttore **Modalità sviluppatore** (*Developer mode*) in alto a destra.
4. Clicca su **Carica estensione non pacchettizzata** (*Load unpacked*) in alto a sinistra.
5. Seleziona la cartella del progetto `AncheMeno`.

L'icona `(–)` di **anchemeno** comparirà nella barra delle estensioni del browser.

---

## 🛠️ Come usarla

1. Apri un articolo su un sito di news (di default `ilpost.it`).
2. Clicca sull'icona di **anchemeno** nella barra degli strumenti per aprire il popup:
   - **Switch in alto a destra:** attiva o mette in pausa il filtro istantaneamente, mostrando o nascondendo le parentesi nell'articolo.
   - **Parentesi nell'articolo:** indica quante coppie di parentesi `(...)` sono state trovate nei tag `<article>` della pagina.
   - **Sito di informazione attivo:** inserisci uno o più domini separati da virgola (es. `ilpost.it, internazionale.it`), premi **Usa il dominio della scheda aperta** per impostare il sito che stai visitando, oppure inserisci `*` per abilitare l'estensione ovunque.

---

## 📁 Struttura del progetto

```text
AncheMeno/
├── manifest.json          # Configurazione dell'estensione (Manifest V3)
├── content/
│   ├── content.js         # Scansione DOM, wrapping parentesi e gestione spaziatura
│   └── content.css        # Stili per nascondere i wrapper (.anchemeno-paren-wrapper)
├── popup/
│   ├── popup.html         # Interfaccia del popup dell'estensione
│   ├── popup.css          # Stili del popup
│   └── popup.js           # Logica del popup e sincronizzazione con chrome.storage
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

---

## ⚙️ Come funziona sotto il cofano

1. **Raggruppamento per blocchi:** il content script raccoglie i nodi di testo all'interno di ciascun `<article>` raggruppandoli per elemento di blocco (`<p>`, `<li>`, `<blockquote>`, ecc.) ed escludendo tag tecnici (`<script>`, `<code>`, `<pre>`, `<style>`). In questo modo una parentesi non chiusa in un paragrafo non interferisce mai con i paragrafi successivi.
2. **Ricerca bilanciata e Range DOM:** l'algoritmo calcola la profondità delle parentesi `( ... )` attraverso i nodi di testo consecutivi dello stesso blocco e avvolge ciascun intervallo in uno `<span class="anchemeno-paren-wrapper">` procedendo a ritroso per mantenere intatti gli offset del DOM.
3. **Toggle CSS istantaneo:** la classe `.anchemeno-active` sull'elemento radice `<html>` controlla la visibilità di `.anchemeno-paren-wrapper` (`display: none !important`), consentendo di nascondere o ripristinare il testo originale senza dover rianalizzare la pagina.

---

## 📄 Licenza

Distribuito sotto licenza MIT. Sentiti libero di aprire issue o pull request per miglioramenti!
