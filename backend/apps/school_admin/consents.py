"""Consents by type, given or withdrawn against the privacy notice in force (Phase 1 spec §3.5).
The row keeps the latest answer; the audit log keeps every change (consent.services)."""

from django.db import transaction
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts.views import validated
from apps.consent.models import Consent
from apps.consent.services import PARENT_TYPES, set_consent
from apps.core.exceptions import ApiError
from apps.school_admin.parents import parent_of
from apps.school_admin.pupils import pupil_of
from apps.school_admin.views import SchoolView

PUPIL_TYPES = [kind for kind in Consent.Type if kind not in PARENT_TYPES]
PARENT_ONLY = [kind for kind in Consent.Type if kind in PARENT_TYPES]


def consent_row(consent_type, consent: Consent | None) -> dict:
    """`given` is None when nobody has answered yet."""
    notice = consent.privacy_notice if consent and consent.privacy_notice_id else None
    return {
        "type": consent_type.value,
        "label": consent_type.label,
        "given": consent.given if consent else None,
        "given_at": consent.given_at if consent else None,
        "withdrawn_at": consent.withdrawn_at if consent else None,
        "notice_version": notice.version if notice else None,
    }


def consent_rows(subject, types) -> list[dict]:
    field = "parent" if types == PARENT_ONLY else "student"
    consents = Consent.objects.filter(**{field: subject}).select_related("privacy_notice")
    answers = {consent.type: consent for consent in consents}
    return [consent_row(kind, answers.get(kind.value)) for kind in types]


class AnswerSerializer(serializers.Serializer):
    given = serializers.BooleanField()


def answer(subject, consent_type: str, types, request) -> dict:
    """Give or withdraw one consent; a type that is not this person's is refused."""
    if consent_type not in [kind.value for kind in types]:
        raise ApiError("wrong_consent", "That consent is not recorded for this person.")
    given = validated(AnswerSerializer, request)["given"]
    with transaction.atomic():
        consent = set_consent(subject, consent_type, given, by=request.user)
    return consent_row(Consent.Type(consent_type), consent)


class PupilConsentsView(SchoolView):
    def get(self, request, pk):
        return Response(consent_rows(pupil_of(self.school, pk), PUPIL_TYPES))


class PupilConsentView(SchoolView):
    def put(self, request, pk, kind):
        return Response(answer(pupil_of(self.school, pk), kind, PUPIL_TYPES, request))


class ParentConsentsView(SchoolView):
    def get(self, request, pk):
        return Response(consent_rows(parent_of(self.school, pk), PARENT_ONLY))


class ParentConsentView(SchoolView):
    def put(self, request, pk, kind):
        return Response(answer(parent_of(self.school, pk), kind, PARENT_ONLY, request))
