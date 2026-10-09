"""Ghana phone numbers: stored as E.164 (+233…), shown as 054 587 5881 (spec §3.4)."""

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat, PhoneNumberType

MOBILE_TYPES = {PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE}
MOBILE_MESSAGE = "Enter a Ghana mobile number, e.g. 024 123 4567."
ANY_MESSAGE = "Enter a valid Ghana phone number, e.g. 024 123 4567."


def normalise_gh_phone(raw: str, *, mobile_only: bool = True) -> str:
    message = MOBILE_MESSAGE if mobile_only else ANY_MESSAGE
    try:
        number = phonenumbers.parse((raw or "").strip(), "GH")
    except NumberParseException as exc:
        raise ValueError(message) from exc
    if number.country_code != 233 or not phonenumbers.is_valid_number(number):
        raise ValueError(message)
    if mobile_only and phonenumbers.number_type(number) not in MOBILE_TYPES:
        raise ValueError(message)
    return phonenumbers.format_number(number, PhoneNumberFormat.E164)


def format_gh_local(e164: str) -> str:
    return phonenumbers.format_number(phonenumbers.parse(e164, "GH"), PhoneNumberFormat.NATIONAL)


def whatsapp_link(e164: str) -> str:
    return f"https://wa.me/{e164.lstrip('+')}"
