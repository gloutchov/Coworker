# Premessa

Non sono un esperto nella scrittura di codice. Per lo meno così mi vedo. Ma non sono neppure una persona che ha scoperto che chatGPT può fare APP e subito ha avuto l'ambizione di fargli fare l'applicazione must have che tutti desiderano da una vita. Coworker nasce da una necessità vera, e molto personale. Il desiderio di sperimentare, di vedere cosa si può ottenere con un CLI installato (in realtà 2 CLI differenti: Codex e Gemini), e semplicemente fare esperienza. Ho voluto però motivarmi in questo percorso, e cercare di avere come obiettivo un tool che potesse avere la sua utilità. Coworker vuole essere un tool AI da tenere aperto sul proprio computer. Lo volevo che funzionasse su un pc da ufficio, un portatile senza chissà quale scheda grafica e chissà quale processore, figurarsi poi se è presente una engine per intelligenza artificiale, o un ram come se piovesse. Mi sono dato come target il portatile dell'azienda, con un i7 dell'anno scorso, una scheda video integrata, e 16Gb di Ram, e il Mac Mini M1 con 8Gb di Ram che ho a casa. Il programma è fondamentalmente un chatbot. Però non usa un singolo modello llm. Ne usa diversi. Li trovate più avanti in questo documento. Ho comunque scelto modelli da 3B e 4B. Uno che 'conosce bene le lingue' (Qwen 2.5), uno che ha capacità di visione e OCR (Gemma), uno capace di ragionamento (Qwen 3), e uno bravino con la logica (Phi). E' inoltre presente Whisper per le trascrizioni, e Coqui per la trasformazione di testo in file audio. Qual è lo scopo di tutto ciò:

Avere un chatbot che risponda alle domande prendendo le informazioni solo dai documenti presenti in una cartella specifica (definita dall'utente). Questi documenti vengono sottoposti a RAG e conservati su un database.
Poter caricare anche un documento al volo - usa e getta - che non rimanga nel database, e usare il chatbot per estrarne dati e informazioni.
Analizzare documenti di testo, word, excel, pdf, immagini (tramite OCR), e audio.
Avere un notepad dove prendere appunti, e inserire contenuti generati dalla AI in base alle domande che gli facciamo.
Poter trascrivere files audio, anche in live (riunioni teams, ma anche testi dettati al chatbot).
Poter fare brainstorming.
Creare diagrammi di flusso, mappe mentali, e schemi di vario tipo, partendo da chat, ma anche dal contenuto dei documenti caricati.
Poter interrogare le vecchie chat.
Poter accedere a server MCP.
Poter accedere a Wikipedia.
A parte l'accesso a Wikipedia, e ai server MCP, il sistema funziona completamente in locale. I modelli sono piccoli, locali, e vengono caricati in memoria a seconda delle richieste che vengono fatte. Tutto ciò che viene fatto con Coworker rimane sul pc in cui è installato, sul suo database, al punto che può funzionare anche senza connessione internet. OK, l'accesso a wikipedia viene utile per andare oltre alla knowledge base dei modelli, che hanno una data limite, ma in linea di massima, per il lavoro, se ne potrebbe anche fare a meno.

L'interfaccia è spartana, utile allo scopo, ma sicuramente non ci ho passato le notti nel darle un bell'aspetto.

Il mio scopo era capire cosa potevo ottenere con i CLI a mia disposizione. E credo anche sia giusto spiegare come questa app sia nata, come abbia usato i CLI che ho citato a inizio post.

Molta parte del codice è stata sviluppata con Gemini CLI, e 'aggiustata' da codex CLI. Quando ho iniziato a lavorarci codex si piantava spesso, andava in crash, per cui non mi fidavo molto di ciò che 'faceva'. Gemini, d'altro canto, ha fatto gran parte del lavoro senza problemi. Solo in alcune situazioni non è riuscito a risolve bug e problematiche. Lì è intervenuto codex, correggendo ciò che Gemini trovava ostico. Poi Codex, con l'avvento di GPT5, ha cambiato registro ed è diventato davvero un ottimo inquisitore. In pratica gli ho fatto fare tutto il lavoro di debug, e di ottimizzazione.

Ora Coworker funziona correttamente, sia su PC, sia su Mac. Su PC ha prestazioni leggermente migliori grazie alla maggiore quantità di memoria, ma se su Mac si installano prima i requirements per Mac poi il llama_cpp specifico per i chip Apple, si ha una bella ottimizzazione. Certo, avere meno ram a disposizione è sempre un limite... Anche perché Coworker è pensato per essere usato e attivo su un pc dove girano altri programmi, magari 'roba' impegnativa che ruba risorse preziose. Ed è anche per questo che ho favorito modelli davvero piccolini... Così da lasciare ram libera per altri strumenti di lavoro che solitamente sono usati in ufficio.

E' uno strumento che cambia la vita? No! Per lo meno non credo. Dal momento che l'ho 'consolidato', al momento in cui ho pensato di rilasciarlo, è arrivato persino OpenClaw... Per cui prendetelo proprio come 'esercizio'.

Cosa manca? Beh... 

a) Va messo in sicurezza, innanzi tutto. Avevo anche iniziato il lavoro... Ma altre attività mi hanno costretto a interrompere lo studio. 

