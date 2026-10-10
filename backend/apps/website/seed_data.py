"""Starting content for a school's website (amendment §7.4).

Everything is provisional (needs_review / is_placeholder / is_draft) until the school confirms
it, so a new site stays in preview (Phase 1 spec §6.5). Text may use the names returned by
context_for(): {name}, {town}, {span} ("Crèche–JHS"), {span_words} ("Crèche to JHS"),
{subline} and {history}.
"""

from dataclasses import dataclass

from apps.school.models import LEVEL_CODES

# A sample school, so the platform has a school website to show and test. Its contact details
# are placeholders: the owner's logo, email and number belong to the platform (2026-10-10).
FIRST_SCHOOL = {
    "slug": "sample",
    "name": "Sample School",
    "motto": "",
    "founded_year": 2001,
    "address": "",
    "town": "Kronom, Kumasi",
    "region": "Ashanti Region",
    "ghana_post_gps": "",
    "phone": "+233200000000",
    "whatsapp": "",
    "email": "office@sampleschool.example",
    "map_query": "Kronom, Kumasi, Ghana",
}
FIRST_SCHOOL_NEWS = [
    {
        "slug": "welcome-to-our-new-website",
        "title": "Welcome to our new website",
        "summary": "School news, key dates and admissions information, together in one place.",
        "body": "We are building a new website and school system for Sample School.\n\n"
        "Soon you will find school news, key dates and admissions information here, and "
        "parents will be able to follow their children's progress online.",
    },
]

_START = {
    "creche": "Crèche",
    "nursery": "Nursery",
    "kg": "KG",
    "lower_primary": "Basic 1",
    "upper_primary": "Basic 4",
    "jhs": "JHS",
}
_END = {**_START, "lower_primary": "Basic 3", "upper_primary": "Basic 6"}


def level_span(levels: list[str], joiner: str) -> str:
    """From the first level offered to the last, e.g. "Crèche–JHS" or "Basic 1 to JHS"."""
    start, end = _START[levels[0]], _END[levels[-1]]
    return start if start == end else f"{start}{joiner}{end}"


def context_for(school) -> dict[str, str]:
    founded = school.founded_year
    return {
        "name": school.name,
        "town": school.town,
        "span": level_span(school.levels_offered, "–"),
        "span_words": level_span(school.levels_offered, " to "),
        "subline": f"{school.town} · Since {founded}" if founded else school.town,
        "history": (
            f"{school.name} opened its doors in {school.town} in {founded}."
            if founded
            else f"{school.name} is a school in {school.town}."
        ),
    }


# code: (ages, one-line summary, longer detail)
_LEVELS = {
    "creche": (
        "Under 2 years",
        "Gentle, loving care for our youngest, with play, rest and routine at the heart "
        "of the day.",
        "Small groups, familiar carers and a calm daily rhythm help babies and toddlers "
        "feel safe while they explore.",
    ),
    "nursery": (
        "2 to 4 years",
        "Learning through play, songs and stories that build confidence, language and "
        "early number skills.",
        "Children learn to share, take turns and express themselves, through activities "
        "that feel like play.",
    ),
    "kg": (
        "4 to 6 years",
        "Hands-on discovery that gets children ready to read, write and count.",
        "KG1 and KG2 follow the national kindergarten curriculum, with progress shared "
        "through descriptive reports.",
    ),
    "lower_primary": (
        "6 to 9 years",
        "Strong foundations in literacy, numeracy and creative thinking.",
        "Basic 1 to 3 follow the standards-based curriculum, with plenty of reading, "
        "writing and practical maths.",
    ),
    "upper_primary": (
        "9 to 12 years",
        "Growing independence and a wider range of subjects.",
        "In Basic 4 to 6 pupils take more ownership of their learning and begin to use "
        "their own school login.",
    ),
    "jhs": (
        "12 to 15 years",
        "The Common Core Programme, steady preparation for the BECE and guidance for the "
        "next step.",
        "JHS 1 to 3 combine core subjects with practical skills, mock examinations and "
        "support in choosing a senior high school.",
    ),
}

