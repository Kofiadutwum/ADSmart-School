import pytest
from django.core.exceptions import ValidationError

from apps.school.slugs import validate_slug


@pytest.mark.parametrize("slug", ["adsmart", "st-marys", "abc", "school-2", "a" * 30])
def test_valid_slugs(slug):
    validate_slug(slug)


@pytest.mark.parametrize(
    "slug", ["ab", "Adsmart", "1school", "a--b", "-abc", "abc-", "a_b", "a.b", "a" * 31, ""]
)
def test_invalid_slugs(slug):
    with pytest.raises(ValidationError, match="lowercase"):
        validate_slug(slug)


@pytest.mark.parametrize("slug", ["admin", "www", "api", "platform", "support"])
def test_reserved_slugs(slug):
    with pytest.raises(ValidationError, match="reserved"):
        validate_slug(slug)
