"""Scheduled work (SMS spec §32): reminders, re-checks and alerts. Each app lists its jobs in a
`jobs.py` with the `job` decorator; one cron call runs them all, once a day on Vercel Hobby."""

import logging
from collections.abc import Callable
from importlib import import_module

log = logging.getLogger(__name__)

JOBS: dict[str, Callable[[], int]] = {}
MODULES = (
    "apps.finance.jobs",
    "apps.shop.jobs",
    "apps.billing.jobs",
    "apps.transport.jobs",
    "apps.platform_content.jobs",
)


def job(name: str):
    def register(function: Callable[[], int]):
        JOBS[name] = function
        return function

    return register


def run_all() -> dict[str, object]:
    """Runs every job; one failing job never stops the others."""
    for module in MODULES:
        import_module(module)
    results: dict[str, object] = {}
    for name, function in JOBS.items():
        try:
            results[name] = function()
        except Exception as exc:  # logged for the team; the other jobs still run
            log.exception("Job %s failed", name)
            results[name] = f"failed: {type(exc).__name__}"
    return results