# (key, text template, where it appears)
_BLOCKS: list[tuple[str, str, str]] = [
    ("hero_headline", "Bright beginnings, from {span_words}", "Home: main headline"),
    ("hero_subline", "{subline}", "Home: small line above the headline"),
    (
        "hero_intro",
        "A caring school for children from {span_words} in {town}. Come and see where your "
        "child will learn, play and grow.",
        "Home: introduction under the headline",
    ),
    (
        "levels_intro",
        "One school for every stage of childhood, so your child can grow with friends and "
        "teachers who know them.",
        "Home: introduction to the levels",
    ),
    (
        "for_parents_intro",
        "Staying close to your child's school day, even on a basic phone.",
        "Home: introduction to the 'For parents' features",
    ),
    (
        "gallery_intro",
        "A look around our classrooms, library, labs and playing fields.",
        "Home: introduction to the photo gallery",
    ),
    ("admissions_cta_heading", "Come and visit us", "Home: closing call to action heading"),
    (
        "admissions_cta_text",
        "Walk through our classrooms, meet our teachers and ask us anything. We'd love to "
        "show you around.",
        "Home: closing call to action text",
    ),
    (
        "about_history",
        "{history}\n\nToday we teach children from {span_words}, so families can stay with "
        "us as their children grow.",
        "About: the school's story",
    ),
    (
        "head_teacher_welcome",
        "Welcome to {name}. Our teachers work hard to make every child feel safe, valued and "
        "excited to learn. We look forward to meeting you and your family.",
        "About: replace with the head teacher's own welcome",
    ),
    ("head_teacher_name", "The Head Teacher", "About: the head teacher's name and title"),
    (
        "admissions_intro",
        "We welcome enquiries all year round. Tell us a little about your child and we will "
        "call you to arrange a visit.",
        "Admissions: introduction",
    ),
    (
        "admissions_steps",
        "- Send an enquiry using the form below, or call us.\n"
        "- Visit the school and meet the head teacher.\n"
        "- Complete the admission form and provide the documents listed.\n"
        "- Receive your child's Student ID and start date.",
        "Admissions: steps (one '- ' line each)",
    ),
    (
        "admissions_requirements",
        "- Your child's birth certificate (or weighing card for the youngest)\n"
        "- Two recent passport-size photographs of your child\n"
        "- The last report card and a transfer letter, if your child is changing schools\n"
        "- The parent or guardian's Ghana Card",
        "Admissions: documents to bring (one '- ' line each)",
    ),
    ("contact_hours", "Monday to Friday, 7:00 am to 4:00 pm", "Contact: office hours"),
    ("footer_tagline", "Bright beginnings, from {span_words}.", "Footer: short tagline"),
]


def content_blocks(levels: list[str]) -> list[tuple[str, str, str]]:
    """Text templates for a school teaching `levels`; level blocks only for those levels."""
    level_blocks = [
        item
        for code in levels
        for item in (
            (f"level_{code}_ages", _LEVELS[code][0], f"Levels: age range for {code}"),
            (f"level_{code}_summary", _LEVELS[code][1], f"Levels: one-line summary for {code}"),
            (f"level_{code}_detail", _LEVELS[code][2], f"Levels page: longer text for {code}"),
        )
    ]
    return _BLOCKS + level_blocks


def facts_for(school) -> list[tuple[str, str]]:
    """True facts only (Phase 1 spec §6.2): years since founding, if known, and the levels."""
    facts = []
    if school.founded_year:
        facts.append((f"years serving {school.town}", "{years}"))
    every_level = list(school.levels_offered) == list(LEVEL_CODES)
    label = "every stage of basic education" if every_level else "levels under one roof"
    facts.append((label, level_span(school.levels_offered, "–")))
    return facts


# (key, title, text, icon): all switched off until the feature is live
FEATURES = [
    (
        "sms_updates",
        "Updates by SMS",
        "Absence alerts, receipts and reminders reach you on any phone. No smartphone needed.",
        "message",
    ),
    (
        "momo_ussd",
        "Pay by MoMo or shortcode",
        "Pay fees, canteen and books by mobile money, card or a USSD shortcode on any phone.",
        "phone",
    ),
    (
        "daily_care",
        "Daily care reports",
        "For Crèche to KG: meals, naps and activities shared with you every day.",
        "care",
    ),
    (
        "safe_pickup",
        "Safe pick-up",
        "Children are released only to the people you have authorised.",
        "shield",
    ),
]


