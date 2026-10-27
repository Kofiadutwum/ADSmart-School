import pytest
from django.utils import timezone

from apps.accounts.models import UserSession
from apps.audit.models import AuditLog
from apps.notifications.backends import MemoryBackend
from apps.people.models import Guardianship
from apps.people.services import link_guardian
from tests.records import make_parent, make_student

pytestmark = pytest.mark.django_db

PARENTS = "/api/school/parents"
NEW = {
    "first_name": "Akosua",
    "surname": "Owusu",
    "phone": "024 555 0001",
    "title": "Mrs",
    "privacy_notice_given": True,
}


def test_adding_a_parent_needs_them_told_about_the_privacy_notice(admin, school):
    response = admin.post(PARENTS, {**NEW, "privacy_notice_given": False}, format="json")

    assert response.status_code == 400
    assert "privacy notice" in response.json()["fields"]["privacy_notice_given"][0]


@pytest.fixture(autouse=True)
def _memory_sms(settings):
    settings.SMS_BACKEND = "apps.notifications.backends.MemoryBackend"


def guardian(parent, relationship, **flags):
    return {"parent": parent.pk, "relationship": relationship, **flags}


def test_adds_a_parent_and_links_a_pupil_in_one_step(admin, school):
    pupil = make_student(school)
    link = {
        "student": pupil.pk,
        "relationship": "MOTHER",
        "is_payer": True,
        "is_primary_contact": True,
    }
    response = admin.post(PARENTS, {**NEW, "link": link}, format="json")
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["phone"] == "+233245550001"
    assert body["activated"] is False
    (child,) = body["children"]
    assert child["student"] == pupil.pk
    assert child["name"] == "Ama Mensah"
    assert (child["relationship"], child["is_payer"], child["is_primary_contact"]) == (
        "MOTHER",
        True,
        True,
    )


def test_a_number_already_registered_is_refused(admin, school):
    make_parent(school, phone="024 555 0001")
    response = admin.post(PARENTS, NEW, format="json")
    assert response.status_code == 400
    assert "phone" in response.json()["fields"]


def test_lists_and_searches_parents(head, school):
    make_parent(school, phone="024 555 0001", first_name="Akosua", surname="Owusu")
    make_parent(school, phone="024 555 0002", first_name="Kojo", surname="Antwi")
    assert [row["name"] for row in head.get(f"{PARENTS}?q=antwi").json()] == ["Kojo Antwi"]
    assert [row["name"] for row in head.get(f"{PARENTS}?q=0245550001").json()] == ["Akosua Owusu"]


def test_edits_a_parent_including_their_sign_in_number(admin, school):
    parent = make_parent(school, phone="024 555 0001")
    change = {"phone": "024 555 0009", "email": "a@example.com"}
    response = admin.patch(f"{PARENTS}/{parent.pk}", change, format="json")
    assert response.status_code == 200, response.json()
    parent.refresh_from_db()
    parent.user.refresh_from_db()
    assert parent.phone == parent.user.login == parent.user.phone == "+233245550009"


def test_links_edits_and_unlinks_guardians_with_one_primary_contact(admin, school):
    pupil = make_student(school)
    mother = make_parent(school, phone="024 555 0001", first_name="Akosua")
    father = make_parent(school, phone="024 555 0002", first_name="Kojo")
    url = f"/api/school/pupils/{pupil.pk}/guardians"
    admin.post(url, guardian(mother, "MOTHER", is_primary_contact=True), format="json")
    response = admin.post(url, guardian(father, "FATHER", is_primary_contact=True), format="json")
    assert response.status_code == 201, response.json()
    rows = {row["name"]: row for row in admin.get(url).json()}
    assert rows["Kojo Mensah"]["is_primary_contact"] is True
    assert rows["Akosua Mensah"]["is_primary_contact"] is False
    assert admin.post(url, guardian(father, "FATHER"), format="json").status_code == 400
    link_url = f"/api/school/guardians/{rows['Kojo Mensah']['id']}"
    assert admin.patch(link_url, {"is_payer": True}, format="json").json()["is_payer"] is True
    assert admin.delete(link_url).status_code == 204
    assert not Guardianship.objects.filter(parent=father).exists()
    history = admin.get(f"/api/school/pupils/{pupil.pk}/history").json()
    assert any(entry["action"] == "DELETED" and "Kojo" in str(entry["old"]) for entry in history)


def test_sends_the_activation_text(admin, school):
    parent = make_parent(school, phone="024 555 0001")
    response = admin.post(f"{PARENTS}/{parent.pk}/activation")
    assert response.json() == {"sent": True, "reason": ""}
    (message,) = MemoryBackend.outbox
    assert message["to"] == "+233245550001"
    assert "/activate" in message["body"]
    assert school.name in message["body"]
    assert AuditLog.objects.filter(action="ACTIVATION_SENT").exists()


def test_a_demo_parent_is_never_texted(admin, school):
    parent = make_parent(school, phone="024 555 0001", is_demo=True)
    response = admin.post(f"{PARENTS}/{parent.pk}/activation")
    assert response.json() == {"sent": False, "reason": "demo"}
    assert MemoryBackend.outbox == []


def test_resetting_access_signs_them_out_and_texts_them(admin, school):
    parent = make_parent(school, phone="024 555 0001")
    parent.user.set_password("old password here")
    parent.user.activated_at = timezone.now()
    parent.user.save()
    UserSession.objects.create(
        user=parent.user,
        session_key="p" * 32,
        last_seen=timezone.now(),
        idle_seconds=60,
        expires_at=timezone.now(),
    )
    response = admin.post(f"{PARENTS}/{parent.pk}/reset")
    assert response.json()["sent"] is True
    parent.user.refresh_from_db()
    assert not parent.user.has_usable_password()
    assert not UserSession.objects.filter(user=parent.user).exists()
    resets = AuditLog.objects.filter(action="PASSWORD_RESET", entity_id=str(parent.user_id))
    assert resets.exists()


def test_a_demo_parent_can_be_made_real(admin, school):
    parent = make_parent(school, phone="024 555 0001", is_demo=True)
    assert admin.post(f"{PARENTS}/{parent.pk}/make-real").json()["is_demo"] is False


def test_another_schools_parent_or_pupil_cannot_be_linked(admin, school, other_school):
    pupil = make_student(school)
    theirs = make_parent(other_school, phone="024 555 0003")
    url = f"/api/school/pupils/{pupil.pk}/guardians"
    assert admin.post(url, guardian(theirs, "MOTHER"), format="json").status_code == 400
    assert admin.post(f"{PARENTS}/{theirs.pk}/activation").status_code == 404
    link = link_guardian(theirs, make_student(other_school), "MOTHER")
    assert admin.delete(f"/api/school/guardians/{link.pk}").status_code == 404
