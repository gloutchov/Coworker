import json
import os
import pathlib
import shlex
import subprocess
from dataclasses import dataclass, field
from typing import Any, Dict, List
from urllib import parse, request, error

from config import MCP_DEFAULT_TIMEOUT, MCP_ENABLED
from modules.config.preferences import get_mcp_services_all
from modules.mcp.http_client import invoke_mcp_http


@dataclass(frozen=True)
class MCPServiceConfig:
    name: str
    label: str
    description: str
    service_type: str = "echo"
    instructions: str = ""
    endpoint: str | None = None
    method: str = "POST"
    headers: Dict[str, str] = field(default_factory=dict)
    payload: Dict[str, Any] = field(default_factory=dict)
    timeout: int = MCP_DEFAULT_TIMEOUT
    command: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    prompt_mode: str = "stdin"  # "stdin" oppure "argument"
    prompt_arg: str | None = None


def _normalize_command(raw_command: Any) -> List[str]:
    if not raw_command:
        return []
    if isinstance(raw_command, str):
        return shlex.split(raw_command)
    if isinstance(raw_command, (list, tuple)):
        return [str(token) for token in raw_command if str(token).strip()]
    return []


def _normalize_headers(raw_headers: Any) -> Dict[str, str]:
    if not isinstance(raw_headers, dict):
        return {}
    return {str(k): str(v) for k, v in raw_headers.items()}


def _normalize_payload(raw_payload: Any) -> Dict[str, Any]:
    if isinstance(raw_payload, dict):
        return raw_payload.copy()
    return {}


def _normalize_env(raw_env: Any) -> Dict[str, str]:
    if not isinstance(raw_env, dict):
        return {}
    return {str(k): str(v) for k, v in raw_env.items()}


def _normalize_services() -> List[MCPServiceConfig]:
    services: List[MCPServiceConfig] = []
    for raw in get_mcp_services_all() or []:
        try:
            name = str(raw.get("name") or "").strip()
            if not name:
                continue
            service_type = str(raw.get("type") or "echo").strip().lower() or "echo"
            label = str(raw.get("label") or name).strip() or name
            description = str(raw.get("description") or "").strip()
            instructions = (
                str(raw.get("instructions") or f"Scrivi @{name} seguito dalla richiesta.")
                .strip()
            )
            endpoint = raw.get("endpoint") or raw.get("url")
            method = str(raw.get("method") or "POST").strip().upper() or "POST"
            prompt_mode = str(raw.get("prompt_mode") or "stdin").strip().lower()
            prompt_arg = str(raw.get("prompt_arg") or "").strip() or None
            timeout = int(raw.get("timeout") or MCP_DEFAULT_TIMEOUT)

            env = _normalize_env(raw.get("env"))

            services.append(
                MCPServiceConfig(
                    name=name.lower(),
                    label=label,
                    description=description,
                    service_type=service_type,
                    instructions=instructions,
                    endpoint=endpoint,
                    method=method,
                    headers=_normalize_headers(raw.get("headers")),
                    payload=_normalize_payload(raw.get("payload")),
                    timeout=max(1, timeout),
                    command=_normalize_command(raw.get("command")) + _normalize_command(raw.get("args")),
                    env=env,
                    prompt_mode="argument" if prompt_mode == "argument" else "stdin",
                    prompt_arg=prompt_arg,
                )
            )
        except Exception as exc:
            print(f"[MCP] Configurazione servizio ignorata ({raw}): {exc}")
    return services


def _get_services() -> List[MCPServiceConfig]:
    return _normalize_services()


def is_enabled() -> bool:
    return MCP_ENABLED


def list_public_services() -> List[dict[str, Any]]:
    services = _get_services()
    return [
        {
            "name": svc.name,
            "label": svc.label,
            "description": svc.description,
            "type": svc.service_type,
            "instructions": svc.instructions,
        }
        for svc in services
    ]


def _build_result(service: MCPServiceConfig, content: str, metadata: Dict[str, Any] | None = None) -> dict:
    cleaned = content.strip()
    payload = {
        "client": service.name,
        "title": service.label,
        "description": service.description,
        "content": cleaned,
    }
    if metadata:
        payload["metadata"] = metadata
    return payload


def _invoke_http(service: MCPServiceConfig, query: str) -> dict:
    if not service.endpoint:
        raise ValueError(f"Il servizio @{service.name} non ha un endpoint configurato.")

    headers = {"Content-Type": "application/json"}
    headers.update(service.headers)

    body: bytes | None = None
    url = service.endpoint
    if service.method == "GET":
        payload = service.payload.copy()
        payload["query"] = query
        query_string = parse.urlencode(payload)
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}{query_string}"
    else:
        payload = service.payload.copy()
        payload["query"] = query
        body = json.dumps(payload).encode("utf-8")

    req = request.Request(url, data=body, method=service.method)
    for key, value in headers.items():
        req.add_header(key, value)

    try:
        with request.urlopen(req, timeout=service.timeout) as resp:
            raw_text = resp.read().decode("utf-8", errors="ignore")
    except error.HTTPError as http_err:
        raise RuntimeError(f"Servizio @{service.name} ha restituito HTTP {http_err.code}.") from http_err
    except error.URLError as url_err:
        raise RuntimeError(f"Impossibile raggiungere il servizio @{service.name}: {url_err.reason}.") from url_err

    content = raw_text.strip()
    metadata: Dict[str, Any] = {"type": "http"}
    try:
        parsed = json.loads(raw_text)
        content = (
            str(parsed.get("content") or parsed.get("output") or parsed.get("response") or content)
        )
        if isinstance(parsed.get("metadata"), dict):
            metadata.update(parsed["metadata"])
        else:
            metadata["raw"] = parsed
    except json.JSONDecodeError:
        metadata["raw"] = raw_text

    return _build_result(service, content, metadata)


