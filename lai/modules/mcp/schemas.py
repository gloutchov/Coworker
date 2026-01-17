from typing import Any, Optional

from pydantic import BaseModel


class MCPServicePublic(BaseModel):
    model_config = {"protected_namespaces": ()}
    name: str
    label: str
    description: str = ""
    type: str = ""
    instructions: Optional[str] = None


class MCPServiceListResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    enabled: bool
    services: list[MCPServicePublic]


class MCPInvokeRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    client: str
    query: str


class MCPContextBlock(BaseModel):
    model_config = {"protected_namespaces": ()}
    client: str
    title: str
    description: str = ""
    content: str


class MCPInvokeResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    client: str
    title: str
    description: str = ""
    content: str
    metadata: Optional[dict[str, Any]] = None