b) Va ripulito da eventuale codice orfano (Gemini CLI è bravo nel seminarne, Codex è bravo nell'identificarlo... Ma non ho investigato in modo estremo, e qualcosa potrebbe essere rimasto). 

c) Un coder esperto potrebbe anche spingersi a ottimizzarlo. 

Io mi sono fermato al "basta che funziona", e al "basta che sia usabile". Si tratta pur sempre di un esercizio fatto nei ritagli di tempo.

---

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
  - Installazione
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

Download modello Coqui (consigliato prima del primo avvio):
- Avviare lo script di warm-up: `python3 tools/warmup_coqui_tts.py --accept-tos`
- Questo script scarica in anticipo il modello Coqui TTS per evitare attese al primo utilizzo.

Nota: per le funzioni audio serve `ffmpeg` disponibile nel `PATH` (non incluso nel repository).
Installazione consigliata:
- macOS (Homebrew): `brew install ffmpeg`
- Windows (winget): `winget install Gyan.FFmpeg`
- Windows (Chocolatey): `choco install ffmpeg`

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

---

# COWORKER - Tech Notes

**EN**  
Coworker is an experimental local-first AI workspace for desktop use. It combines a FastAPI backend, a browser-based UI, local GGUF models via `llama_cpp_python`, document retrieval, audio transcription, text-to-speech, simple graphics generation, and optional MCP or OpenAI-compatible integrations.

**IT**  
Coworker e' uno spazio di lavoro AI sperimentale, pensato per un uso desktop e local-first. Combina un backend FastAPI, una UI nel browser, modelli GGUF locali tramite `llama_cpp_python`, recupero documentale, trascrizione audio, sintesi vocale, generazione grafica semplice e integrazioni opzionali MCP o compatibili OpenAI.

**EN**  
The project is designed around a simple premise: keep the default workflow local, practical, and usable on normal office laptops.

**IT**  
Il progetto nasce da un principio semplice: mantenere il flusso di lavoro predefinito locale, pratico e utilizzabile su normali portatili da ufficio.

## Highlights / Punti Chiave

- **EN:** Local chat with GGUF models.  
  **IT:** Chat locale con modelli GGUF.
- **EN:** Document Q&A with RAG over local files.  
  **IT:** Domande e risposte sui documenti con RAG su file locali.
- **EN:** Historical chat retrieval based on saved conversations.  
  **IT:** Recupero di chat storiche basato sulle conversazioni salvate.
- **EN:** Audio transcription from uploaded files.  
  **IT:** Trascrizione audio da file caricati.
- **EN:** Text-to-speech with local voices.  
  **IT:** Sintesi vocale con voci locali.
- **EN:** Graphics generation for diagrams and lightweight visual outputs.  
  **IT:** Generazione grafica per diagrammi e output visivi leggeri.
- **EN:** Optional MCP client support over HTTP or STDIO.  
  **IT:** Supporto opzionale a client MCP via HTTP o STDIO.
- **EN:** Optional OpenAI-compatible API provider support.  
  **IT:** Supporto opzionale a provider API compatibili OpenAI.
- **EN:** Browser UI with Italian and English prompts/docs.  
  **IT:** Interfaccia browser con prompt e documentazione in italiano e inglese.

## Project Status / Stato Del Progetto

**EN**  
This repository is experimental and optimized for local/private usage rather than packaged distribution. Some defaults, scripts, and bundled assets assume a developer-managed environment.

