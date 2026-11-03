import pytest

from apps.academics.ges import add_ges_subjects
from apps.academics.models import Subject
from apps.website.provisioning import create_school
from tests.helpers import make_school

pytestmark = pytest.mark.django_db


def codes(school):
    return set(Subject.objects.for_school(school).values_list("code", flat=True))


def test_a_new_school_starts_with_the_ges_subjects_for_its_levels():
    school = create_school(
        slug="brightfuture",
        name="Bright Future Academy",
        town="Ejisu",
        region="Ashanti Region",
        phone="024 123 4567",
        email="office@brightfuture.example",
        levels_offered=["kg", "lower_primary"],
    )

    assert codes(school) == {"LL", "NUM", "OWOP", "CA", "ENG", "GHL", "MATH", "SCI", "RME", "PE"}
    owop = Subject.objects.for_school(school).get(code="OWOP")
    assert owop.bands == ["kg", "lower_primary"]
    assert Subject.objects.for_school(school).get(code="NUM").is_learning_area


def test_adding_again_keeps_the_schools_own_edits_and_subjects():
    school = make_school(levels_offered=["jhs"])
    Subject.objects.create(school=school, name="French", code="FRE", bands=["jhs"])
    Subject.objects.create(school=school, name="Maths", code="MATH", bands=["jhs"])

    made = add_ges_subjects(school)

    assert "MATH" not in {row.code for row in made}
    assert Subject.objects.for_school(school).get(code="MATH").name == "Maths"
    assert {"FRE", "SOC", "CT", "CAD"} <= codes(school)
    assert add_ges_subjects(school) == []
