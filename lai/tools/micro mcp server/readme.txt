ti propongo un microserver unico che puoi avviare sia in STDIO sia in HTTP, scegliendo il trasporto da riga di comando (oppure lasciando STDIO come default). Per farlo in modo semplice e “pulito” in Python oggi il percorso più pratico è usare FastMCP (libreria Python pensata proprio per server MCP leggeri). FastMCP supporta STDIO e HTTP tramite run(transport=...). GitHub+2gofastmcp.com+2
Installa:

python -m pip install fastmcp
Crea micro_mcp_server.py:

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from fastmcp import FastMCP

mcp = FastMCP("MicroMCP")

@mcp.tool
def echo(text: str) -> str:
    """Ritorna pari-pari la stringa ricevuta."""
    return text

@mcp.tool
def add(a: float, b: float) -> float:
    """Somma due numeri."""
    return a + b

@mcp.tool
def now_utc() -> str:
    """Ritorna l'orario corrente in UTC (ISO 8601)."""
    return datetime.now(timezone.utc).isoformat()

@mcp.tool
def ping(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Ritorna un oggetto strutturato, utile per test JSON e campi opzionali."""
    return {
        "ok": True,
        "received": payload or {},
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
    }

@mcp.tool
def fail(message: str = "errore di test") -> None:
    """Genera un errore controllato (per testare la gestione errori lato client)."""
    raise RuntimeError(message)

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    args = p.parse_args()

    if args.transport == "http":
        # In HTTP l’endpoint MCP sarà tipicamente /mcp
        mcp.run(transport="http", host=args.host, port=args.port)
    else:
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
Avvio in STDIO (default):

python micro_mcp_server.py
Avvio in HTTP:

python micro_mcp_server.py --transport http --host 127.0.0.1 --port 8000
Con HTTP, l’endpoint che i client devono usare è http://127.0.0.1:8000/mcp (è esattamente il pattern mostrato nella doc di FastMCP). gofastmcp.com+1
Per testarlo al volo senza scrivere un client, usa l’MCP Inspector: è lo strumento ufficiale di debug/test per server MCP. modelcontextprotocol.io+1

npx -y @modelcontextprotocol/inspector
Dentro l’Inspector, se ti colleghi “lanciando un comando locale” scegli STDIO; se ti colleghi a un URL scegli Streamable HTTP (che è l’HTTP moderno previsto dalla specifica). stainless.com+1
Dimmi solo una cosa pratica (così te lo rendo “plug-and-play” con la tua app): quando dici che la tua app “funziona in stdio e in http”, in modalità HTTP si aspetta esattamente “Streamable HTTP” su /mcp oppure usa ancora SSE legacy tipo /sse? Lo chiedo perché SSE esiste ancora ma è considerato legacy in vari stack, mentre lo standard attuale spinge su HTTP streamable. gofastmcp.com+1

Nell'app devo inserire un json di configurazione. Ad esempio, per @filesystem uso { "name": "filesystem", "label": "File System (Nativo)", "description": "Consente l'accesso in lettura e scrittura alla cartella di test locale.", "type": "python_fs", "instructions": "Usa i comandi 'leggi <file>', 'scrivi <file> <contenuto>', o 'lista' per interagire con la cartella sandbox.", "env": { "SANDBOX_DIR": "/Users/gloutchov/Downloads" } }


Ragionato per 18s

Capito. Il tuo JSON per @filesystem mi dice parecchio sul tuo “formato interno”, ma mi manca un dettaglio fondamentale: quali campi la tua app si aspetta per collegarsi a un MCP server in modalità STDIO e in modalità HTTP (per esempio: command, args, url, transport, endpoint, ecc.). Senza questo rischio di inventarmi chiavi che la tua app poi ignora. Quindi ti do comunque due esempi pronti da copiare, però li marco come [Speculazione] dove uso chiavi “tipiche” (perché non posso verificare lo schema della tua app).
Detto questo, lato server MCP in HTTP, FastMCP espone di default l’endpoint su http://localhost:<porta>/mcp e permette anche di cambiare path se vuoi. fastmcp.mintlify.app Inoltre, la specifica “Streamable HTTP” descrive proprio l’idea del “singolo endpoint MCP” a cui fai POST (e opzionalmente GET per SSE) per lo scambio JSON-RPC. modelcontextprotocol.io
Ti propongo quindi due configurazioni.
[Speculazione] Config per STDIO (server lanciato come subprocess)

{
  "name": "micro_mcp_stdio",
  "label": "Micro MCP (STDIO)",
  "description": "Microserver MCP di test: echo/add/now_utc/ping/fail via STDIO.",
  "type": "mcp_stdio",
  "instructions": "Puoi usare: 'echo <testo>', 'add <a> <b>', 'now_utc', 'ping {json}', 'fail <messaggio>'.",
  "command": "python",
  "args": ["/percorso/assoluto/micro_mcp_server.py"],
  "env": {
    "PYTHONUNBUFFERED": "1"
  }
}
Qui le chiavi “nuove” sono command e args. Le ho messe perché è lo schema più comune quando un client avvia un server MCP in STDIO (equivalente a quello che fai con python micro_mcp_server.py). Se la tua app usa nomi diversi (es. exec, bin, argv, cwd), basta rinominarle.
[Speculazione] Config per HTTP (server già in ascolto su /mcp)

{
  "name": "micro_mcp_http",
  "label": "Micro MCP (HTTP)",
  "description": "Microserver MCP di test via HTTP (endpoint /mcp).",
  "type": "mcp_http",
  "instructions": "Endpoint MCP: POST/GET su /mcp. Tool disponibili: echo/add/now_utc/ping/fail.",
  "url": "http://127.0.0.1:8000/mcp",
  "env": {}
}
Qui la chiave ipotetica è url. L’endpoint /mcp è quello indicato nella documentazione FastMCP per il deployment HTTP. fastmcp.mintlify.app
Se vuoi rendere la cosa più “solida” e zero-ambiguità, dimmi quali campi supporta la tua app nel JSON per i connettori MCP (anche solo incollando un esempio di configurazione HTTP di un altro server MCP, oppure lo schema/validazione se ce l’hai). Con quella informazione ti riscrivo i due JSON senza [Speculazione], perfettamente aderenti al tuo formato, e ti dico anche come avviare il microserver in HTTP rispettando buone pratiche (binding su 127.0.0.1, ecc.) come raccomanda la specifica. modelcontextprotocol.io
