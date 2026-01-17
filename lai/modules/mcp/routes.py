from fastapi import APIRouter, HTTPException

from modules.mcp.manager import (
    execute_service,
    is_enabled as mcp_is_enabled,
    list_public_services,
)
from modules.mcp.schemas import (
    MCPInvokeRequest,
    MCPInvokeResponse,
    MCPServiceListResponse,
)


router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/services", response_model=MCPServiceListResponse)
def list_services():
    services = list_public_services()
    return MCPServiceListResponse(enabled=mcp_is_enabled(), services=services)


@router.post("/invoke", response_model=MCPInvokeResponse)
def invoke_service(req: MCPInvokeRequest):
    if not mcp_is_enabled():
        raise HTTPException(status_code=400, detail="Il client MCP è disabilitato.")

    try:
        result = execute_service(req.client, req.query)
        return MCPInvokeResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
