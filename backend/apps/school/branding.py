"""School brand colours (amendment §7.2): readable by construction, with dark-mode variants.

Contrast follows WCAG 2.2: relative luminance and the (L1 + 0.05) / (L2 + 0.05) ratio.
"""

import re

DEFAULT_PRIMARY = "#0f1a9e"  # Warm Authority indigo (Phase 1 spec §8.1)
DEFAULT_ACCENT = "#f0ad1c"  # Warm Authority amber
PAPER = "#faf9f6"  # light page background
INK = "#14123a"  # dark text used on the accent
DARK_CARD = "#15133a"  # dark-mode card background
MIN_CONTRAST = 4.5
_HEX = re.compile(r"^#[0-9a-f]{6}$")


class ColourError(ValueError):
    def __init__(self, message: str, suggestion: str = ""):
        super().__init__(message)
        self.suggestion = suggestion


def _rgb(colour: str) -> tuple[int, int, int]:
    return int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16)


def _channel(value: int) -> float:
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def luminance(colour: str) -> float:
    red, green, blue = (_channel(value) for value in _rgb(colour))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(first: str, second: str) -> float:
    lighter, darker = sorted((luminance(first), luminance(second)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def mix(colour: str, other: str, amount: float) -> str:
    """`amount` of the way from `colour` to `other`."""
    mixed = (a + (b - a) * amount for a, b in zip(_rgb(colour), _rgb(other), strict=True))
    return "#" + "".join(f"{round(value):02x}" for value in mixed)


def _nearest_readable(colour: str, towards: str, against: str) -> str:
    for step in range(21):
        candidate = mix(colour, towards, step / 20)
        if contrast(candidate, against) >= MIN_CONTRAST:
            return candidate
    return towards


def _normalise(value: str) -> str:
    colour = (value or "").strip().lower()
    if not _HEX.match(colour):
        raise ColourError("Use a colour code like #0f1a9e.")
    return colour


def check_primary(value: str) -> str:
    """Buttons with white text and links on the page background."""
    colour = _normalise(value)
    ratio = contrast(colour, PAPER)
    if ratio < MIN_CONTRAST:
        suggestion = _nearest_readable(colour, "#000000", PAPER)
        raise ColourError(
            f"{colour} is too light for white text and links ({ratio:.1f}:1; it needs 4.5:1). "
            f"Try {suggestion}.",
            suggestion,
        )
    return colour


def check_accent(value: str) -> str:
    """The main call to action, with dark text on it."""
    colour = _normalise(value)
    ratio = contrast(colour, INK)
    if ratio < MIN_CONTRAST:
        suggestion = _nearest_readable(colour, "#ffffff", INK)
        raise ColourError(
            f"{colour} is too dark for the dark text on it ({ratio:.1f}:1; it needs 4.5:1). "
            f"Try {suggestion}.",
            suggestion,
        )
    return colour


def _rgba(colour: str, alpha: float) -> str:
    red, green, blue = _rgb(colour)
    return f"rgb({red} {green} {blue} / {alpha})"


def brand_tokens(primary: str, accent: str) -> dict[str, dict[str, str]]:
    """CSS variables that replace the platform palette for one school. Empty for the default."""
    if (primary, accent) == (DEFAULT_PRIMARY, DEFAULT_ACCENT):
        return {"light": {}, "dark": {}}
    light = {
        "--accent-indigo": primary,
        "--btn-primary": primary,
        "--brand-amber": accent,
        "--mesh-a": primary,
        "--mesh-b": mix(primary, "#ffffff", 0.2),
        "--mesh-c": mix(primary, "#000000", 0.35),
        "--mesh-glow": _rgba(accent, 0.35),
        "--glass-clear-lite-bg": _rgba(primary, 0.88),
    }
    deep = mix(primary, "#000000", 0.55)
    dark = {
        "--accent-indigo": _nearest_readable(primary, "#ffffff", DARK_CARD),
        "--btn-primary": primary,
        "--brand-amber": accent,
        "--mesh-b": mix(primary, "#000000", 0.45),
        "--mesh-c": mix(primary, "#000000", 0.7),
        "--mesh-glow": _rgba(accent, 0.14),
        "--glass-clear-lite-bg": _rgba(deep, 0.92),
    }
    return {"light": light, "dark": dark}