@dataclass(frozen=True)
class SeedPhoto:
    key: str
    filename: str
    alt_text: str
    caption: str


PHOTOS = [
    SeedPhoto(
        "hero",
        "hero.jpg",
        "Smiling children playing together on a colourful playground climbing frame",
        "",
    ),
    SeedPhoto(
        "about",
        "about.jpg",
        "Aerial view of a school building with a courtyard and a sports court",
        "",
    ),
    SeedPhoto(
        "gallery_01",
        "gallery_01.jpg",
        "Two young children building a tower of colourful wooden blocks on a classroom rug",
        "Early years play",
    ),
    SeedPhoto(
        "gallery_02",
        "gallery_02.jpg",
        "Four pupils in school uniform smiling as they share picture books by a bookshelf",
        "Reading together",
    ),
    SeedPhoto(
        "gallery_03",
        "gallery_03.jpg",
        "A teacher smiling as pupils raise their hands to answer in class",
        "Lessons that invite questions",
    ),
    SeedPhoto(
        "gallery_04",
        "gallery_04.jpg",
        "Pupils in uniform working at desktop computers in a computer lab",
        "Computer lab",
    ),
    SeedPhoto(
        "gallery_05",
        "gallery_05.jpg",
        "Students reading at tables in a bright library lined with bookshelves",
        "Library",
    ),
    SeedPhoto(
        "gallery_06",
        "gallery_06.jpg",
        "Pupils in sports kit playing football and basketball on a school field",
        "Sports",
    ),
    SeedPhoto(
        "gallery_07",
        "gallery_07.jpg",
        "A teacher leaning over to help a boy with his written work",
        "One-to-one support",
    ),
    SeedPhoto(
        "gallery_08",
        "gallery_08.jpg",
        "Rows of pupils using computers in an ICT room",
        "ICT lessons",
    ),
    SeedPhoto(
        "gallery_09",
        "gallery_09.jpg",
        "A metal competition robot on a play field while young people with controllers look on",
        "Robotics",
    ),
    SeedPhoto(
        "gallery_10",
        "gallery_10.jpg",
        "A teacher presenting on a large screen to students with laptops",
        "Digital skills",
    ),
    SeedPhoto(
        "gallery_11",
        "gallery_11.jpg",
        "Pupils in white uniform raising their hands in a classroom",
        "Class participation",
    ),
    SeedPhoto(
        "gallery_12",
        "gallery_12.jpg",
        "A technician with braided hair connecting network cables in a server rack",
        "Technology",
    ),
]

PRIVACY_NOTICE_BODY = "\n\n".join(
    [
        "## Who we are",
        "{name}, {town}, is responsible for the personal information described in this notice.",
        "## What we collect through this website",
        "When you send an admissions enquiry we collect your name, phone number and (if "
        "you give it) email address, your child's name and date of birth, the level you "
        "are interested in, your preferred visit date and your message.",
        "## Why we use it",
        "We use these details only to reply to your enquiry and to arrange a visit. We do "
        "not sell them or share them with anyone outside the school.",
        "## Who can see it",
        "Only the school staff who handle admissions.",
        "## How long we keep it",
        "If your child does not join the school, we delete the enquiry within 12 months.",
        "## Your rights",
        "You can ask us for a copy of the information we hold about you, ask us to "
        "correct it, or ask us to delete it. Contact the school office to do so.",
        "## The law",
        "We handle personal information in line with Ghana's Data Protection Act, 2012 (Act 843).",
    ]
)

PLATFORM_PRIVACY_NOTICE_BODY = "\n\n".join(
    [
        "## Who we are",
        "{platform} runs websites and school systems for schools in Ghana. This notice "
        "covers this website and the requests sent through it.",
        "## What we collect",
        "When you ask us to get your school online we collect the school's name and town, "
        "your name, phone number and (if you give it) email address, and your message.",
        "## Why we use it",
        "Only to reply to you and talk about setting up your school. We do not sell it or "
        "share it with anyone else.",
        "## How long we keep it",
        "If your school does not join, we delete your request within 12 months.",
        "## Your rights",
        "You can ask for a copy of what we hold about you, or ask us to correct or delete it.",
        "## The law",
        "We handle personal information in line with Ghana's Data Protection Act, 2012 (Act 843).",
    ]
)
