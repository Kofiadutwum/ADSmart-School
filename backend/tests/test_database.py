from django.db import connection


def test_tests_run_on_postgresql():
    # Spec §13: from Plan 2 on, development and tests use PostgreSQL.
    assert connection.vendor == "postgresql"
