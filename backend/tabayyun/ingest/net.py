"""URL validation for server-side fetching (SSRF guard: public http/https hosts only)."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

from .document import IngestError


async def validate_public_url(url: str | None) -> str:
    if not url or not url.strip():
        raise IngestError("empty_input")
    url = url.strip()
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise IngestError("invalid_url")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise IngestError("invalid_url", str(e)) from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise IngestError("invalid_url", "non-public address")
    return url
