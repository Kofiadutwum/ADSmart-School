"""Wording of automatic messages (SMS spec §24). A school's Head Teacher approves its own
wording; until then the default below is used. Placeholders are {name} style."""

from apps.notifications.models import MessageTemplate

DEFAULTS = {
    "ABSENCE": (
        "{school}: {pupil} was marked absent today ({date}). Please contact the school if "
        "you did not expect this."
    ),
    "RECEIPT": (
        "{school}: payment of GHS {amount} received for {pupil}. Receipt {receipt}. Thank you."
    ),
    "INSTALMENT_DUE": (
        "{school}: GHS {amount} for {pupil} is due on {date}. Pay at the school or online."
    ),
    "INSTALMENT_OVERDUE": (
        "{school}: GHS {amount} for {pupil} was due on {date} and is still unpaid."
    ),
    "LOW_BALANCE": "{school}: {pupil}'s wallet is low (GHS {amount}). Please top it up.",
    "PAYMENT_LINK": "{school}: pay GHS {amount} for {pupil} here: {link}",
    "INCIDENT": "{school}: please note an incident involving {pupil} today: {detail}",
    "BLOCKED_COLLECTION": (
        "{school}: someone not on {pupil}'s pick-up list ({collector}) tried to collect "
        "them. They were not released. Please call the school."
    ),
    "RELEASED": "{school}: {pupil} was collected by {collector} at {time}.",
    "BUS": "{school}: {pupil} {event} the school bus at {time}.",
    "BOOKS_READY": "{school}: {pupil}'s order is ready to collect. Code {code}.",
    "STATEMENT": "{school}: {class_name} week of {week}: {summary}",
}


def render(school, key: str, **context) -> str:
    template = MessageTemplate.objects.filter(school=school, key=key, approved=True).first()
    text = template.body if template else DEFAULTS[key]
    try:
        return text.format(school=school.name, **context)
    except KeyError, IndexError:  # an approved wording with an unknown placeholder
        return DEFAULTS[key].format(school=school.name, **context)
