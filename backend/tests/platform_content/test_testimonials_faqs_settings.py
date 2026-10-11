"""Business tools spec §5.5 and §5.6: comments from schools, questions and the WhatsApp link."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts import roles
from tests.platform_admin.conftest import make_platform_member, signed_in
from tests.platform_content.conftest import photo

pytestmark = pytest.mark.django_db
COMMENTS = "/api/platform/website/testimonials"
FAQS = "/api/platform/website/faqs"
SETTINGS = "/api/platform/website/settings"
COMMENT = {
    "quote": "Parents now find us easily, and enquiries come in every week.",
    "person_name": "Mrs Owusu",
    "person_role": "Head Teacher",
    "school_name": "Hope Academy",
    "permission": False,
    "visible": True,
}


def platform(api) -> dict:
    return api.get("/api/public/platform").json()


def test_a_comment_needs_permission_to_show(content, api):
    refused = content.post(COMMENTS, COMMENT, format="json")
    assert refused.status_code == 400 and "permission" in refused.json()["fields"]

    hidden = content.post(COMMENTS, {**COMMENT, "visible": False}, format="json")
    assert hidden.status_code == 201 and platform(api)["testimonials"] == []
    url = f"{COMMENTS}/{hidden.json()['id']}"
    shown = content.patch(url, {"permission": True, "visible": True}, format="json")
    assert shown.status_code == 200

    [comment] = platform(api)["testimonials"]
    assert comment["name"] == "Mrs Owusu" and comment["role"] == "Head Teacher"
    assert comment["school"] == "Hope Academy" and comment["school_url"] is None
    assert comment["photo"] is None


def test_a_comment_links_its_school_only_while_the_site_is_public(
    content, api, ready_site, other_school
):
    for slug in ("adsmart", "brightfuture"):
        data = {**COMMENT, "school_name": "", "school_slug": slug, "permission": True}
        assert content.post(COMMENTS, data, format="json").status_code == 201

    comments = platform(api)["testimonials"]

    assert [(c["school"], c["school_url"]) for c in comments] == [
        ("AD Smart School", "http://adsmart.localhost:3000"),
        ("Bright Future Academy", None),
    ]


def test_a_comment_photo_is_checked(content):
    pk = content.post(COMMENTS, {**COMMENT, "permission": True}, format="json").json()["id"]
    url = f"{COMMENTS}/{pk}/photo"

    big = SimpleUploadedFile("big.jpg", b"x" * (5 * 1024 * 1024 + 1))
    assert content.post(url, {"image": big}, format="multipart").json()["fields"]["image"] == [
        "That photo is larger than 5 MB."
    ]
    added = content.post(url, {"image": photo()}, format="multipart")
    assert added.status_code == 200 and added.json()["photo"]["src"]
    assert content.delete(url).json()["photo"] is None


def test_questions_are_ordered_and_hidden_ones_left_out(content, api):
    made = [
        content.post(FAQS, {"question": f"Question {n}?", "answer": f"Answer {n}."}, format="json")
        for n in (1, 2, 3)
    ]
    first, second, third = (response.json()["id"] for response in made)
    content.patch(f"{FAQS}/{second}", {"visible": False}, format="json")

    content.post(f"{FAQS}/order", {"ids": [third, first, second]}, format="json")

    assert [(q["id"], q["question"]) for q in platform(api)["faqs"]] == [
        (third, "Question 3?"),
        (first, "Question 1?"),
    ]
    assert content.delete(f"{FAQS}/{third}").status_code == 204


def test_the_whatsapp_link_must_be_a_channel_link(content, api):
    refused = content.patch(
        SETTINGS, {"whatsapp_channel_url": "https://example.com/x"}, format="json"
    )
    assert refused.status_code == 400 and "whatsapp_channel_url" in refused.json()["fields"]

    link = "https://whatsapp.com/channel/0029VaExample123"
    assert content.patch(SETTINGS, {"whatsapp_channel_url": link}, format="json").status_code == 200
    assert content.get(SETTINGS).json() == {"whatsapp_channel_url": link}
    assert platform(api)["whatsapp_channel"] == link

    content.patch(SETTINGS, {"whatsapp_channel_url": ""}, format="json")
    assert platform(api)["whatsapp_channel"] == ""


def test_support_cannot_edit_website_content(db):
    support = signed_in(make_platform_member("helper", roles.PLATFORM_SUPPORT))

    assert support.post(COMMENTS, COMMENT, format="json").status_code == 403
    assert support.patch(SETTINGS, {"whatsapp_channel_url": ""}, format="json").status_code == 403
