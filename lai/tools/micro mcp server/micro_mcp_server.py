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
        # In HTTP l’endpoint MCP sarà tipicamente /sse (standard MCP)
        mcp.run(transport="sse", host=args.host, port=args.port)
    else:
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