def _invoke_command(service: MCPServiceConfig, query: str) -> dict:
    if not service.command:
        raise ValueError(f"Il servizio @{service.name} non ha un comando configurato.")

    cmd = list(service.command)
    stdin_payload = None

    if service.prompt_mode == "argument":
        if service.prompt_arg:
            cmd.extend([service.prompt_arg, query])
        else:
            cmd.append(query)
    else:
        stdin_payload = query + "\n"

    env = os.environ.copy()
    env.update(service.env)

    try:
        completed = subprocess.run(
            cmd,
            input=stdin_payload,
            capture_output=True,
            text=True,
            timeout=service.timeout,
            env=env,
        )
    except FileNotFoundError as err:
        raise RuntimeError(f"Impossibile avviare il comando per @{service.name}: {err}") from err
    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        raise RuntimeError(
            f"Il comando per @{service.name} è terminato con codice {completed.returncode}: {stderr}"
        )

    stdout = (completed.stdout or "").strip()
    if not stdout:
        raise RuntimeError(f"Il servizio @{service.name} non ha prodotto output.")

    metadata: Dict[str, Any] = {"type": "command"}
    content = stdout
    try:
        parsed = json.loads(stdout)
        content = str(
            parsed.get("content")
            or parsed.get("output")
            or parsed.get("response")
            or stdout
        )
        if isinstance(parsed.get("metadata"), dict):
            metadata.update(parsed["metadata"])
        else:
            metadata["raw"] = parsed
    except json.JSONDecodeError:
        metadata["raw"] = stdout

    return _build_result(service, content, metadata)


def _invoke_python_fs(service: MCPServiceConfig, query: str) -> dict:
    sandbox_path_str = service.env.get("SANDBOX_DIR")
    if not sandbox_path_str:
        raise RuntimeError(f"Il servizio @{service.name} non ha una 'SANDBOX_DIR' configurata.")

    sandbox_path = pathlib.Path(sandbox_path_str).resolve()
    if not sandbox_path.is_dir():
        raise RuntimeError(f"La SANDBOX_DIR '{sandbox_path}' per @{service.name} non esiste o non è una cartella.")

    parts = query.strip().split(maxsplit=1)
    command = parts[0].lower()
    args_str = parts[1] if len(parts) > 1 else ""

    content = ""

    try:
        if command == "lista":
            files = [f.name for f in sandbox_path.iterdir()]
            content = "Contenuto della cartella:\n" + "\n".join(files) if files else "La cartella è vuota."

        elif command == "leggi":
            if not args_str:
                raise ValueError("Comando 'leggi' richiede un nome di file.")
            
            target_file = (sandbox_path / args_str).resolve()
            
            if not target_file.is_relative_to(sandbox_path):
                 raise PermissionError("Tentativo di accesso fuori dalla sandbox.")

            if not target_file.is_file():
                raise FileNotFoundError(f"Il file '{args_str}' non esiste.")
            
            content = target_file.read_text(encoding="utf-8", errors="ignore")

        elif command == "scrivi":
            if not args_str:
                raise ValueError("Comando 'scrivi' richiede un nome di file e un contenuto.")
            
            filename, file_content = args_str.split(maxsplit=1)
            target_file = (sandbox_path / filename).resolve()

            if not target_file.is_relative_to(sandbox_path):
                 raise PermissionError("Tentativo di accesso fuori dalla sandbox.")

            target_file.write_text(file_content, encoding="utf-8")
            content = f"File '{filename}' scritto con successo."
        
        else:
            raise ValueError(f"Comando non riconosciuto: '{command}'. Comandi validi: leggi, scrivi, lista.")

    except (ValueError, FileNotFoundError, PermissionError) as e:
        content = f"Errore: {e}"
    except Exception as e:
        content = f"Errore inaspettato: {e}"

    return _build_result(service, content)


def _parse_query(query: str) -> tuple[str, dict]:
    """Helper per dividere la query in tool_name e argomenti."""
    parts = query.split()
    if not parts:
        return "", {}
        
    tool_name = parts[0]
    tool_args = {}
    
    # Euristiche per i tool comuni dei micro-server di test
    if tool_name == "add" and len(parts) >= 3:
        try:
             tool_args = {"a": float(parts[1]), "b": float(parts[2])}
        except ValueError:
             pass
    elif tool_name == "echo" and len(parts) >= 2:
        tool_args = {"text": " ".join(parts[1:])}
    elif tool_name == "ping" and len(parts) > 1:
        try:
            tool_args = {"payload": json.loads(" ".join(parts[1:]))}
        except json.JSONDecodeError:
             pass
             
    return tool_name, tool_args


