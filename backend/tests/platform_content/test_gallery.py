"""Business tools spec §5.2: the gallery on the owner's website."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditLog
from apps.platform_content.models import GalleryPhoto
from tests.platform_content.conftest import photo

pytestmark = pytest.mark.django_db
URL = "/api/platform/website/gallery"
TOO_BIG = 10 * 1024 * 1024 + 1


def upload(client, **fields):
    data = {"image": photo(), "alt_text": "Pupils reading under a tree", **fields}
    return client.post(URL, data, format="multipart")


def test_content_uploads_a_photo_with_renditions(content):
    response = upload(content, caption="Reading hour")

    assert response.status_code == 201
    row = response.json()
    assert row["alt_text"] == "Pupils reading under a tree" and row["caption"] == "Reading hour"
    assert row["visible"] is True and "960w" in row["image"]["srcset"]
    assert GalleryPhoto.objects.get().renditions


@pytest.mark.parametrize(
    ("image", "message"),
    [
        (SimpleUploadedFile("notes.txt", b"hello"), "Choose a JPEG, PNG or WebP photo."),
        (photo("moving.gif", fmt="GIF"), "Choose a JPEG, PNG or WebP photo."),
        (SimpleUploadedFile("big.jpg", b"x" * TOO_BIG), "That photo is larger than 10 MB."),
    ],
)
def test_refuses_non_images_and_large_files(content, image, message):
    response = upload(content, image=image)

    assert response.status_code == 400 and response.json()["fields"]["image"] == [message]
    assert not GalleryPhoto.objects.exists()


def test_a_description_is_required(content):
    response = upload(content, alt_text="")

    assert response.status_code == 400 and "alt_text" in response.json()["fields"]


def test_people_need_permission_to_be_shown(content):
    refused = upload(content, shows_people="true", people_permission="false")
    assert refused.status_code == 400 and "people_permission" in refused.json()["fields"]

    hidden = upload(content, shows_people="true", people_permission="false", visible="false")
    assert hidden.status_code == 201
    url = f"{URL}/{hidden.json()['id']}"
    assert content.patch(url, {"visible": True}, format="json").status_code == 400
    shown = content.patch(url, {"visible": True, "people_permission": True}, format="json")
    assert shown.status_code == 200 and shown.json()["visible"] is True


def test_hidden_and_unpermitted_photos_stay_off_the_website(api):
    shown = GalleryPhoto.objects.create(image=photo(), alt_text="Our library", caption="Books")
    GalleryPhoto.objects.create(image=photo(), alt_text="Hidden", visible=False)
    GalleryPhoto.objects.create(image=photo(), alt_text="No permission", shows_people=True)

    gallery = api.get("/api/public/platform").json()["gallery"]

    assert [item["id"] for item in gallery] == [shown.pk]
    assert gallery[0]["caption"] == "Books" and gallery[0]["image"]["alt"] == "Our library"


def test_reorders_photos(content):
    first, second, third = (upload(content).json()["id"] for _ in range(3))

    response = content.post(f"{URL}/order", {"ids": [third, first, second]}, format="json")

    assert [row["id"] for row in response.json()] == [third, first, second]
    assert [row["id"] for row in content.get(URL).json()] == [third, first, second]


def test_order_must_name_every_photo_once(content):
    first, second = (upload(content).json()["id"] for _ in range(2))

    response = content.post(f"{URL}/order", {"ids": [first, first]}, format="json")

    assert response.status_code == 400


def test_changes_are_audited_and_refresh_the_site(content, refreshes):
    created = upload(content).json()
    url = f"{URL}/{created['id']}"
    content.patch(url, {"caption": "Sports day"}, format="json")
    content.delete(url)

    assert len(refreshes) == 3
    actions = AuditLog.objects.filter(entity_type="platform_content.galleryphoto").values_list(
        "action", flat=True
    )
    assert set(actions) == {"CREATED", "UPDATED", "DELETED"}
    assert not GalleryPhoto.objects.exists()
