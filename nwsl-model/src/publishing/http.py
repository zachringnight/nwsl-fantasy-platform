"""Acknowledgement-safe HTTP publishing with authenticated readback."""

from __future__ import annotations

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from typing import Any


MAX_RESPONSE_BYTES = 65_536


class PublicationError(RuntimeError):
    """A publisher could not verify the requested durable state."""


def _request_json(
    req: urllib.request.Request,
    *,
    opener: Callable[..., Any],
    timeout: float,
) -> dict[str, Any]:
    try:
        with opener(req, timeout=timeout) as response:
            status = int(getattr(response, "status", 200))
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if 500 <= exc.code < 600:
            raise OSError(f"publisher HTTP {exc.code}") from exc
        raise PublicationError(f"publisher rejected the request with HTTP {exc.code}") from exc
    except (TimeoutError, socket.timeout, urllib.error.URLError, OSError) as exc:
        raise OSError(type(exc).__name__) from exc

    if len(raw) > MAX_RESPONSE_BYTES:
        raise PublicationError("publisher response exceeded the safety limit")
    if status < 200 or status >= 300:
        if status >= 500:
            raise OSError(f"publisher HTTP {status}")
        raise PublicationError(f"publisher rejected the request with HTTP {status}")
    try:
        parsed = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OSError("publisher returned an unreadable response") from exc
    if not isinstance(parsed, dict):
        raise OSError("publisher returned a non-object response")
    return parsed


def _receipt(response: Mapping[str, Any]) -> Mapping[str, Any]:
    for key in ("publication", "run", "state"):
        value = response.get(key)
        if isinstance(value, Mapping):
            return value
    return response


def _matches_expected(
    response: Mapping[str, Any],
    expected: Mapping[str, Any],
) -> bool:
    receipt = _receipt(response)
    aliases = {
        "runKey": ("runKey", "key"),
        "modelVersion": ("modelVersion", "artifactVersion"),
        "artifactVersion": ("artifactVersion", "modelVersion"),
    }
    for key, expected_value in expected.items():
        candidate = None
        for candidate_key in aliases.get(key, (key,)):
            if candidate_key in receipt:
                candidate = receipt[candidate_key]
                break
        if candidate != expected_value:
            return False
    return True


def _readback_url(publish_url: str, run_key: str) -> str:
    parsed = urllib.parse.urlparse(publish_url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(("runKey", run_key))
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(query))
    )


def publish_with_readback(
    *,
    payload: Mapping[str, Any],
    publish_url: str,
    secret: str,
    expected: Mapping[str, Any],
    timeout: float = 45.0,
    max_attempts: int = 3,
    retry_delay_seconds: float = 1.0,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> dict[str, Any]:
    """Publish once per attempt and resolve ambiguous responses by readback."""
    if not secret:
        raise PublicationError("publish secret is empty")
    if max_attempts < 1 or max_attempts > 5:
        raise PublicationError("max_attempts must be between 1 and 5")
    parsed = urllib.parse.urlparse(publish_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise PublicationError("publish URL must be an absolute HTTPS URL")
    run_key = str(expected.get("runKey") or "")
    if not run_key:
        raise PublicationError("expected runKey is required for readback")

    body = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
        "User-Agent": "nwsl-publication-client/2.0",
    }

    for attempt in range(1, max_attempts + 1):
        post = urllib.request.Request(
            publish_url,
            data=body,
            method="POST",
            headers=headers,
        )
        try:
            response = _request_json(post, opener=opener, timeout=timeout)
            if response.get("ok") is True and _matches_expected(response, expected):
                return {
                    "status": "confirmed",
                    "attempts": attempt,
                    "receipt": dict(_receipt(response)),
                }
            raise OSError("publisher response did not match the requested state")
        except PublicationError:
            raise
        except OSError:
            readback = urllib.request.Request(
                _readback_url(publish_url, run_key),
                method="GET",
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {secret}",
                    "User-Agent": "nwsl-publication-client/2.0",
                },
            )
            try:
                response = _request_json(
                    readback,
                    opener=opener,
                    timeout=timeout,
                )
                if response.get("ok") is True and _matches_expected(response, expected):
                    return {
                        "status": "confirmed_by_readback",
                        "attempts": attempt,
                        "receipt": dict(_receipt(response)),
                    }
            except (OSError, PublicationError):
                pass

        if attempt < max_attempts and retry_delay_seconds > 0:
            time.sleep(retry_delay_seconds * attempt)

    raise PublicationError(
        f"publication failed after {max_attempts} attempts without verified readback"
    )
