from django.db import migrations

CREATE = """
CREATE OR REPLACE FUNCTION audit_auditlog_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_auditlog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_auditlog_no_change BEFORE UPDATE OR DELETE ON audit_auditlog
FOR EACH ROW EXECUTE FUNCTION audit_auditlog_append_only();
"""

DROP = """
DROP TRIGGER IF EXISTS audit_auditlog_no_change ON audit_auditlog;
DROP FUNCTION IF EXISTS audit_auditlog_append_only();
"""


def forwards(apps, schema_editor):
    # PostgreSQL only; production also denies UPDATE/DELETE to the app's role (Plan 6).
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(CREATE)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(DROP)


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [migrations.RunPython(forwards, backwards)]
