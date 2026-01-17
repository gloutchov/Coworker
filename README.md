# Coworker - Manuale Utente (IT)

> Documento derivato da `lai/app/docs/help_IT.pdf`.
> Immagini escluse per motivi di brandizzazione. Testo riorganizzato per GitHub.

## Sommario
- Introduzione
- Come iniziare
- L'interfaccia
- Come funziona
  - Modalita: Chat AI
  - Modalita: Chat Documenti
  - Modalita: Chat Storiche
- Configurazione
  - Modelli LLM
  - Parametri di default
  - Parametri LLM
  - Gestione documenti
  - Ricerca Wikipedia
  - Prompt di sistema
  - Graphics
  - Gestione audio
  - Sintesi vocale
  - Servizi MCP
  - API esterne
  - Percorsi utente
  - Informazioni utente
  - Preferenze utente
- Cambio di lingua
- Questo manuale
- Appendice
  - Descrizione dei modelli LLM utilizzati
  - Come scrivere un prompt efficace
  - Glossario dei termini tecnici

## Introduzione
Coworker e' un progetto sperimentale pensato per offrire un companion AI locale a chi lavora al computer. Il sistema utilizza LLM locali Open Weight, calibrati per le prestazioni di normali portatili da ufficio, e fornisce strumenti di supporto alle attivita quotidiane.

Funzionalita principali:
- Attivita di brainstorming (con o senza ragionamento).
- Ricerca informazioni basata su:
  - knowledge base del modello,
  - archivio di documenti locali,
  - conversazioni precedenti.
