from django.db import migrations

# Copied from apps.accounts.roles: migrations must not change when that module does.
ROLES = (
    "Administrator",
    "Proprietor",
    "Head Teacher",
    "Accountant",
    "Teacher",
    "Early Years Caregiver",
    "Front Desk Officer",
    "School Nurse",
    "Bookshop Keeper",
    "Canteen Officer",
    "Transport Officer",
    "Parent",
    "Student",
    "Platform Admin",
)


def create_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ROLES:
        Group.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [migrations.RunPython(create_groups, migrations.RunPython.noop)]
