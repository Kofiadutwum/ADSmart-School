from datetime import date

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.school.models import School, SchoolDomain
from tests.helpers import SCHOOL_DEFAULTS

pytestmark = pytest.mark.django_db


def build(**overrides):
    return School(**{"slug": "adsmart", **SCHOOL_DEFAULTS, **overrides})


def test_years_since_founding_is_unknown_without_a_founding_year():
    assert build().years_since_founding(date(2026, 10, 9)) == 25
    assert build(founded_year=None).years_since_founding(date(2026, 10, 9)) is None


def test_clean_normalises_phone_numbers():
    school = build(phone="030 212 3456", whatsapp="054 587 5881")
    school.full_clean()
    assert school.phone == "+233302123456"
    assert school.whatsapp == "+233545875881"


def test_clean_rejects_a_landline_for_whatsapp():
    with pytest.raises(ValidationError) as error:
        build(whatsapp="030 212 3456").full_clean()
    assert "whatsapp" in error.value.message_dict


def test_levels_are_kept_in_school_order_and_must_be_known():
    school = build(levels_offered=["jhs", "kg"])
    school.full_clean()
    assert school.levels_offered == ["kg", "jhs"]
    for levels in ([], ["university"]):
        with pytest.raises(ValidationError) as error:
            build(levels_offered=levels).full_clean()
        assert "levels_offered" in error.value.message_dict


def test_unreadable_brand_colours_and_reserved_slugs_are_refused():
    with pytest.raises(ValidationError) as error:
        build(slug="admin", brand_primary="#7fb3ff", brand_accent="#1b2a4a").full_clean()
    assert {"slug", "brand_primary", "brand_accent"} <= set(error.value.message_dict)


def test_new_schools_start_on_trial_in_preview_with_every_level(school):
    assert school.status == School.Status.TRIAL and school.is_live is False
    assert school.levels_offered == [
        "creche",
        "nursery",
        "kg",
        "lower_primary",
        "upper_primary",
        "jhs",
    ]


def test_addresses_prefer_a_verified_primary_domain(school, settings):
    settings.SITE_URL_TEMPLATE = "https://{host}"
    assert school.primary_host() == "adsmart.localhost"
    assert school.base_url() == "https://adsmart.localhost"

    SchoolDomain.objects.create(school=school, domain="AdSmartSchool.edu.gh", is_primary=True)
    assert school.primary_host() == "adsmart.localhost"  # not verified yet

    SchoolDomain.objects.filter(school=school).update(verified_at=timezone.now())
    assert school.base_url() == "https://adsmartschool.edu.gh"