- Trascrizione di documenti audio o conversazioni live.
- Creazione di organigrammi, diagrammi di flusso e mappe mentali a partire da chat o documenti locali.
- Utilizzo di strumenti MCP (a discrezione dell'utente).

Il sistema e' progettato per tutelare la privacy aziendale, evitando la condivisione di informazioni verso server di terze parti, e funziona esclusivamente sul sistema locale dell'utente.

## Come iniziare
### Avvio di Coworker
Per avviare il programma:
1. Fare doppio click su `coworker.bat`.
2. Si aprira una finestra terminale che carica il server locale.
3. Si aprira l'interfaccia in una finestra del browser (inizialmente in standby).

Su macOS e' possibile avviare l'app facendo doppio click su `coworker.command`.

All'avvio il server:
- rileva l'hardware e imposta parametri utili alla fluidita dell'interfaccia (finestra di contesto e numero massimo di token),
- inizializza il database per RAG e preferenze locali.

Nota: su sistemi poco performanti potrebbe essere necessario ricaricare la pagina per visualizzare eventuali chat salvate.

Attenzione: la finestra del terminale puo' essere ridotta a icona, ma non deve essere chiusa, altrimenti il programma smette di funzionare.

## L'interfaccia
L'interfaccia di Coworker e' divisa in tre aree.

### Area Modalita (sinistra)
Consente di cambiare modalita, vedere lo storico chat e accedere alla configurazione. Modalita disponibili:
- **Chat AI (modalita aperta)**: domande libere al modello basate su knowledge base e/o documenti caricati. Supporta:
  - modelli con ragionamento (Thinking),
  - grafica (organigrammi, diagrammi, mappe mentali),
  - server MCP configurati,
  - ricerca Wikipedia (unico accesso alla rete),
  - trascrizioni live dal browser,
  - mini editor di testo per note o documenti.
- **Chat Documenti (modalita chiusa)**: il modello risponde solo ai documenti indicizzati in una cartella dedicata. Grafica e mini editor sono disponibili anche qui.
- **Chat Storiche (modalita chiusa)**: il modello risponde basandosi sulle conversazioni salvate e indicizzate.

Nota: all'avvio si parte in **Chat AI**.

### Area Domande al Modello (centrale)
Include il campo di input e le opzioni attivabili in base alla modalita. L'area cambia in modo significativo a seconda della modalita scelta.

### Area Risposte del Modello (destra)
Mostra:
- il modello coinvolto,
- la barra di stato/avanzamento,
- l'area risposta,
- i pulsanti per stampare, salvare, cancellare chat o pulire l'area risposte.

Nota: il sistema mantiene il contesto finche' non si pulisce l'area, consentendo una conversazione coerente in stile chain of thought.

## Come funziona
Coworker offre tre modalita di utilizzo, descritte di seguito.

### Modalita: Chat AI
E' la modalita predefinita.

Come iniziare:
- Inserire una domanda nella casella **Cosa vuoi sapere?**.
- Per un primo approccio, provare: **"Cosa puoi fare per me?"** e premere **Invia**.

Il modello risponde e mantiene memoria della conversazione, permettendo di fare domande successive.

Azioni disponibili:
- **Salva chat**: salva la conversazione nello storico.
- **Stampa chat**: genera un documento di stampa (con intestazione e pie' di pagina) e consente stampa o PDF.
- **Pulisci chat**: svuota l'area risposte senza salvare.
- **Stop**: interrompe la risposta in corso.

Gestione storico:
- le chat salvate compaiono nello storico,
- e' possibile richiamarle cliccando,
- e' possibile rinominarle con doppio click,
- per eliminare: richiamare la chat e cliccare **Cancella chat**.

#### Ricerca Wikipedia
In Chat AI e' possibile abilitare **Ricerca Wikipedia** per consultare online solo Wikipedia. Il modello:
1. esegue prima la ricerca su Wikipedia,
2. se non trova risultati, usa la propria knowledge base.

Se la risposta proviene da Wikipedia, nelle fonti saranno indicati i link di origine.

#### MCP (Model Context Protocol)
MCP permette ai modelli AI di accedere a risorse esterne e superare i limiti tipici della chat, collegandosi a sistemi esterni (ERP, posta, calendario, CAD, ecc.).

Coworker include un client MCP e comunica con server MCP tramite:
- protocollo HTTP,
- protocollo STDIO.

Quando attivo, l'interfaccia mostra l'elenco dei server MCP connessi. Per interrogarli, digitare `@` seguito dal nome del server.

Attenzione: i server MCP vanno installati dall'utente e configurati con credenziali e permessi appropriati.

### Modalita: Chat Documenti
In questa modalita il modello risponde **solo** in base ai documenti indicizzati.

Passi principali:
1. Copiare i documenti nella cartella dedicata (configurabile).
2. Avviare l'indicizzazione.
3. Porre domande sui documenti indicizzati.

Caratteristiche:
- Modalita chiusa: nessuna risposta fuori dal contenuto indicizzato.
- Supporta grafica (Graphics) e mini editor.
- Supporta OCR per immagini (quando il modello multimodale e' disponibile).

### Modalita: Chat Storiche
In questa modalita il modello risponde basandosi **solo** sulle conversazioni salvate. Le chat vengono indicizzate automaticamente.

## Configurazione
La configurazione permette di adattare Coworker alle proprie esigenze. Le sezioni principali sono:
Nota: per le funzioni audio serve `ffmpeg` disponibile nel `PATH`.
Opzioni modificabili dall'utente (principali):
- modelli attivi e modelli LLM personalizzati,
- cartella documenti e cartella modelli,
- modalita di risposta (streaming), visibilita del thinking,
- contesto e max token (fisso/dinamico),
- limiti di lettura Excel/CSV,
- formato grafico preferito (SVG/Mermaid/PlantUML),
- mail per la ricerca Wikipedia,
- servizi MCP aggiuntivi,
- API esterne (provider, base URL, modello, chiave API).

### Modelli LLM
Consente di:
- selezionare il modello predefinito,
- aggiungere o rimuovere modelli,
- gestire modelli locali disponibili.

### Parametri di default
Definisce le impostazioni iniziali del sistema per garantire fluidita e compatibilita con l'hardware.

### Parametri LLM
Impostazioni tipiche:
- finestra di contesto,
- numero massimo di token,
- bilanciamento prestazioni/qualita.

Nota: token massimi alti migliorano la capacita di risposta ma aumentano l'uso di risorse. Coworker usa valori conservativi, ma e' possibile personalizzarli.

### Gestione documenti
Permette di:
- selezionare la cartella documenti,
- indicizzare o reindicizzare documenti,
- gestire documenti caricati.

#### Limiti di lettura Excel/CSV
I file Excel/CSV possono essere molto grandi. Per evitare indicizzazioni errate, sono disponibili limiti configurabili:
- massimo righe indicizzabili,
- massimo colonne indicizzabili.

Default: 300 righe, 20 colonne.
Nota: valori vuoti o 0 ripristinano il default server.

### Ricerca Wikipedia
Attiva/disattiva l'accesso a Wikipedia. E' l'unica forma di accesso a internet prevista dal sistema. Per abilitarla e' necessario inserire la propria mail nel campo dedicato, usata come contatto nelle richieste a Wikipedia.

### Prompt di sistema
Mostra il prompt interno di sistema (non modificabile dall'utente) che guida il comportamento del modello.

### Graphics
Abilita la generazione di grafica da richieste testuali. Formati disponibili:
- **SVG**: grafica vettoriale statica, adatta a loghi, badge e schemi essenziali. Utile per export immediato.
- **Mermaid**: genera markup testuale per flowchart, organigrammi e mappe mentali. Facile da rendere in anteprima o esportare.
- **PlantUML**: markup UML compatibile con PlantUML. Indicato per diagrammi UML e alternative ai flowchart Mermaid.

### Gestione audio
Controlla:
- trascrizione audio da file,
- trascrizione live da browser,
- impostazioni e limiti di registrazione.
Nota: le funzioni audio richiedono `ffmpeg` disponibile nel `PATH`.

### Sintesi vocale
Consente di convertire testi in audio. Disponibile per documenti testuali compatibili.

### Servizi MCP
Gestisce la configurazione dei server MCP connessi e le modalita di invocazione. Tramite il tasto **Aggiungi MCP** si incolla uno script JSON di configurazione del servizio.

Campi principali del JSON (minimi consigliati):
- `name`: identificativo del servizio (usato con `@nome`).
- `label`: etichetta descrittiva.
- `description`: descrizione del servizio.
- `type`: tipo di servizio (es. `mcp_http`, `mcp_stdio`, o label interna).
- `instructions`: istruzioni operative mostrate all'utente.
- `endpoint`/`url`: endpoint HTTP (per servizi HTTP).
- `command` e `args`: comando di avvio (per servizi STDIO).
- opzionali: `headers`, `payload`, `env`, `timeout`, `prompt_mode`, `prompt_arg`.

Demo MCP in /tools:
- Nella cartella `lai/tools/micro mcp server/` e' presente un micro server MCP di esempio.
- Avvio STDIO (default): `python3 micro_mcp_server.py`
- Avvio HTTP: `python3 micro_mcp_server.py --transport http --host 127.0.0.1 --port 8000`
- Endpoint HTTP: `http://127.0.0.1:8000/mcp`

Nota: se non presente, installare `fastmcp` con `python3 -m pip install fastmcp`.

### API esterne
Permette la configurazione di servizi esterni compatibili (se abilitati) e relativi parametri. Campi tipici: provider, base URL, nome modello e chiave API.

### Percorsi utente
Gestisce percorsi locali per:
- documenti,
- modelli,
- cache e dati utente.

### Informazioni utente
Sezione con informazioni generali dell'utente e dello stato del sistema.

### Preferenze utente
Permette di:
- selezionare opzioni di risposta (streaming o risposta completa),
- mostrare o nascondere i blocchi di ragionamento (thinking),
- scegliere contesto fisso o dinamico,
- scegliere max token fisso o dinamico,
- definire preferenze grafiche,
- impostare comportamenti di utilizzo.

Dettagli:
- **Modalita risposta**: in streaming la risposta arriva progressivamente; in modalita completa la risposta viene mostrata solo a fine elaborazione.
- **Contesto fisso/dinamico**: fisso mantiene la finestra predefinita per ridurre memoria e latenza; dinamico estende il contesto quando input o storico sono lunghi.
- **Token fisso/dinamico**: fisso usa il limite di default del server; dinamico adatta il limite tra minimo e massimo in base allo spazio di contesto disponibile.

## Cambio di lingua
L'interfaccia e' bilingue. Per passare da Italiano a Inglese (e viceversa), cliccare l'icona lingua in alto a destra.

## Questo manuale
Il manuale e' sempre accessibile dall'applicazione tramite il link **Guida** in basso a destra.

## Appendice
### Descrizione dei modelli LLM utilizzati
Coworker utilizza modelli LLM locali, scelti per offrire un buon compromesso tra prestazioni e affidabilita su portatili da ufficio.

Modelli attuali:
- **Qwen 2.5 3B Instruct (4 bit)**: modello principale per attivita testuali (scrittura, analisi documenti, traduzioni, riassunti). Contesto fino a 32k token.
- **Gemma 3 4B Instruct (4 bit)**: modello multimodale per testo + immagini/OCR. Contesto fino a 128k token.
- **Phi 3.5 4B Instruct (4 bit)**: specializzato in logica, matematica e ragionamento strutturato. Contesto fino a 128k token.
- **Qwen 3 4B Instruct (4 bit)**: dedicato al thinking (ragionamento profondo). Contesto fino a 32k token, richiede piu risorse.

Tutti i modelli sono Open Weight e operano localmente. Le dimensioni (3-4B parametri) sono ottimizzate per hardware da ufficio.

Nota: i file `.gguf` non sono inclusi nel repository. Vanno scaricati dalle repository originali dei modelli e copiati nella cartella `models/`.
Link utili (repository ufficiali):
- Qwen: https://huggingface.co/Qwen
- Gemma: https://huggingface.co/google
- Phi: https://huggingface.co/microsoft

Concetti base:
- **Prompt**: richiesta dell'utente.
- **Context window**: quantita di informazioni mantenute in memoria (domanda, risposte, documenti).
- **Token**: unita minime di elaborazione (non equivalgono sempre a parole).

Un corretto bilanciamento tra prompt, token e contesto migliora le risposte e l'efficienza. Coworker gestisce automaticamente questi parametri in base all'hardware.

### Come scrivere un prompt efficace
- **Chiarezza dell'obiettivo**: evitare richieste generiche. Preferire richieste mirate (riassunto, estrazione dati, confronto).
- **Contesto**: specificare ruolo, scopo e contesto (presentazione, procedura interna, documento tecnico).
- **Documenti e immagini**: indicare se la risposta deve basarsi solo sui documenti caricati o se sono accettate considerazioni generali.
- **Thinking**: con ragionamento attivo, domande precise e focalizzate. Suddividere problemi complessi in passi.
- **Formato della risposta**: indicare se si desidera elenco, tabella, schema o testo discorsivo.
- **Iterazione**: la prima risposta puo' essere affinata con domande successive.
- **Spirito critico**: Coworker e' uno strumento di supporto, non sostituisce la responsabilita decisionale dell'utente.

### Installazione
Prima di avviare il programma e' necessario eseguire gli script di setup.

Windows:
1. Fare doppio click su `setup_windows.bat`.
2. Attendere il completamento dell'installazione delle dipendenze.

macOS (ordine consigliato):
1. Fare doppio click su `setup_mac.command`.
2. Al termine, fare doppio click su `install_llama_mac.command`.
3. Attendere il completamento di entrambi gli script.

Cosa fanno gli script di setup (in breve):
- preparano l'ambiente Python (virtualenv) e installano le dipendenze richieste,
- scaricano e configurano i componenti locali necessari all'esecuzione dei modelli.

Se su macOS i file `.command` non partono, eseguire da terminale:
1. Aprire Terminale nella cartella del progetto.
2. Rendere eseguibili gli script:
   - `chmod +x setup_mac.command`
   - `chmod +x install_llama_mac.command`
   - `chmod +x coworker.command`
3. Avviare gli script:
   - `./setup_mac.command`
   - `./install_llama_mac.command`
4. Avviare l'app:
   - `./coworker.command`

### Glossario dei termini tecnici
- **AI (Intelligenza Artificiale)**: sistema informatico per comprendere testi, analizzare informazioni e formulare risposte.
- **Chain of Thought**: ragionamento interno che produce risposte piu approfondite, ma richiede piu risorse.
- **Chat AI**: modalita aperta basata su conoscenze generali e contenuti caricati.
- **Chat Documenti**: modalita chiusa basata esclusivamente sui documenti indicizzati.
- **Chat Storiche**: modalita chiusa basata su conversazioni salvate.
- **Context Window (finestra di contesto)**: memoria temporanea del modello (domanda, risposte, contenuti recenti).
- **GPU / CPU**: componenti hardware che eseguono i calcoli.
- **Hardware**: componenti fisiche (CPU, RAM, disco) che influenzano prestazioni.
- **Indicizzazione**: processo di preparazione di documenti/immagini/audio per l'interrogazione.
- **Knowledge Base**: insieme delle informazioni a disposizione del modello in quel momento.
- **LLM (Large Language Model)**: modello di linguaggio di grandi dimensioni.
- **Locale (sistema locale)**: funzionamento interamente sul computer dell'utente.
- **Man in the Middle (supervisione umana)**: l'AI supporta, ma la decisione resta all'utente.
- **MCP (Model Context Protocol)**: protocollo per collegare l'AI a strumenti esterni.
- **Modello specializzato**: modello ottimizzato per compiti specifici (testo, immagini, logica).
- **Multimodale**: modello che gestisce piu tipi di dati (testo, immagini, audio).
- **OCR (Optical Character Recognition)**: riconoscimento testo da immagini/documenti scansionati.
- **Open Weight**: modello con parametri disponibili per uso locale.
- **Prestazioni**: rapidita/efficienza delle risposte in base a modello e hardware.
- **Prompt**: testo scritto dall'utente per porre una richiesta.
- **Prompt di sistema**: istruzioni interne che guidano il comportamento del modello.
- **Quantizzazione**: tecnica per ridurre l'uso di memoria dei modelli.
- **RAG (Retrieval Augmented Generation)**: combinazione di ricerca su documenti locali e generazione di risposte.
- **SVG**: formato vettoriale per grafica semplice.
- **Thinking**: modalita di ragionamento profondo.
- **Token**: unita minima di elaborazione.
- **Token Max**: limite massimo di token in uscita.
- **Trascrizione Live**: registrazione audio con conversione in testo.
- **Wikipedia API**: accesso controllato a Wikipedia per informazioni verificabili.

Nota autore: questa app e' stata realizzata in vibe coding.

## Licenza
Distribuito sotto licenza Apache 2.0. Vedi `LICENSE`.

Nota: `ffmpeg` non e' incluso nel repository. Va installato separatamente e deve essere disponibile nel `PATH` per le funzioni audio.
Installazione consigliata:
- macOS (Homebrew): `brew install ffmpeg`
- Windows (winget): `winget install Gyan.FFmpeg`
- Windows (Chocolatey): `choco install ffmpeg`
