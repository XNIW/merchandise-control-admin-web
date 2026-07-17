#!/usr/bin/env python3
"""Refresh the disposable TASK-088 session without logging credentials."""

from __future__ import annotations

import base64
import json
import os
import stat
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit


DEFAULT_ANDROID_SESSION_PATH = Path("/private/tmp/task088-session-android.json")
DEFAULT_IOS_SESSION_PATH = Path("/private/tmp/task088-session-ios.json")


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"{name}_missing")
    return value


def configured_path(name: str, default: Path) -> Path:
    value = os.environ.get(name, "").strip()
    return Path(value) if value else default


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_supabase_target(url: str, project_ref: str) -> str:
    parts = urlsplit(url)
    hostname = (parts.hostname or "").lower()
    if parts.scheme not in {"http", "https"} or not hostname:
        raise ValueError("supabase_url_invalid")
    if hostname.endswith(".supabase.co"):
        url_project_ref = hostname.removesuffix(".supabase.co")
        if url_project_ref != project_ref:
            raise ValueError("supabase_project_ref_mismatch")
    elif hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("supabase_target_not_allowlisted")
    return url.rstrip("/")


def cookie_target(admin_base_url: str) -> tuple[str, str]:
    parts = urlsplit(admin_base_url)
    hostname = (parts.hostname or "").lower()
    if parts.scheme not in {"http", "https"} or not hostname:
        raise ValueError("admin_base_url_invalid")
    return hostname, "TRUE" if parts.scheme == "https" else "FALSE"


def disposable_user_email(url: str, current: dict[str, str]) -> str:
    service_key = required_environment("SUPABASE_SERVICE_ROLE_KEY")
    jwt_payload = current["access"].split(".")[1]
    jwt_payload += "=" * ((4 - len(jwt_payload) % 4) % 4)
    user_id = json.loads(base64.urlsafe_b64decode(jwt_payload))["sub"]
    user_request = urllib.request.Request(
        f"{url}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(user_request, timeout=30) as response:
        return json.load(response)["email"]


def password_reauthenticate(
    url: str,
    publishable_key: str,
    current: dict[str, str],
) -> dict:
    password = required_environment("DEV_PLATFORM_ADMIN_PASSWORD")
    email = disposable_user_email(url, current)
    login_request = urllib.request.Request(
        f"{url}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {publishable_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(login_request, timeout=30) as response:
        return json.load(response)


def magic_link_reauthenticate(
    url: str,
    publishable_key: str,
    current: dict[str, str],
) -> dict:
    service_key = required_environment("SUPABASE_SERVICE_ROLE_KEY")
    email = disposable_user_email(url, current)
    generate_request = urllib.request.Request(
        f"{url}/auth/v1/admin/generate_link",
        data=json.dumps({"type": "magiclink", "email": email}).encode("utf-8"),
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(generate_request, timeout=30) as response:
        token_hash = json.load(response)["hashed_token"]
    verify_request = urllib.request.Request(
        f"{url}/auth/v1/verify",
        data=json.dumps({"type": "magiclink", "token_hash": token_hash}).encode(
            "utf-8"
        ),
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {publishable_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(verify_request, timeout=30) as response:
        return json.load(response)


def reauthenticate(
    url: str,
    publishable_key: str,
    current: dict[str, str],
) -> dict:
    if os.environ.get("DEV_PLATFORM_ADMIN_PASSWORD", "").strip():
        try:
            return password_reauthenticate(url, publishable_key, current)
        except urllib.error.HTTPError as error:
            if error.code not in {400, 401}:
                raise
    return magic_link_reauthenticate(url, publishable_key, current)


def refresh() -> None:
    project_ref = required_environment("SUPABASE_PROJECT_REF")
    url = validate_supabase_target(
        required_environment("NEXT_PUBLIC_SUPABASE_URL"),
        project_ref,
    )
    publishable_key = required_environment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    admin_hostname, secure = cookie_target(
        required_environment("MC_ADMIN_BASE_URL")
    )
    cookie_path = Path(required_environment("MC_ADMIN_SESSION_COOKIE_FILE"))
    android_session_path = configured_path(
        "MC_ANDROID_TASK072_SESSION_FILE",
        DEFAULT_ANDROID_SESSION_PATH,
    )
    ios_session_path = configured_path(
        "TASK088_FINAL_SYNC_SESSION_FILE",
        DEFAULT_IOS_SESSION_PATH,
    )

    current = json.loads(android_session_path.read_text(encoding="utf-8"))
    request = urllib.request.Request(
        f"{url}/auth/v1/token?grant_type=refresh_token",
        data=json.dumps({"refresh_token": current["refresh"]}).encode("utf-8"),
        headers={
            "apikey": publishable_key,
            "Authorization": f"Bearer {publishable_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            renewed = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code not in {400, 401}:
            raise
        renewed = reauthenticate(url, publishable_key, current)

    access = renewed["access_token"]
    refresh_token = renewed["refresh_token"]
    session_content = json.dumps(
        {"access": access, "refresh": refresh_token},
        separators=(",", ":"),
    )
    for path in (android_session_path, ios_session_path):
        atomic_write(path, session_content)

    cookie_value = "base64-" + base64.b64encode(
        json.dumps(renewed, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    cookie_name = f"sb-{project_ref}-auth-token"
    expires_at = int(renewed["expires_at"])
    cookie_content = (
        "# Netscape HTTP Cookie File\n"
        "# Generated for the disposable TASK-088 synthetic session.\n\n"
        f"{admin_hostname}\tFALSE\t/\t{secure}\t{expires_at}\t"
        f"{cookie_name}\t{cookie_value}\n"
    )
    atomic_write(cookie_path, cookie_content)


if __name__ == "__main__":
    try:
        refresh()
    except (
        IndexError,
        KeyError,
        OSError,
        TypeError,
        urllib.error.URLError,
        ValueError,
    ) as error:
        raise SystemExit(f"TASK-088 session refresh failed: {type(error).__name__}")
