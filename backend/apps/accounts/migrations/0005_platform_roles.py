from django.db import migrations

# Copied names: migrations must not change when apps.accounts.roles does.
OLD, OWNER = "Platform Admin", "Platform Owner"
OTHERS = ("Platform Finance", "Platform Content", "Platform Support")


def forwards(apps, schema_editor):
    """Every existing team account becomes an Owner (business tools spec §2)."""
    Group = apps.get_model("auth", "Group")
    User = apps.get_model("accounts", "User")
    owner = Group.objects.filter(name=OLD).first()
    if owner is None:
        owner, _ = Group.objects.get_or_create(name=OWNER)
    else:
        owner.name = OWNER
        owner.save(update_fields=["name"])
    for name in OTHERS:
        Group.objects.get_or_create(name=name)
    roleless = User.objects.filter(kind="platform").exclude(groups__name__in=[OWNER, *OTHERS])
    for user in roleless:
        user.groups.add(owner)


def backwards(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=OTHERS).delete()
    Group.objects.filter(name=OWNER).update(name=OLD)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0004_codes_by_sms_or_email")]

    operations = [migrations.RunPython(forwards, backwards)]
