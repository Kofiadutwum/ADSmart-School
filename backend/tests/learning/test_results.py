"""Results and report cards (SMS spec §7–§9): weighted totals, grades, positions with the school's
tie rule, the approval workflow, and report cards withheld for arrears."""

from decimal import Decimal

import pytest

from apps.academics.models import Subject, TeachingAssignment
from apps.finance import services
from apps.learning.models import AssessmentComponent, GradingScale, Mark, ResultRules, ResultSheet
from apps.learning.results import class_results, rank, report_card
from apps.people.services import enrol
from tests.records import make_class, make_staff, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


def test_ties_share_a_position_by_the_schools_rule():
    values = {1: Decimal(90), 2: Decimal(80), 3: Decimal(80), 4: Decimal(70)}
    assert rank(values, "SHARED") == {1: 1, 2: 2, 3: 2, 4: 4}
    assert rank(values, "DENSE") == {1: 1, 2: 2, 3: 2, 4: 3}


@pytest.fixture
def scored(school):
    year = make_year(school)
    term = make_term(year)
    klass = make_class(year, "basic_5")
    maths = Subject.objects.create(
        school=school, name="Mathematics", code="MATH", bands=["upper_primary"]
    )
    teacher = make_staff(school, username="maths.teacher")
    TeachingAssignment.objects.create(
        school=school, staff=teacher, school_class=klass, subject=maths, term=term
    )
    test = AssessmentComponent.objects.create(
        school=school,
        band="upper_primary",
        academic_year=year,
        name="Class test",
        weight=30,
        max_score=20,
    )
    exam = AssessmentComponent.objects.create(
        school=school,
        band="upper_primary",
        academic_year=year,
        name="Exam",
        weight=70,
        max_score=100,
    )
    GradingScale.objects.create(
        school=school,
        band="upper_primary",
        academic_year=year,
        rows=[
            {"min": 0, "max": 49.9, "grade": "F"},
            {"min": 50, "max": 79.9, "grade": "B"},
            {"min": 80, "max": 100, "grade": "A"},
        ],
    )
    ResultRules.objects.create(
        school=school, band="upper_primary", academic_year=year, positions_enabled=True
    )
    pupils = [make_student(school, first_name=name) for name in ("Ama", "Kojo")]
    for pupil in pupils:
        enrol(pupil, klass, start_date=term.start_date)
    return {
        "term": term,
        "class": klass,
        "subject": maths,
        "teacher": teacher,
        "test": test,
        "exam": exam,
        "pupils": pupils,
    }


def test_totals_are_weighted_and_graded(school, scored):
    ama, kojo = scored["pupils"]
    for pupil, test, exam in ((ama, 20, 90), (kojo, 10, 50)):
        Mark.objects.create(
            school=school,
            student=pupil,
            subject=scored["subject"],
            term=scored["term"],
            component=scored["test"],
            score=test,
        )
        Mark.objects.create(
            school=school,
            student=pupil,
            subject=scored["subject"],
            term=scored["term"],
            component=scored["exam"],
            score=exam,
        )
    ResultSheet.objects.create(
        school=school, school_class=scored["class"], subject=scored["subject"], term=scored["term"]
    )

    rows = {
        row["name"].split()[0]: row
        for row in class_results(scored["class"], scored["term"])["pupils"]
    }
    assert rows["Ama"]["subjects"]["Mathematics"]["total"] == Decimal("93.0")
    assert rows["Ama"]["subjects"]["Mathematics"]["grade"] == "A"
    assert rows["Kojo"]["subjects"]["Mathematics"]["total"] == Decimal("50.0")
    assert (rows["Ama"]["position"], rows["Kojo"]["position"]) == (1, 2)


def test_marks_lock_once_submitted_and_families_see_only_published_results(
    school, scored, client_for
):
    teacher = client_for("Teacher")
    teacher.staff = scored["teacher"]
    from rest_framework.test import APIClient

    teacher = APIClient(HTTP_HOST="adsmart.localhost")
    teacher.force_login(scored["teacher"].user)
    ama = scored["pupils"][0]
    body = {
        "school_class": scored["class"].pk,
        "subject": scored["subject"].pk,
        "term": scored["term"].pk,
        "marks": [{"student": ama.pk, "component": scored["exam"].pk, "score": "80"}],
    }
    assert teacher.post("/api/school/learning/marks", body, format="json").status_code == 200
    too_high = {
        **body,
        "marks": [{"student": ama.pk, "component": scored["test"].pk, "score": "25"}],
    }
    assert teacher.post("/api/school/learning/marks", too_high, format="json").status_code == 400

    sheet = ResultSheet.objects.get()
    assert teacher.post(f"/api/school/learning/sheets/{sheet.pk}/submit").status_code == 200
    assert (
        teacher.post("/api/school/learning/marks", body, format="json").json()["code"] == "locked"
    )
    assert report_card(ama, scored["term"], for_family=True)["subjects"] == {}

    head = client_for("Head Teacher")
    assert head.post(f"/api/school/learning/sheets/{sheet.pk}/approve").status_code == 200
    assert head.post(f"/api/school/learning/sheets/{sheet.pk}/publish").status_code == 200
    assert "Mathematics" in report_card(ama, scored["term"], for_family=True)["subjects"]


def test_a_report_card_is_withheld_for_arrears_until_the_head_teacher_releases_it(
    school, scored, client_for
):
    from apps.learning.models import ReportSettings

    ama = scored["pupils"][0]
    ReportSettings.objects.create(school=school, withhold_for_arrears=True)
    services.adjust(ama, "FEES", 10_000, "Unpaid fees", by=None)
    assert report_card(ama, scored["term"], for_family=True)["withheld"] is True

    head = client_for("Head Teacher")
    answer = head.post(
        f"/api/school/learning/pupils/{ama.pk}/release-report",
        {"term": scored["term"].pk, "reason": "Payment plan agreed"},
        format="json",
    )
    assert answer.status_code == 201
    assert report_card(ama, scored["term"], for_family=True)["withheld"] is False
