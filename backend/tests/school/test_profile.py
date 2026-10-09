from datetime import date

import pytest
from django.core.exceptions import ValidationError

from apps.school.models import SchoolProfile

pytestmark = pytest.mark.django_db


def make_profile(**overrides):
    data = {
        "name": "AD Smart School",
        "founded_year": 2001,
        "town": "Kronom, Kumasi",
        "region": "Ashanti",
        "phone": "+233545875881",
        "email": "school@example.com",
    }
    data.update(overrides)
    return SchoolProfile(**data)


def test_load_is_none_before_setup():
    assert SchoolProfile.load() is None


def test_the_profile_is_always_a_single_row():
    make_profile().save()
    make_profile(name="AD Smart School (renamed)").save()

    assert SchoolProfile.objects.count() == 1
    assert SchoolProfile.load().name == "AD Smart School (renamed)"


def test_years_since_founding():
    assert make_profile().years_since_founding(date(2026, 10, 9)) == 25


def test_clean_normalises_phone_numbers():
    profile = make_profile(phone="030 212 3456", whatsapp="054 587 5881")

    profile.full_clean()

    assert profile.phone == "+233302123456"
    assert profile.whatsapp == "+233545875881"


def test_clean_rejects_a_landline_for_whatsapp():
    with pytest.raises(ValidationError) as error:
        make_profile(whatsapp="030 212 3456").full_clean()

    assert "whatsapp" in error.value.message_dict
