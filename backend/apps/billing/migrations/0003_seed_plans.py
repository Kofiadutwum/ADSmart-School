"""The owner's starting plans (2026-10-11). Added once; later edits in the admin area are kept."""

from django.db import migrations

STARTING_PLANS = (
    ("basic", "Basic", 120_000, False, "Small schools and newly established private schools"),
    ("standard", "Standard", 240_000, False, "Established basic schools and junior high schools"),
    ("professional", "Professional", 480_000, False, "Larger schools requiring more administrative tools"),
    ("premium", "Premium", 720_000, False, "Large schools requiring extensive features"),
    ("enterprise", "Enterprise", 1_000_000, True, "School groups and multiple campuses"),
)


def seed(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    for order, (code, name, price, from_price, audience) in enumerate(STARTING_PLANS):
        Plan.objects.get_or_create(
            code=code,
            defaults={"name": name, "yearly_price": price, "from_price": from_price, "audience": audience, "order": order},
        )


class Migration(migrations.Migration):
    dependencies = [("billing", "0002_billingsettings_bank_details_and_more")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
