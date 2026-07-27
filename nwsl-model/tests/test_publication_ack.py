from __future__ import annotations

import io
import urllib.error
from collections.abc import Callable

import pytest

from src.publishing.http import PublicationError, publish_with_readback


class Response:
    def __init__(self, payload: bytes, status: int = 200) -> None:
        self._payload = io.BytesIO(payload)
        self.status = status

    def __enter__(self) -> "Response":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, _limit: int = -1) -> bytes:
        return self._payload.read()


def test_lost_post_response_is_confirmed_by_readback_without_a_second_post() -> None:
    calls: list[str] = []

    def opener(request: object, timeout: float) -> Response:
        del timeout
        method = getattr(request, "method", "")
        calls.append(method)
        if method == "POST":
            raise urllib.error.URLError("response lost")
        return Response(
            b'{"ok":true,"publication":{"runKey":"run-1","modelVersion":"v1"}}'
        )

    result = publish_with_readback(
        payload={"run": {"runKey": "run-1", "modelVersion": "v1"}},
        publish_url="https://example.test/publish",
        secret="secret",
        expected={"runKey": "run-1", "modelVersion": "v1"},
        opener=opener,
        max_attempts=3,
        retry_delay_seconds=0,
    )

    assert result["status"] == "confirmed_by_readback"
    assert calls == ["POST", "GET"]


def test_retryable_failure_is_bounded_and_reports_failed() -> None:
    def opener(_request: object, timeout: float) -> Response:
        del timeout
        raise urllib.error.URLError("offline")

    with pytest.raises(PublicationError, match="failed after 2 attempts"):
        publish_with_readback(
            payload={"run": {"runKey": "run-1"}},
            publish_url="https://example.test/publish",
            secret="secret",
            expected={"runKey": "run-1"},
            opener=opener,
            max_attempts=2,
            retry_delay_seconds=0,
        )
