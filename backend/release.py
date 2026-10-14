"""Run before the server starts on Render: bring the database up to date, so the new code
never runs against old tables. (Render's free plan has no separate pre-deploy step.)"""

import os
from collections.abc import Callable, Mapping


def build(environ: Mapping[str, str], run: Callable[[str], object]) -> None:
    if not environ.get("DATABASE_URL"):  # a preview without a database: nothing to update
        return
    run("migrate")
    run("createcachetable")


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    from django.core.management import call_command

    django.setup()
    build(os.environ, run=lambda command: call_command(command, interactive=False))


if __name__ == "__main__":
    main()
