"""The parent portal API (Phase 1 spec §7.3, SMS spec §30): a parent's own wards, their pick-up
persons, consents and the school's privacy notice. Everything is fetched through the parent's
own guardianships, so another family's child is never in the query (§4.2)."""

from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.views import validated
from apps.consent.models import PrivacyNotice
from apps.people.models import Parent, PickupPerson, Student
from apps.school_admin.class_lists import class_teacher_name
from apps.school_admin.consents import PARENT_ONLY, PUPIL_TYPES, answer, consent_rows
from apps.school_admin.dashboard import current_year
from apps.school_admin.pickups import is_current
from apps.school_admin.pupils import photo_response, pupil_row, serve_pupil_photo, with_details


class IsParent(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.kind == User.Kind.PARENT
            and user.school_id
            and not user.school.billing_paused
        )


class ParentView(APIView):
    permission_classes = [IsParent]

    @property
    def parent(self) -> Parent:
        return get_object_or_404(Parent, user=self.request.user)

    def wards(self):
        return Student.objects.filter(guardianships__parent=self.parent).distinct()


def ward_card(pupil: Student) -> dict:
    row = pupil_row(pupil)
    place = pupil.places[0] if pupil.places else None
    people = [person for person in pupil.pickup_people.order_by("name") if is_current(person)]
    return {
        **{key: row[key] for key in ("id", "student_id", "name", "class", "initials", "has_photo")},
        "first_name": pupil.first_name,
        "class_teacher": class_teacher_name(place.school_class) if place else None,
        "pickups": [
            {
                "id": person.pk,
                "name": person.name,
                "relationship": person.relationship,
                "phone": person.phone,
                "valid_to": person.valid_to,
                "has_photo": bool(person.photo),
            }
            for person in people
        ],
    }


class WardsView(ParentView):
    def get(self, request):
        wards = with_details(self.wards(), current_year(self.parent.school))
        return Response([ward_card(pupil) for pupil in wards.order_by("first_name")])


class WardPhotoView(ParentView):
    def get(self, request, pk):
        return serve_pupil_photo(get_object_or_404(self.wards(), pk=pk))


class PickupPhotoView(ParentView):
    def get(self, request, pk):
        person = get_object_or_404(PickupPerson.objects.filter(student__in=self.wards()), pk=pk)
        if not person.photo:
            raise Http404
        return photo_response(person.photo)


def notice_payload(school) -> dict | None:
    """Only a reviewed notice is shown; a draft is still being written (P1 §6.5)."""
    notice = PrivacyNotice.current(school)
    if notice is None or notice.is_draft:
        return None
    return {
        "title": notice.title,
        "version": notice.version,
        "effective_from": notice.effective_from,
        "body": notice.body,
    }


class ConsentChoiceSerializer(serializers.Serializer):
    student = serializers.IntegerField(allow_null=True)
    type = serializers.CharField(max_length=20)


class ConsentsView(ParentView):
    def get(self, request):
        parent = self.parent
        return Response(
            {
                "notice": notice_payload(parent.school),
                "wards": [
                    {
                        "id": pupil.pk,
                        "name": pupil.full_name,
                        "consents": consent_rows(pupil, PUPIL_TYPES),
                    }
                    for pupil in self.wards().order_by("first_name")
                ],
                "own": consent_rows(parent, PARENT_ONLY),
            }
        )

    def put(self, request):
        choice = validated(ConsentChoiceSerializer, request)
        if choice["student"] is None:
            return Response(answer(self.parent, choice["type"], PARENT_ONLY, request))
        pupil = get_object_or_404(self.wards(), pk=choice["student"])
        return Response(answer(pupil, choice["type"], PUPIL_TYPES, request))