**IT**  
Questa repository e' sperimentale ed e' ottimizzata per un uso locale/privato piu' che per una distribuzione gia' pacchettizzata. Alcuni default, script e asset inclusi assumono un ambiente gestito direttamente dallo sviluppatore.

## Architecture / Architettura

**EN**  
`Coworker` is split into two main parts:

**IT**  
`Coworker` e' diviso in due parti principali:

- `lai/server.py`: FastAPI application exposing the local API.
- `lai/app/`: static frontend served by the backend.

**EN**  
Main backend modules:

**IT**  
Moduli principali del backend:

- `lai/modules/llm`: local chat and streaming.
- `lai/modules/rag`: document indexing and retrieval.
- `lai/modules/audio`: transcription.
- `lai/modules/tts`: speech synthesis.
- `lai/modules/graphics`: diagram/graphics generation.
- `lai/modules/mcp`: MCP service discovery and invocation.
- `lai/modules/config`: runtime configuration and user preferences.
- `lai/modules/db`: SQLite-backed persistence for chats, config, cache, and RAG metadata.

## Features / Funzionalita'

### 1. Local AI Chat / Chat AI Locale

**EN**  
The default mode runs against local GGUF models configured in `lai/config.py` and user preferences. The app supports conversation history, configurable context size, token limits, streaming modes, and model switching.

**IT**  
La modalita' predefinita usa modelli GGUF locali configurati in `lai/config.py` e nelle preferenze utente. L'app supporta cronologia conversazioni, dimensione del contesto configurabile, limiti di token, modalita' di streaming e cambio modello.

### 2. Document Chat (RAG) / Chat Documentale (RAG)

**EN**  
Coworker can index local documents and answer questions using only indexed content. The codebase includes chunking and retrieval settings for textual files and structured files such as spreadsheets.

**IT**  
Coworker puo' indicizzare documenti locali e rispondere usando solo il contenuto indicizzato. Il codice include impostazioni di chunking e retrieval per file testuali e file strutturati come i fogli di calcolo.

### 3. Historical Chat Search / Ricerca Nelle Chat Storiche

**EN**  
Saved conversations can be indexed and queried as a separate retrieval mode.

**IT**  
Le conversazioni salvate possono essere indicizzate e interrogate come modalita' di retrieval separata.

### 4. Audio Tools / Strumenti Audio

**EN**  
The backend exposes transcription through Faster-Whisper and speech synthesis through Coqui TTS.

**IT**  
Il backend espone la trascrizione tramite Faster-Whisper e la sintesi vocale tramite Coqui TTS.

### 5. Graphics / Grafica

**EN**  
The UI can generate visual outputs in formats such as SVG, Mermaid, and PlantUML, with optional PNG rendering.

**IT**  
La UI puo' generare output visivi in formati come SVG, Mermaid e PlantUML, con rendering PNG opzionale.

### 6. Integrations / Integrazioni

- **EN:** Wikipedia search can be enabled as the built-in web source.  
  **IT:** La ricerca Wikipedia puo' essere abilitata come fonte web integrata.
- **EN:** MCP services can be configured and invoked from the chat UI.  
  **IT:** I servizi MCP possono essere configurati e invocati dalla UI di chat.
- **EN:** OpenAI-compatible providers can be configured as optional external backends.  
  **IT:** I provider compatibili OpenAI possono essere configurati come backend esterni opzionali.

## Privacy Model / Modello Di Privacy

**EN**  
Coworker is local-first:

**IT**  
Coworker e' local-first:

- **EN:** chat, indexing, preferences, and history are stored locally;  
  **IT:** chat, indicizzazione, preferenze e cronologia sono memorizzate localmente;
- **EN:** local models are used by default;  
  **IT:** i modelli locali sono usati per default;
- **EN:** network access is optional and feature-specific.  
  **IT:** l'accesso alla rete e' opzionale e dipende dalla funzionalita' usata.

**EN**  
Out of the box, the only built-in web lookup path is Wikipedia search. External API providers and MCP services are optional and must be configured explicitly by the user.

**IT**  
Di base, l'unico percorso integrato di consultazione web e' la ricerca su Wikipedia. Provider API esterni e servizi MCP sono opzionali e devono essere configurati esplicitamente dall'utente.

## Requirements / Requisiti

### Runtime

- Python `3.11`
- macOS or Windows
- enough RAM for the selected local models

### Runtime / Requisiti Di Esecuzione

