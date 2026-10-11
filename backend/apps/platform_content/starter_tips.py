"""Starter tips, saved as drafts for the owner to edit and approve (business tools spec §5.3).
Nothing here is published by the system."""

from apps.platform_content.models import Article

STARTER_TIPS = [
    {
        "slug": "make-it-easy-for-parents-to-enquire",
        "title": "Make it easy for parents to enquire",
        "summary": "Small changes that help more families take the first step towards your school.",
        "body": (
            "Most families start with a simple question: is there space, and what will it "
            "cost? The easier you make that first step, the more families take it.\n\n"
            "## Answer quickly\n\n"
            "- Reply to every enquiry within one working day, even if only to say when you "
            "will call.\n"
            "- Agree who in the office follows up, so no enquiry is forgotten.\n\n"
            "## Say what parents want to know\n\n"
            "- Which classes have space this year.\n"
            "- How and when to visit the school.\n"
            "- Which documents to bring.\n\n"
            "## Keep a simple record\n\n"
            "Write down every enquiry: the child's name, the class wanted and when you called "
            "back. At the end of each term, look at how many enquiries became new pupils. It "
            "shows where families come from and which follow-ups work."
        ),
    },
    {
        "slug": "keep-parents-informed-without-extra-work",
        "title": "Keep parents informed without extra work",
        "summary": "Short, regular updates build trust and save your office from repeated calls.",
        "body": (
            "Parents who know what is happening at school worry less and call the office "
            "less.\n\n"
            "## Choose a rhythm\n\n"
            "- A short update every week or two is better than a long letter once a term.\n"
            "- Send key dates early: reopening, exams, PTA meetings and vacation.\n\n"
            "## Keep it short\n\n"
            "- One or two sentences for each item.\n"
            "- Say what parents need to do, and by when.\n\n"
            "## Use what parents already use\n\n"
            "SMS reaches every phone. WhatsApp and email suit longer notes and photos. Whatever "
            "you choose, use it the same way every time, so parents know where to look."
        ),
    },
    {
        "slug": "collect-fees-on-time-kindly",
        "title": "Collect fees on time, kindly",
        "summary": (
            "Clear bills, early reminders and easy ways to pay make fees less awkward for everyone."
        ),
        "body": (
            "Fee collection goes better when parents know exactly what they owe, when it is due "
            "and how to pay.\n\n"
            "## Be clear from the start\n\n"
            "- Share the term's fees before it begins, item by item.\n"
            "- Say when each payment is due.\n\n"
            "## Make paying easy\n\n"
            "- Accept Mobile Money as well as cash and bank payments.\n"
            "- Give a receipt for every payment, every time.\n\n"
            "## Remind early and politely\n\n"
            "A friendly reminder before the due date works better than a hard one after it. "
            "Speak privately with families who are struggling and agree a plan. Never single "
            "out a child in class."
        ),
    },
    {
        "slug": "show-your-school-at-its-best-online",
        "title": "Show your school at its best online",
        "summary": "A clear, honest website helps parents choose your school with confidence.",
        "body": (
            "Many parents look a school up online before they visit. What they find shapes "
            "their first impression.\n\n"
            "## Get the basics right\n\n"
            "- Your phone number, location and how to visit, easy to find.\n"
            "- The classes you offer.\n"
            "- Up-to-date admissions information.\n\n"
            "## Use real photos\n\n"
            "Photos of your own classrooms, pupils at work and school events say more than any "
            "description. Ask parents' permission before you publish photos of children.\n\n"
            "## Share news regularly\n\n"
            "A short post about a sports day, a reading competition or a trip shows a lively "
            "school. One or two posts a month is enough."
        ),
    },
]


def seed_starter_tips() -> int:
    made = 0
    for tip in STARTER_TIPS:
        fields = {key: value for key, value in tip.items() if key != "slug"}
        _, created = Article.objects.get_or_create(
            slug=tip["slug"], defaults={**fields, "kind": Article.Kind.TIP}
        )
        made += created
    return made
