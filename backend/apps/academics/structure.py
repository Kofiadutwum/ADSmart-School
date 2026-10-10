"""Ghana's programme bands and year groups (Phase 1 spec §3.1).

The national curriculum fixes them, so they live in code rather than in per-school tables. A
school picks the bands it teaches with School.levels_offered (amendment §3.1), whose codes are
the band codes here.
"""

from dataclasses import dataclass

EARLY_YEARS, PRIMARY, JHS = "EARLY_YEARS", "PRIMARY", "JHS"
CARE, DESCRIPTIVE, SCORED = "CARE", "DESCRIPTIVE", "SCORED"


@dataclass(frozen=True)
class Band:
    code: str
    name: str
    category: str
    assessment_style: str
    student_login: bool
    positions_allowed: bool


@dataclass(frozen=True)
class YearGroup:
    code: str
    band: str
    name: str
    short_name: str
    age_from: int  # age at the start of the school year
    age_to: int


BANDS = {
    band.code: band
    for band in (
        Band("creche", "Crèche", EARLY_YEARS, CARE, False, False),
        Band("nursery", "Nursery", EARLY_YEARS, CARE, False, False),
        Band("kg", "Kindergarten", EARLY_YEARS, DESCRIPTIVE, False, False),
        Band("lower_primary", "Basic 1–3", PRIMARY, DESCRIPTIVE, False, False),
        Band("upper_primary", "Basic 4–6", PRIMARY, SCORED, True, True),
        Band("jhs", "Junior High School", JHS, SCORED, True, True),
    )
}


def _basic(number: int) -> YearGroup:
    band = "lower_primary" if number <= 3 else "upper_primary" if number <= 6 else "jhs"
    if number <= 6:
        return YearGroup(
            f"basic_{number}", band, f"Basic {number}", f"B{number}", number + 5, number + 6
        )
    # Basic 7–9 are shown as JHS 1–3.
    jhs = number - 6
    return YearGroup(f"basic_{number}", band, f"JHS {jhs}", f"JHS{jhs}", number + 5, number + 6)


_ORDER = (
    YearGroup("creche", "creche", "Crèche", "CR", 1, 2),
    YearGroup("nursery_1", "nursery", "Nursery 1", "N1", 2, 3),
    YearGroup("nursery_2", "nursery", "Nursery 2", "N2", 3, 4),
    YearGroup("kg_1", "kg", "KG 1", "KG1", 4, 5),
    YearGroup("kg_2", "kg", "KG 2", "KG2", 5, 6),
    *(_basic(number) for number in range(1, 10)),
)
YEAR_GROUPS = {group.code: group for group in _ORDER}
YEAR_GROUP_CHOICES = [(group.code, group.name) for group in _ORDER]


def year_groups_for(bands) -> list[YearGroup]:
    """The year groups of these bands, youngest first."""
    return [group for group in _ORDER if group.band in bands]
