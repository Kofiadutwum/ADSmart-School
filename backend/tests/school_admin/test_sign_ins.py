from datetime import date

import pytest

from apps.accounts.models import User
from apps.people.services import enrol, link_guardian
from tests.records import make_class, make_parent, make_staff, make_student, make_year

pytestmark = pytest.mark.django_db

URL = "/api/school/sign-ins/"


def pupil(school, school_class, first_name, **fields):
    student = make_student(school, first_name=first_name, **fields)
    enrol(student, school_class, start_date=date(2026, 9, 8))
    return student


def fetch(client, kind, **body):
    response = client.post(URL + kind, body, format="json")
    assert response.status_code == 200, response.content
    return response.json()["rows"]


def works(login, password):
    return User.objects.get(login=login).check_password(password)


def test_pupils_from_basic_4_get_a_fresh_password_and_younger_pupils_only_their_id(school, admin):
    year = make_year(school)
    basic_5, kg = make_class(year, "basic_5"), make_class(year, "kg_1")
    kofi = pupil(school, basic_5, "Kofi")
    esi = pupil(school, kg, "Esi")

    rows = {row["student_id"]: row for row in fetch(admin, "pupils")}

    assert rows[esi.student_id] == {
        "name": "Esi Mensah",
        "class": "KG 1",
        "student_id": esi.student_id,
        "password": "",
        "signed_in": False,
    }
    assert works(kofi.student_id, rows[kofi.student_id]["password"])


def test_a_new_list_replaces_unused_passwords_but_never_one_a_pupil_chose(school, admin):
    year = make_year(school)
    basic_5 = make_class(year, "basic_5")
    waiting, chose = pupil(school, basic_5, "Kofi"), pupil(school, basic_5, "Yaw")
    first = fetch(admin, "pupils", **{"class": basic_5.pk})
    old = next(row["password"] for row in first if row["student_id"] == waiting.student_id)
    user = User.objects.get(login=chose.student_id)
    user.set_password("my-own-choice-9")
    user.must_change_password = False
    user.save()

    rows = {row["student_id"]: row for row in fetch(admin, "pupils", **{"class": basic_5.pk})}

    assert rows[chose.student_id]["password"] == ""
    assert rows[chose.student_id]["signed_in"] is True
    assert works(chose.student_id, "my-own-choice-9")
    assert rows[waiting.student_id]["password"] not in ("", old)
    assert not works(waiting.student_id, old)


def test_parents_are_listed_once_with_their_children_and_a_password(school, admin):
    year = make_year(school)
    basic_2, basic_5 = make_class(year, "basic_2"), make_class(year, "basic_5")
    parent = make_parent(school)
    for school_class, name in ((basic_2, "Ama"), (basic_5, "Kofi")):
        link_guardian(parent, pupil(school, school_class, name), "Mother")

    rows = fetch(admin, "parents")

    assert len(rows) == 1
    assert rows[0]["children"] == ["Ama (Basic 2)", "Kofi (Basic 5)"]
    assert rows[0]["phone"] == "024 123 4567"
    assert works(parent.user.login, rows[0]["password"])
    only_basic_2 = fetch(admin, "parents", **{"class": basic_2.pk})
    assert [row["name"] for row in only_basic_2] == ["Akua Mensah"]


def test_staff_list_leaves_out_the_administrator_asking(school, admin):
    teacher = make_staff(school, username="abena", first_name="Abena", surname="Owusu")
    teacher.user.must_change_password = True
    teacher.user.save()

    rows = fetch(admin, "staff")

    assert [row["username"] for row in rows] == ["abena"]
    assert works("abena", rows[0]["password"])


def test_demo_records_never_get_a_password(school, admin):
    year = make_year(school)
    demo = pupil(school, make_class(year, "basic_5"), "Kofi", is_demo=True)

    rows = fetch(admin, "pupils")

    assert rows[0]["student_id"] == demo.student_id
    assert rows[0]["password"] == ""


def test_only_the_administrator_can_make_sign_in_lists(school, head):
    assert head.post(URL + "pupils", {}, format="json").status_code == 403


def test_another_schools_class_is_not_found(school, other_school, admin):
    elsewhere = make_class(make_year(other_school), "kg_1")
    make_year(school)

    response = admin.post(URL + "pupils", {"class": elsewhere.pk}, format="json")

    assert response.status_code == 404
