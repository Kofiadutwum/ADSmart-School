import pytest
from django.utils import timezone

from apps.accounts.models import User, UserSession
from apps.audit.models import AuditLog
from tests.records import make_staff

pytestmark = pytest.mark.django_db

NEW = {
    "first_name": "Ama",
    "surname": "Boateng",
    "username": "a.boateng",
    "phone": "024 555 1234",
    "email": "",
    "roles": ["Teacher"],
    "qualifications": "B.Ed Basic Education",
}


def test_lists_staff_with_their_roles_and_sign_in_code_readiness(head, school):
    make_staff(school, username="acc", roles_held=["Accountant"], first_name="Esi")
    rows = {row["username"]: row for row in head.get("/api/school/staff").json()}
    accountant = rows["acc"]
    assert accountant["roles"] == ["Accountant"]
    assert accountant["needs_second_factor"] is True
    assert accountant["second_factor_ready"] is False
    assert accountant["is_active"] is True
    assert accountant["is_demo"] is False


def test_adds_a_member_of_staff_with_a_one_time_password(admin, school):
    response = admin.post("/api/school/staff", NEW, format="json")
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["staff"]["name"] == "Ama Boateng"
    assert body["staff"]["phone"] == "+233245551234"
    assert len(body["one_time_password"]) == 14
    user = User.objects.get(school=school, login="a.boateng")
    assert user.must_change_password
    assert user.check_password(body["one_time_password"])
    assert AuditLog.objects.filter(action="USER_CREATED", entity_id=str(user.pk)).exists()


def test_a_new_member_needs_a_free_username_and_a_staff_role(admin, school):
    make_staff(school, username="a.boateng")
    taken = admin.post("/api/school/staff", NEW, format="json")
    assert taken.status_code == 400
    assert "username" in taken.json()["fields"]
    parent = admin.post(
        "/api/school/staff", {**NEW, "username": "xavier", "roles": ["Parent"]}, format="json"
    )
    assert "roles" in parent.json()["fields"]
    none = admin.post("/api/school/staff", {**NEW, "username": "yaw.b", "roles": []}, format="json")
    assert "roles" in none.json()["fields"]


def test_shows_one_member_with_their_assignments(head, school):
    teacher = make_staff(school, username="teacher.one", licence_number="NTC-123")
    body = head.get(f"/api/school/staff/{teacher.pk}").json()
    assert body["licence_number"] == "NTC-123"
    assert body["teaching"] == []
    assert body["class_teacher_of"] == []


def test_edits_the_profile_and_roles_with_audit(admin, school):
    teacher = make_staff(school, username="teacher.one")
    response = admin.patch(
        f"/api/school/staff/{teacher.pk}",
        {"qualifications": "Diploma", "roles": ["Teacher", "Front Desk Officer"]},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["roles"] == ["Front Desk Officer", "Teacher"]
    teacher.refresh_from_db()
    assert teacher.qualifications == "Diploma"
    roles_changed = AuditLog.objects.filter(action="ROLES_CHANGED", entity_id=str(teacher.user_id))
    assert roles_changed.exists()
    assert AuditLog.objects.filter(action="UPDATED", entity_type="people.staff").exists()


def test_switching_off_ends_their_sessions_and_switching_on_restores(admin, school):
    teacher = make_staff(school, username="teacher.one")
    UserSession.objects.create(
        user=teacher.user,
        session_key="k" * 32,
        last_seen=timezone.now(),
        idle_seconds=3600,
        expires_at=timezone.now(),
    )
    url = f"/api/school/staff/{teacher.pk}"
    assert admin.patch(url, {"is_active": False}, format="json").json()["is_active"] is False
    assert not UserSession.objects.filter(user=teacher.user).exists()
    assert admin.patch(url, {"is_active": True}, format="json").json()["is_active"] is True
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"ACCOUNT_DEACTIVATED", "ACCOUNT_REACTIVATED"} <= actions


def test_marking_someone_as_left_switches_off_their_sign_in(admin, school):
    teacher = make_staff(school, username="teacher.one")
    response = admin.patch(
        f"/api/school/staff/{teacher.pk}", {"employment_status": "LEFT"}, format="json"
    )
    assert response.json()["is_active"] is False


def test_the_school_keeps_one_active_administrator(admin, school):
    url = f"/api/school/staff/{admin.staff.pk}"
    for change in ({"roles": ["Teacher"]}, {"is_active": False}, {"employment_status": "LEFT"}):
        response = admin.patch(url, change, format="json")
        assert response.status_code == 400, change
        assert response.json()["code"] == "last_administrator"
    make_staff(school, username="second", roles_held=["Administrator"])
    assert admin.patch(url, {"roles": ["Teacher"]}, format="json").status_code == 200


def test_resets_a_password(admin, school):
    teacher = make_staff(school, username="teacher.one")
    response = admin.post(f"/api/school/staff/{teacher.pk}/reset-password")
    assert response.status_code == 200
    teacher.user.refresh_from_db()
    assert teacher.user.check_password(response.json()["one_time_password"])
    assert teacher.user.must_change_password
    assert AuditLog.objects.filter(action="PASSWORD_RESET").exists()


def test_a_demo_record_can_be_made_real(admin, school):
    demo = make_staff(school, username="demo", is_demo=True)
    response = admin.post(f"/api/school/staff/{demo.pk}/make-real")
    assert response.json()["is_demo"] is False
    assert AuditLog.objects.filter(action="DEMO_CONVERTED").exists()


def test_another_schools_staff_are_not_found(admin, other_school):
    theirs = make_staff(other_school, username="theirs")
    assert admin.get(f"/api/school/staff/{theirs.pk}").status_code == 404
    assert admin.patch(f"/api/school/staff/{theirs.pk}", {}, format="json").status_code == 404
    assert admin.post(f"/api/school/staff/{theirs.pk}/reset-password").status_code == 404


def test_your_own_password_and_sign_in_are_changed_elsewhere(admin, school):
    make_staff(school, username="second", roles_held=["Administrator"])
    me = admin.staff.pk
    reset = admin.post(f"/api/school/staff/{me}/reset-password")
    assert reset.status_code == 400
    assert reset.json()["code"] == "own_account"
    off = admin.patch(f"/api/school/staff/{me}", {"is_active": False}, format="json")
    assert off.json()["code"] == "own_account"
