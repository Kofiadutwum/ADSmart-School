import pytest

from apps.academics.models import Subject, TeachingAssignment
from tests.records import make_class, make_staff, make_term, make_year

pytestmark = pytest.mark.django_db
BULK = "/api/school/teaching/bulk"


@pytest.fixture
def year(school):
    return make_year(school)


@pytest.fixture
def terms(year):
    return [make_term(year, 1), make_term(year, 2)]


@pytest.fixture
def teacher(school):
    return make_staff(school, username="a.teacher", first_name="Abena", surname="Owusu")


def subject(school, name, code, bands):
    return Subject.objects.create(school=school, name=name, code=code, bands=bands)


def taught(staff):
    return sorted(
        (row.subject.code, row.school_class.name, row.term.number)
        for row in TeachingAssignment.objects.filter(staff=staff)
    )


def test_gives_a_teacher_every_subject_in_every_class_for_the_whole_year(
    admin, school, year, terms, teacher
):
    maths = subject(school, "Mathematics", "MATH", ["upper_primary", "jhs"])
    science = subject(school, "Science", "SCI", ["upper_primary"])
    four_a, jhs = make_class(year, "basic_4", "A"), make_class(year, "basic_7")
    body = {"staff": teacher.pk, "classes": [four_a.pk, jhs.pk], "subjects": [maths.pk, science.pk]}

    response = admin.post(BULK, body, format="json")

    assert response.status_code == 201, response.json()
    assert taught(teacher) == [
        ("MATH", "Basic 4A", 1),
        ("MATH", "Basic 4A", 2),
        ("MATH", "JHS 1", 1),
        ("MATH", "JHS 1", 2),
        ("SCI", "Basic 4A", 1),
        ("SCI", "Basic 4A", 2),
    ]
    result = response.json()
    assert len(result["added"]) == 6
    assert result["skipped"] == [{"subject": "Science", "class": "JHS 1"}]
    assert result["replaced"] == []


def test_one_term_only_and_a_repeat_adds_nothing(admin, school, year, terms, teacher):
    maths = subject(school, "Mathematics", "MATH", ["upper_primary"])
    four = make_class(year, "basic_4")
    body = {"staff": teacher.pk, "classes": [four.pk], "subjects": [maths.pk], "term": terms[1].pk}

    assert admin.post(BULK, body, format="json").status_code == 201
    again = admin.post(BULK, body, format="json").json()

    assert taught(teacher) == [("MATH", "Basic 4", 2)]
    assert again["added"] == []


def test_replaces_whoever_taught_that_subject_to_that_class(admin, school, year, terms, teacher):
    maths = subject(school, "Mathematics", "MATH", ["upper_primary"])
    english = subject(school, "English Language", "ENG", ["upper_primary"])
    four = make_class(year, "basic_4")
    other = make_staff(school, username="y.boateng", first_name="Yaw", surname="Boateng")
    for each in (maths, english):
        TeachingAssignment.objects.create(
            staff=other, school_class=four, subject=each, term=terms[0]
        )
    body = {"staff": teacher.pk, "classes": [four.pk], "subjects": [maths.pk], "term": terms[0].pk}

    result = admin.post(BULK, body, format="json").json()

    assert result["replaced"] == [
        {"teacher": "Yaw Boateng", "subject": "Mathematics", "class": "Basic 4", "term": 1}
    ]
    assert taught(other) == [("ENG", "Basic 4", 1)]
    assert taught(teacher) == [("MATH", "Basic 4", 1)]


def test_refuses_another_schools_class_and_an_empty_choice(
    admin, school, other_school, year, terms, teacher
):
    maths = subject(school, "Mathematics", "MATH", ["kg"])
    theirs = make_class(make_year(other_school), "kg_1")
    body = {"staff": teacher.pk, "classes": [theirs.pk], "subjects": [maths.pk]}
    assert admin.post(BULK, body, format="json").status_code == 400
    empty = admin.post(BULK, {**body, "classes": []}, format="json")
    assert "classes" in empty.json()["fields"]
    assert not TeachingAssignment.objects.exists()
