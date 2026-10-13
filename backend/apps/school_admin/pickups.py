"""People allowed to collect a pupil (Phase 1 spec §3.2, §11.3): add, edit, photo and end, every
change audited. Gate checks at collection time arrive in Phase 5."""

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.people.models import PickupPerson
from apps.people.services import add_pickup_person
from apps.school_admin.parents import MobileField
from apps.school_admin.pupils import PhotoSerializer, photo_response, pupil_of
from apps.school_admin.views import SchoolView


def is_current(person: PickupPerson, today=None) -> bool:
    today = today or timezone.localdate()
    return person.valid_from <= today and (person.valid_to is None or person.valid_to >= today)


def pickup_row(person: PickupPerson) -> dict:
    return {
        "id": person.pk,
        "name": person.name,
        "phone": person.phone,
        "relationship": person.relationship,
        "valid_from": person.valid_from,
        "valid_to": person.valid_to,
        "is_current": is_current(person),
        "has_photo": bool(person.photo),
        "is_demo": person.is_demo,
    }


class PickupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = MobileField(max_length=20)
    relationship = serializers.CharField(max_length=40)
    valid_from = serializers.DateField(default=timezone.localdate)
    valid_to = serializers.DateField(required=False, allow_null=True)

    def validate(self, data):
        start = data.get("valid_from", getattr(self.instance, "valid_from", None))
        end = data.get("valid_to", getattr(self.instance, "valid_to", None))
        if start and end and end < start:
            raise serializers.ValidationError({"valid_to": "The end can't be before the start."})
        return data


def _changed(person: PickupPerson, data: dict, request) -> PickupPerson:
    old = {key: str(getattr(person, key)) for key in data if getattr(person, key) != data[key]}
    for key, value in data.items():
        setattr(person, key, value)
    person.save()
    if old:
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=person,
            old=old,
            new={key: str(getattr(person, key)) for key in old},
            request=request,
        )
    return person


class PickupsView(SchoolView):
    def get(self, request, pk):
        people = pupil_of(self.school, pk).pickup_people.order_by("-valid_from", "name")
        return Response([pickup_row(person) for person in people])

    @transaction.atomic
    def post(self, request, pk):
        pupil = pupil_of(self.school, pk)
        data = validated(PickupSerializer, request)
        return Response(pickup_row(add_pickup_person(pupil, by=request.user, **data)), status=201)


class PickupDetailView(SchoolView):
    def _person(self, pk) -> PickupPerson:
        return get_object_or_404(PickupPerson.objects.for_school(self.school), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        person = self._person(pk)
        serializer = PickupSerializer(person, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(pickup_row(_changed(person, dict(serializer.validated_data), request)))


class PickupEndView(PickupDetailView):
    """Allowed until the end of today, then no longer."""

    @transaction.atomic
    def post(self, request, pk):
        person = self._person(pk)
        end = max(timezone.localdate(), person.valid_from)
        return Response(pickup_row(_changed(person, {"valid_to": end}, request)))


class PickupPhotoView(PickupDetailView):
    parser_classes = [MultiPartParser, JSONParser]

    def get(self, request, pk):
        person = self._person(pk)
        if not person.photo:
            raise Http404
        return photo_response(person.photo)

    @transaction.atomic
    def post(self, request, pk):
        person = self._person(pk)
        data = validated(PhotoSerializer, request)
        if person.photo:
            person.photo.delete(save=False)
        person.photo = data["photo"]
        person.save(update_fields=["photo"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=person,
            new={"photo": "new"},
            request=request,
        )
        return Response(pickup_row(person))
