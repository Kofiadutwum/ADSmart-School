"""Run before the server starts on Render: bring the database up to date, so the new code
never runs against old tables. (Render's free plan has no separate pre-deploy step.)"""

import os
from collections.abc import Callable, Mapping


def build(environ: Mapping[str, str], run: Callable[[str], object]) -> None:
    if not environ.get("DATABASE_URL"):  # a preview without a database: nothing to update
        return
    run("migrate")
    run("createcachetable")


def run_command(command: str) -> None:
    from django.core.management import call_command

    # Only migrate can ask questions; createcachetable refuses the option.
    call_command(command, **({"interactive": False} if command == "migrate" else {}))


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()
    build(os.environ, run=run_command)


if __name__ == "__main__":
    main()