- Python `3.11`
- macOS o Windows
- RAM sufficiente per i modelli locali selezionati

### Recommended System Tools / Strumenti Di Sistema Consigliati

- `ffmpeg` for audio-related workflows
- `ffmpeg` per i flussi di lavoro legati all'audio

## Quick Start / Avvio Rapido

### macOS

1. Run `setup_mac.command`
2. Wait for the virtual environment and dependencies to be installed
3. Run `coworker.command`

1. Esegui `setup_mac.command`
2. Attendi l'installazione del virtual environment e delle dipendenze
3. Esegui `coworker.command`

**EN**  
The macOS setup script installs the Python dependencies from `lai/requirements_mac_311.txt` and then installs `llama_cpp_python` with Metal acceleration.

**IT**  
Lo script di setup macOS installa le dipendenze Python da `lai/requirements_mac_311.txt` e poi installa `llama_cpp_python` con accelerazione Metal.

### Windows

1. Run `setup_windows.bat`
2. Wait for the virtual environment and dependencies to be installed
3. Run `coworker.bat`

1. Esegui `setup_windows.bat`
2. Attendi l'installazione del virtual environment e delle dipendenze
3. Esegui `coworker.bat`

**EN**  
The Windows setup script installs the dependencies from `lai/requirements_windows_311.txt`.

**IT**  
Lo script di setup Windows installa le dipendenze da `lai/requirements_windows_311.txt`.

## Manual Run / Avvio Manuale

**EN**  
If you prefer starting the app manually:

**IT**  
Se preferisci avviare l'app manualmente:

```bash
cd lai
python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

**EN**  
Then open:

**IT**  
Poi apri:

```text
http://127.0.0.1:8001
```

## Configuration / Configurazione

**EN**  
Core defaults live in `lai/config.py`, including:

**IT**  
I default principali si trovano in `lai/config.py`, inclusi:

- server host and port / host e porta del server
- model paths / percorsi dei modelli
- context/token limits / limiti di contesto e token
- RAG chunking and retrieval defaults / default di chunking e retrieval RAG
- Wikipedia search settings / impostazioni della ricerca Wikipedia
- MCP defaults / default MCP
- TTS and graphics defaults / default TTS e grafica

**EN**  
User-adjustable preferences are persisted locally through the config and database modules.

**IT**  
Le preferenze modificabili dall'utente vengono salvate localmente tramite i moduli di configurazione e database.

## Repository Layout / Struttura Della Repository

```text
.
├── coworker.bat
├── coworker.command
├── setup_mac.command
├── setup_windows.bat
├── LICENSE
├── NOTICE
└── lai
    ├── app
    ├── config.py
    ├── models
    ├── modules
    ├── rag.py
    ├── requirements_mac_311.txt
    ├── requirements_windows_311.txt
    └── server.py
```

## Notes For GitHub Distribution / Note Per La Distribuzione Su GitHub

**EN**  
If this repository is published on GitHub, these points should be kept in mind:

**IT**  
Se questa repository viene pubblicata su GitHub, conviene tenere presenti questi punti:

- **EN:** the project currently includes local assets and model-related files that may be too large or too environment-specific for a clean public distribution;  
  **IT:** il progetto include attualmente asset locali e file collegati ai modelli che potrebbero essere troppo grandi o troppo specifici per una distribuzione pubblica pulita;
- **EN:** setup scripts are convenient for local use, but not yet a full installer experience;  
  **IT:** gli script di setup sono comodi per l'uso locale, ma non costituiscono ancora una vera esperienza di installazione completa;
- **EN:** some defaults are tuned for a local demo/private deployment rather than multi-user production use;  
  **IT:** alcuni default sono tarati per demo locali o deploy privati piu' che per un uso multiutente in produzione;
- **EN:** external integrations should be documented as optional because the main value of the project is local-first operation.  
  **IT:** le integrazioni esterne dovrebbero essere documentate come opzionali, perche' il valore principale del progetto e' il funzionamento local-first.

## License / Licenza

**EN**  
This repository includes [LICENSE](LICENSE) and [NOTICE](NOTICE). Keep both files when redistributing the project.

**IT**  
Questa repository include [LICENSE](LICENSE) e [NOTICE](NOTICE). Mantieni entrambi i file in caso di redistribuzione del progetto.

Nota autore: questa app e' stata realizzata in vibe coding.
