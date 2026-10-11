"""Plan 6A Task 1: what Vercel installs and runs."""

import json
import tomllib
from pathlib import Path

import vercel_build

BACKEND = Path(__file__).resolve().parent.parent


def pinned() -> list[str]:
    lines = (BACKEND / "requirements.txt").read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def test_vercel_installs_what_requirements_pin():
    project = tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))["project"]

    assert project["dependencies"] == pinned()
    assert project["requires-python"] == ">=3.14"
    assert any(line.startswith("cloudinary==") for line in pinned())


def test_vercel_runs_the_wsgi_app_and_a_daily_cron():
    vercel = tomllib.loads((BACKEND / "pyproject.toml").read_text(encoding="utf-8"))["tool"][
        "vercel"
    ]
    config = json.loads((BACKEND / "vercel.json").read_text(encoding="utf-8"))

    assert vercel["entrypoint"] == "config.wsgi:application"
    assert vercel["scripts"]["build"] == "python vercel_build.py"
    assert config["crons"] == [{"path": "/api/cron/article-emails", "schedule": "0 7 * * *"}]
    assert config["functions"]["config/wsgi.py"]["maxDuration"] == 60


def test_the_build_updates_the_database_only_when_there_is_one():
    ran: list[str] = []

    vercel_build.build({}, run=ran.append)
    assert ran == []

    vercel_build.build({"DATABASE_URL": "postgres://example"}, run=ran.append)
    assert ran == ["migrate", "createcachetable"]
