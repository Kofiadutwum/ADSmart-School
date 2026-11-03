from django.db import migrations

from apps.academics.ges import add_ges_subjects


def add_to_every_school(apps, schema_editor):
    subjects = apps.get_model("academics", "Subject")
    for school in apps.get_model("school", "School").objects.all():
        add_ges_subjects(school, subjects)


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0002_assignments"),
        ("school", "0001_initial"),
    ]

    operations = [migrations.RunPython(add_to_every_school, migrations.RunPython.noop)]
