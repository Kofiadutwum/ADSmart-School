import pytest

from apps.core.phones import format_gh_local, normalise_gh_phone, whatsapp_link


@pytest.mark.parametrize(
    "raw",
    [
        "0545875881",
        "054 587 5881",
        "054-587-5881",
        "+233545875881",
        "+233 54 587 5881",
        "233545875881",
    ],
)
def test_accepts_common_ghana_mobile_formats(raw):
    assert normalise_gh_phone(raw) == "+233545875881"


@pytest.mark.parametrize(
    "raw", ["", "   ", "12345", "05458758811", "+447700900123", "not a number", "0302123456"]
)
def test_rejects_invalid_foreign_or_landline_numbers_for_mobiles(raw):
    with pytest.raises(ValueError, match="Ghana"):
        normalise_gh_phone(raw)


def test_landlines_are_allowed_when_not_mobile_only():
    assert normalise_gh_phone("030 212 3456", mobile_only=False) == "+233302123456"


def test_formats_numbers_for_display():
    assert format_gh_local("+233545875881") == "054 587 5881"


def test_builds_whatsapp_links():
    assert whatsapp_link("+233545875881") == "https://wa.me/233545875881"
