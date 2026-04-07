"""Versioned artifact and champion registry helpers."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.utils.io import load_json, save_json

ARTIFACT_ROOT = Path(__file__).resolve().parents[2] / "data" / "processed" / "models"
LATEST_ALIAS = "latest"
PURE_ALIAS = "champion_pure"
BLENDED_ALIAS = "champion_blended"


def champion_registry_path(root: Path = ARTIFACT_ROOT) -> Path:
    return root / "champions.json"


def create_version_id(now: datetime | None = None) -> str:
    current = now or datetime.now(UTC)
    return current.strftime("%Y%m%dT%H%M%SZ")


def ensure_artifact_root(root: Path = ARTIFACT_ROOT) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_version_dir(version: str | None = None, root: Path = ARTIFACT_ROOT) -> Path:
    ensure_artifact_root(root)
    version_id = version or create_version_id()
    version_dir = root / version_id
    version_dir.mkdir(parents=True, exist_ok=True)
    return version_dir


def list_version_dirs(root: Path = ARTIFACT_ROOT) -> list[Path]:
    if not root.exists():
        return []
    return sorted([path for path in root.iterdir() if path.is_dir() and path.name != "__pycache__"])


def latest_version_dir(root: Path = ARTIFACT_ROOT) -> Path | None:
    versions = list_version_dirs(root)
    return versions[-1] if versions else None


def resolve_version_dir(version: str | None = None, root: Path = ARTIFACT_ROOT) -> Path:
    if version and version != LATEST_ALIAS:
        version_dir = root / version
        if not version_dir.exists():
            raise FileNotFoundError(f"Artifact version not found: {version_dir}")
        return version_dir
    latest = latest_version_dir(root)
    if latest is None:
        raise FileNotFoundError(f"No artifact versions found under {root}")
    return latest


def write_artifact_json(version_dir: Path, filename: str, payload: dict[str, Any]) -> Path:
    path = version_dir / filename
    save_json(payload, path)
    return path


def model_pickle_path(version_dir: Path, model_family: str) -> Path:
    return version_dir / f"{model_family}_model.pkl"


def load_champion_registry(root: Path = ARTIFACT_ROOT) -> dict[str, Any]:
    registry_path = champion_registry_path(root)
    if not registry_path.exists():
        return {"aliases": {}, "experimental": {}}
    return load_json(registry_path)


def save_champion_registry(payload: dict[str, Any], root: Path = ARTIFACT_ROOT) -> Path:
    ensure_artifact_root(root)
    registry_path = champion_registry_path(root)
    save_json(payload, registry_path)
    return registry_path


def available_model_names(root: Path = ARTIFACT_ROOT) -> list[str]:
    names: set[str] = set()
    registry = load_champion_registry(root)
    names.update(registry.get("aliases", {}).keys())
    latest = latest_version_dir(root)
    if latest:
        names.update(path.stem.replace("_model", "") for path in latest.glob("*_model.pkl"))
    return sorted(names)


def resolve_model_artifact(model_name: str, root: Path = ARTIFACT_ROOT) -> dict[str, Any]:
    """Resolve a model alias or raw family to its artifact bundle."""
    registry = load_champion_registry(root)
    alias_payload = registry.get("aliases", {}).get(model_name)
    if alias_payload:
        version_dir = resolve_version_dir(alias_payload["version"], root)
        model_family = alias_payload["model_family"]
        evaluation_model = alias_payload.get("evaluation_model", model_family)
        return {
            "requested_model": model_name,
            "version": alias_payload["version"],
            "version_dir": version_dir,
            "model_family": model_family,
            "evaluation_model": evaluation_model,
            "blended": bool(alias_payload.get("blended", False)),
            "gating_status": alias_payload.get("gating_status", "unknown"),
            "metadata": alias_payload,
        }

    version_dir = latest_version_dir(root)
    if version_dir is None:
        raise FileNotFoundError(f"No artifacts found under {root}")
    candidate = model_pickle_path(version_dir, model_name)
    if not candidate.exists():
        raise FileNotFoundError(
            f"Model alias '{model_name}' was not promoted and raw model file was not found in {version_dir}"
        )
    return {
        "requested_model": model_name,
        "version": version_dir.name,
        "version_dir": version_dir,
        "model_family": model_name,
        "evaluation_model": model_name,
        "blended": model_name == "full_blend",
        "gating_status": "unpromoted",
        "metadata": {},
    }
