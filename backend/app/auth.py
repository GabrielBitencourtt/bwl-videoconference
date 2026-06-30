"""
Plug your host app's auth here.

Default: trust X-User-Id / X-User-Name / X-User-Role headers sent by your
backend-for-frontend. Replace with JWT verification, session cookies, etc.
"""
from dataclasses import dataclass
from fastapi import Depends, Header, HTTPException
from .client_auth import optional_client


@dataclass
class CurrentUser:
    id: str
    name: str
    role: str = "user"      # "admin" | "staff" | "user"

    @property
    def is_staff(self) -> bool:
        return self.role in ("admin", "staff")


def _client_user(client: dict) -> CurrentUser:
    """A logged-in portal account acts as the host (admin) of its own license."""
    return CurrentUser(id=str(client["id"]), name=client["name"] or "Anfitrião", role="admin")


async def get_current_user(
    client: dict | None = Depends(optional_client),
    x_user_id: str | None = Header(default=None),
    x_user_name: str | None = Header(default=None),
    x_user_role: str | None = Header(default="user"),
) -> CurrentUser:
    if client:
        return _client_user(client)
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id")
    return CurrentUser(id=x_user_id, name=x_user_name or "User", role=x_user_role or "user")


async def optional_user(
    client: dict | None = Depends(optional_client),
    x_user_id: str | None = Header(default=None),
    x_user_name: str | None = Header(default=None),
    x_user_role: str | None = Header(default="user"),
) -> CurrentUser | None:
    if client:
        return _client_user(client)
    if not x_user_id:
        return None
    return CurrentUser(id=x_user_id, name=x_user_name or "User", role=x_user_role or "user")
