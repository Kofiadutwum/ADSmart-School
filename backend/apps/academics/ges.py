"""The subjects of the GES standards-based curriculum, which every school starts with."""

from apps.academics.models import Subject

# (name, code, bands, is_learning_area)
GES_SUBJECTS = (
    ("Language and Literacy", "LL", ["nursery", "kg"], True),
    ("Numeracy", "NUM", ["nursery", "kg"], True),
    ("Our World Our People", "OWOP", ["nursery", "kg", "lower_primary", "upper_primary"], False),
    ("Creative Arts", "CA", ["nursery", "kg", "lower_primary", "upper_primary"], False),
    ("English Language", "ENG", ["lower_primary", "upper_primary", "jhs"], False),
    ("Ghanaian Language", "GHL", ["lower_primary", "upper_primary", "jhs"], False),
    ("Mathematics", "MATH", ["lower_primary", "upper_primary", "jhs"], False),
    ("Science", "SCI", ["lower_primary", "upper_primary", "jhs"], False),
    ("Religious and Moral Education", "RME", ["lower_primary", "upper_primary", "jhs"], False),
    ("Physical Education", "PE", ["lower_primary", "upper_primary", "jhs"], False),
    ("Computing", "COMP", ["upper_primary", "jhs"], False),
    ("History", "HIST", ["upper_primary"], False),
    ("Social Studies", "SOC", ["jhs"], False),
    ("Career Technology", "CT", ["jhs"], False),
    ("Creative Arts and Design", "CAD", ["jhs"], False),
)


def ges_subjects_for(levels) -> list[tuple[str, str, list[str], bool]]:
    """The GES subjects studied at these levels, each with only the levels given."""
    rows = []
    for name, code, bands, learning_area in GES_SUBJECTS:
        taught = [band for band in bands if band in levels]
        if taught:
            rows.append((name, code, taught, learning_area))
    return rows


def add_ges_subjects(school, subjects=Subject) -> list:
    """Add the GES subjects the school is missing. A subject whose code the school already
    uses is left as the school has it. Migrations pass their own Subject model."""
    taken = set(subjects.objects.filter(school=school).values_list("code", flat=True))
    return [
        subjects.objects.create(
            school=school, name=name, code=code, bands=bands, is_learning_area=learning_area
        )
        for name, code, bands, learning_area in ges_subjects_for(school.levels_offered)
        if code not in taken
    ]
