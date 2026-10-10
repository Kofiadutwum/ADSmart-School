import pytest

from apps.accounts import roles
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.school.models import School
from apps.website.models import ContentBlock
from tests.helpers import sign_in
from tests.records import make_staff

pytestmark = pytest.mark.django_db
NEW = {
    "name": "Bright Future Academy",
    "slug": "brightfuture",
    "town": "Ejisu",
    "region": "Ashanti Region",
    "phone": "020 123 4567",
    "email": "office@brightfuture.example",
    "levels_offered": ["kg", "lower_primary"],
    "administrator": {
        "first_name": "Esi",
        "surname": "Owusu",
        "username": "Esi.Owusu",
        "phone": "024 765 4321",
        "email": "esi.owusu@brightfuture.example",
    },
}


def open_school(console, **changes):
    return console.post("/api/platform/schools", {**NEW, **changes}, format="json")


def test_opening_a_school_builds_its_site_and_first_administrator(api, console, ops):
    response = open_school(console)
    assert response.status_code == 201
    body = response.json()
    school = School.objects.get(slug="brightfuture")
    assert school.status == "trial" and school.levels_offered == ["kg", "lower_primary"]
    assert ContentBlock.objects.for_school(school).exists()  # its placeholder website
    assert body["school"]["slug"] == "brightfuture"
    password = body["administrator"]["one_time_password"]
    assert body["administrator"]["username"] == "esi.owusu" and len(password) == 14
    admin = User.objects.get(school=school, login="esi.owusu")
    assert admin.must_change_password and admin.check_password(password)
    assert admin.phone == "+233247654321" and admin.email == "esi.owusu@brightfuture.example"
    assert roles.roles_of(admin) == ["Administrator"]
    by_ops = set(AuditLog.objects.filter(actor=ops).values_list("action", "school_id"))
    assert by_ops == {("CREATED", school.pk), ("USER_CREATED", school.pk)}
    signed_in = sign_in(api, "esi.owusu", password, HTTP_HOST="brightfuture.localhost")
    assert signed_in.json()["status"] == "second_factor"  # Administrators confirm with a code


def test_the_web_address_must_be_free_and_allowed(console, school):
    assert "slug" in open_school(console, slug="admin").json()["fields"]
    assert "slug" in open_school(console, slug="adsmart").json()["fields"]
    assert not School.objects.filter(slug="admin").exists()


def test_administrator_details_are_checked_before_anything_is_made(console):
    wrong = {**NEW["administrator"], "username": "1bad", "phone": "12345"}
    fields = open_school(console, administrator=wrong).json()["fields"]
    assert set(fields) == {"administrator.username", "administrator.phone"}
    assert not School.objects.filter(slug="brightfuture").exists()


def test_adding_another_administrator(console, school):
    make_staff(school, roles_held=["Administrator"])
    url = "/api/platform/schools/adsmart/administrators"
    taken = {
        "first_name": "Kofi",
        "surname": "Mensah",
        "username": "K.Mensah",
        "phone": "024 111 2222",
    }
    refused = console.post(url, taken, format="json").json()
    assert refused["fields"] == {"username": ["That username is already used at this school."]}
    added = console.post(url, {**taken, "username": "ama.owusu"}, format="json")
    assert added.status_code == 201 and added.json()["username"] == "ama.owusu"
    assert len(console.get("/api/platform/schools/adsmart").json()["administrators"]) == 2