def _invoke_mcp_stdio(service: MCPServiceConfig, query: str) -> dict:
    if not service.command:
        raise ValueError(f"Il servizio @{service.name} non ha un comando configurato.")

    tool_name, tool_args = _parse_query(query)
    if not tool_name:
        raise ValueError("Query vuota.")
    
    cmd = list(service.command)
    env = os.environ.copy()
    env.update(service.env)
    
    try:
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env
        )
    except FileNotFoundError as err:
        raise RuntimeError(f"Impossibile avviare il comando per @{service.name}: {err}") from err

    # MCP Protocol Handshake
    # 1. Initialize
    init_req = {
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "LAI", "version": "0.1"}
        }
    }
    
    # 2. Tool Call
    call_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": tool_args
        }
    }
    
    init_notif = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    }
    
    result_content = ""
    raw_stdout_log = []

    try:
        # Step 1: Send Initialize
        if not process.stdin or not process.stdout:
            raise RuntimeError("Impossibile aprire stdin/stdout per il processo MCP.")

        process.stdin.write(json.dumps(init_req) + "\n")
        process.stdin.flush()

        # Step 2: Read Initialize Response
        # We read line by line until we find response to id 0
        while True:
            line = process.stdout.readline()
            if not line:
                break
            raw_stdout_log.append(line)
            try:
                msg = json.loads(line)
                if msg.get("id") == 0:
                    # Init complete
                    break
            except json.JSONDecodeError:
                pass

        # Step 3: Send Initialized Notification & Tool Call
        process.stdin.write(json.dumps(init_notif) + "\n")
        process.stdin.write(json.dumps(call_req) + "\n")
        process.stdin.flush()

        # Step 4: Read Tool Result
        while True:
            line = process.stdout.readline()
            if not line:
                break
            raw_stdout_log.append(line)
            try:
                msg = json.loads(line)
                if msg.get("id") == 1:
                    # Found result
                    if "error" in msg:
                        err = msg["error"]
                        result_content = f"Errore MCP: {err.get('message')} (code {err.get('code')})"
                    elif "result" in msg:
                        res = msg["result"]
                        if "content" in res and isinstance(res["content"], list):
                            texts = [c.get("text", "") for c in res["content"] if c.get("type") == "text"]
                            result_content = "\n".join(texts)
                        else:
                            result_content = str(res)
                    break
            except json.JSONDecodeError:
                pass

    except Exception as e:
        result_content = f"Errore di comunicazione MCP: {e}"
    finally:
        # Cleanup
        try:
            process.terminate()
            process.wait(timeout=2)
        except Exception:
            process.kill()

    stdout_data = "".join(raw_stdout_log)
    stderr_data = "(stderr non catturato in modalità interattiva)" 
    
    if not result_content:
        # Fallback debug
        result_content = f"Nessuna risposta valida trovata. Log:\n{stdout_data[:500]}"

    metadata = {"type": "mcp_stdio", "raw_stdout": stdout_data}
    return _build_result(service, result_content, metadata)


def _invoke_mcp_http(service: MCPServiceConfig, query: str) -> dict:
    url = service.endpoint
    if not url:
         raise ValueError(f"Il servizio @{service.name} non ha un URL configurato.")

    tool_name, tool_args = _parse_query(query)
    if not tool_name:
        raise ValueError("Query vuota.")

    content = invoke_mcp_http(url, tool_name, tool_args, service.timeout)
    
    metadata = {"type": "mcp_http", "url": url}
    return _build_result(service, content, metadata)


def execute_service(service_name: str, query: str) -> dict:
    if not MCP_ENABLED:
        raise RuntimeError("Il client MCP è disabilitato nella configurazione.")

    name = (service_name or "").strip().lower()
    if not name:
        raise ValueError("Nome servizio MCP mancante.")

    services = _get_services()
    service_index: Dict[str, MCPServiceConfig] = {svc.name: svc for svc in services}
    service = service_index.get(name)
    if not service:
        raise ValueError(f"Servizio MCP '{service_name}' non configurato.")

    trimmed_query = (query or "").strip()
    if not trimmed_query:
        raise ValueError("La richiesta per il servizio MCP è vuota.")

    if service.service_type == "echo":
        return _build_result(
            service,
            trimmed_query,
            {"type": "echo"},
        )
    if service.service_type == "python_fs":
        return _invoke_python_fs(service, trimmed_query)
    if service.service_type == "mcp_stdio":
        return _invoke_mcp_stdio(service, trimmed_query)
    if service.service_type == "mcp_http":
        return _invoke_mcp_http(service, trimmed_query)
    if service.service_type in {"command", "stdio"}:
        return _invoke_command(service, trimmed_query)
    if service.service_type in {"http", "https", "request"}:
        return _invoke_http(service, trimmed_query)

    raise ValueError(f"Tipo di servizio MCP non supportato: {service.service_type}")
