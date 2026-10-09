import pytest

from apps.school import branding
from apps.school.branding import (
    DARK_CARD,
    DEFAULT_ACCENT,
    DEFAULT_PRIMARY,
    INK,
    PAPER,
    ColourError,
    brand_tokens,
    check_accent,
    check_primary,
    contrast,
)


def test_contrast_follows_wcag():
    assert round(contrast("#000000", "#ffffff"), 1) == 21.0
    assert contrast("#777777", "#777777") == 1.0


def test_the_platform_palette_is_readable():
    assert check_primary(DEFAULT_PRIMARY) == DEFAULT_PRIMARY
    assert check_accent(DEFAULT_ACCENT) == DEFAULT_ACCENT


def test_colour_codes_are_normalised():
    assert check_primary(" #0F1A9E ") == "#0f1a9e"
    with pytest.raises(ColourError, match="colour code"):
        check_primary("blue")


def test_a_light_primary_is_refused_with_a_readable_suggestion():
    with pytest.raises(ColourError) as caught:
        check_primary("#7fb3ff")
    assert "4.5:1" in str(caught.value)
    assert contrast(caught.value.suggestion, PAPER) >= branding.MIN_CONTRAST
    assert caught.value.suggestion in str(caught.value)


def test_a_dark_accent_is_refused_with_a_readable_suggestion():
    with pytest.raises(ColourError) as caught:
        check_accent("#1b2a4a")
    assert contrast(caught.value.suggestion, INK) >= branding.MIN_CONTRAST


def test_the_platform_palette_needs_no_overrides():
    assert brand_tokens(DEFAULT_PRIMARY, DEFAULT_ACCENT) == {"light": {}, "dark": {}}


def test_school_colours_become_readable_tokens_in_both_themes():
    tokens = brand_tokens("#7a1f1f", "#ffd166")
    light, dark = tokens["light"], tokens["dark"]
    assert light["--btn-primary"] == light["--accent-indigo"] == "#7a1f1f"
    assert light["--brand-amber"] == dark["--brand-amber"] == "#ffd166"
    assert contrast(light["--accent-indigo"], PAPER) >= 4.5
    assert contrast(dark["--accent-indigo"], DARK_CARD) >= 4.5
    assert light["--mesh-glow"] == "rgb(255 209 102 / 0.35)"
