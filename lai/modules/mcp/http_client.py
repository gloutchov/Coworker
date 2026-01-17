import asyncio
import json
from typing import Any, Dict, Optional
from mcp import ClientSession
from mcp.client.sse import sse_client

async def _invoke_mcp_http_async(url: str, tool_name: str, tool_args: Dict[str, Any], timeout: int = 25) -> str:
    """
    Esegue una chiamata tool MCP via HTTP/SSE in modalità asincrona.
    """
    try:
        # 1. Stabilisce la connessione SSE
        async with sse_client(url) as (read_stream, write_stream):
            # 2. Inizia la sessione MCP
            async with ClientSession(read_stream, write_stream) as session:
                # 3. Handshake (Initialize)
                await session.initialize()
                
                # 4. Chiamata al tool
                # call_tool restituisce un oggetto CallToolResult
                result = await session.call_tool(tool_name, arguments=tool_args)
                
                # 5. Estrazione del testo dalla risposta
                # result.content è una lista di oggetti (testo, immagine, ecc.)
                texts = []
                for content in result.content:
                    if hasattr(content, "text"):
                        texts.append(content.text)
                    elif isinstance(content, dict) and content.get("type") == "text":
                        texts.append(content.get("text", ""))
                
                if result.isError:
                    return f"Errore dal server MCP: {' '.join(texts)}"
                
                return "\n".join(texts) if texts else str(result)

    except Exception as e:
        # Gestione speciale per ExceptionGroup (Python 3.11+)
        if hasattr(e, "exceptions"):
            msgs = [str(sub) for sub in e.exceptions]
            return f"Errore MCP HTTP (TaskGroup): {'; '.join(msgs)}"
        return f"Errore durante la comunicazione MCP HTTP: {str(e)}"

def invoke_mcp_http(url: str, tool_name: str, tool_args: Dict[str, Any], timeout: int = 25) -> str:
    """
    Wrapper sincrono per chiamare il client MCP HTTP.
    """
    try:
        # Utilizziamo un nuovo loop per evitare conflitti con eventuali loop esistenti
        # dato che il server FastAPI è asincrono ma le nostre route MCP sono sincrone.
        return asyncio.run(_invoke_mcp_http_async(url, tool_name, tool_args, timeout))
    except Exception as e:
        return f"Errore esecuzione bridge MCP HTTP: {str(e)}"