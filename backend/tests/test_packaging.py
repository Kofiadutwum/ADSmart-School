"""What Render installs and runs for the backend, and the website's daily cron on Vercel."""

import json
import tomllib
from pathlib import Path

import pytest

import release

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent


def pinned() -> list[str]:
    lines = (BACKEND / "requirements.txt").read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def test_the_server_installs_what_requirements_pin():
    project = tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))["project"]

    assert project["dependencies"] == pinned()
    assert project["requires-python"] == ">=3.14"
    assert any(line.startswith("cloudinary==") for line in pinned())
    assert any(line.startswith("gunicorn==") for line in pinned())


def test_render_updates_the_database_then_starts_gunicorn_on_the_free_plan():
    blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")

    assert "rootDir: backend" in blueprint
    assert "plan: free" in blueprint and "region: frankfurt" in blueprint
    assert "startCommand: python release.py && gunicorn config.wsgi:application" in blueprint
    assert "healthCheckPath: /api/health" in blueprint
    secrets = ("DATABASE_URL", "CLOUDINARY_URL", "PROXY_SECRET", "CRON_SECRET", "BREVO_API_KEY")
    for secret in secrets:  # typed into Render, never committed
        assert f"key: {secret}\n        sync: false" in blueprint
    assert not (BACKEND / "vercel.json").exists()


def test_the_website_wakes_the_backend_then_runs_the_daily_jobs():
    config = json.loads((ROOT / "frontend" / "vercel.json").read_text(encoding="utf-8"))

    assert config["crons"] == [
        {"path": "/api/health", "schedule": "0 6 * * *"},
        {"path": "/api/cron/jobs", "schedule": "5 6 * * *"},
    ]


def test_the_build_updates_the_database_only_when_there_is_one():
    ran: list[str] = []

    release.build({}, run=ran.append)
    assert ran == []

    release.build({"DATABASE_URL": "postgres://example"}, run=ran.append)
    assert ran == ["migrate", "createcachetable"]


@pytest.mark.django_db
def test_the_start_up_commands_run_with_the_options_each_accepts():
    for command in ("migrate", "createcachetable"):
        release.run_command(command)  # raised TypeError on Render before the fix
