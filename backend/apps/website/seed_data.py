"""Default website content. Everything here is provisional (needs_review / is_placeholder /
is_draft) until the school confirms it, so the site stays in preview (spec §6.5)."""

from dataclasses import dataclass

SCHOOL_SLUG = "adsmart"
SCHOOL = {
    "name": "AD Smart School",
    "motto": "",
    "founded_year": 2001,
    "address": "",
    "town": "Kronom, Kumasi",
    "region": "Ashanti Region",
    "ghana_post_gps": "",
    "phone": "+233545875881",
    "whatsapp": "+233545875881",
    "email": "kofiadutwumjnr881@gmail.com",
    "map_query": "Kronom, Kumasi, Ghana",
}

LEVEL_CODES = ("creche", "nursery", "kg", "lower_primary", "upper_primary", "jhs")

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

_LEVEL_BLOCKS = [
    item
    for code, (ages, summary, detail) in _LEVELS.items()
    for item in (
        (f"level_{code}_ages", ages, f"Levels: age range for {code}"),
        (f"level_{code}_summary", summary, f"Levels: one-line summary for {code}"),
        (f"level_{code}_detail", detail, f"Levels page: longer description for {code}"),
    )
]

# (key, text, where it appears)
CONTENT_BLOCKS: list[tuple[str, str, str]] = [
    ("hero_headline", "Bright beginnings, from Crèche to JHS", "Home: main headline"),
    ("hero_subline", "Kronom, Kumasi · Since 2001", "Home: small line above the headline"),
    (
        "hero_intro",
        "A caring school for children from Crèche to Junior High in Kronom, Kumasi. Come "
        "and see where your child will learn, play and grow.",
        "Home: introduction under the headline",
    ),
    (
        "levels_intro",
        "One school for every stage of childhood, so your child can grow with friends and "
        "teachers who know them.",
        "Home: introduction to the levels",
    ),
    *_LEVEL_BLOCKS,
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
        "AD Smart School opened its doors in Kronom, Kumasi in 2001.\n\nToday we teach "
        "children from Crèche through Junior High School, so families can stay with us "
        "from their child's first steps to the BECE.",
        "About: the school's story",
    ),
    (
        "head_teacher_welcome",
        "Welcome to AD Smart School. Our teachers work hard to make every child feel safe, "
        "valued and excited to learn. We look forward to meeting you and your family.",
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
    ("footer_tagline", "Bright beginnings, from Crèche to JHS.", "Footer: short tagline"),
]

# (label, value)
FACTS = [
    ("years serving Kronom", "{years}"),
    ("every stage of basic education", "Crèche–JHS"),
]

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

NEWS = [
    {
        "slug": "welcome-to-our-new-website",
        "title": "Welcome to our new website",
        "summary": "School news, key dates and admissions information, together in one place.",
        "body": "We are building a new website and school system for AD Smart School.\n\n"
        "Soon you will find school news, key dates and admissions information here, and "
        "parents will be able to follow their children's progress online.",
    },
]

PRIVACY_NOTICE = {
    "version": "2026-draft-1",
    "title": "Privacy notice",
    "body": "\n\n".join(
        [
            "## Who we are",
            "AD Smart School, Kronom, Kumasi, is responsible for the personal information "
            "described in this notice.",
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
            "We handle personal information in line with Ghana's Data Protection Act, 2012 "
            "(Act 843).",
        ]
    ),
}
