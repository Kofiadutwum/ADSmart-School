"""Pupils in the school portal (Phase 1 spec §3.2, §7.2): admission, profile, status with a
reason, emergency contacts, photo, demo conversion and change history. A pupil's photo is only
ever served with PHOTO_USE consent (§3.5); screens show initials otherwise."""

import mimetypes

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.academics.models import SchoolClass
from apps.academics.structure import BANDS, year_groups_for
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import Consent
from apps.consent.services import photo_allowed
from apps.core.phones import normalise_gh_phone
from apps.people.demo import mark_real
from apps.people.models import EmergencyContact, Enrolment, Gender, Student
from apps.people.services import add_emergency_contact, admit_student, change_student_status, enrol
from apps.platform_content.uploads import validate_photo
from apps.school_admin.dashboard import current_year
from apps.school_admin.views import SchoolView, audit_row

LIST_LIMIT = 200  # shortcut: the first 200 matches; add paging once schools pass that
HISTORY_LIMIT = 200
PROFILE = (
    "first_name",
    "middle_name",
    "surname",
    "date_of_birth",
    "gender",
    "previous_school",
    "address",
    "pickup_point",
)


def with_details(pupils, year):
    """Everything a pupil row needs, fetched together for the whole list."""
    photo_ok = Consent.objects.filter(
        student=OuterRef("pk"), type=Consent.Type.PHOTO_USE, given=True
    )
    places = Enrolment.objects.filter(end_date__isnull=True, academic_year=year)
    return pupils.annotate(
        contact_count=Count("emergency_contacts", distinct=True), photo_ok=Exists(photo_ok)
    ).prefetch_related(
        Prefetch("enrolments", queryset=places.select_related("school_class"), to_attr="places")
    )


def initials(student: Student) -> str:
    return f"{student.first_name[:1]}{student.surname[:1]}".upper()


def pupil_row(student: Student) -> dict:
    place = student.places[0] if student.places else None
    return {
        "id": student.pk,
        "student_id": student.student_id,
        "name": student.full_name,
        "class": place.school_class.name if place else "",
        "class_id": place.school_class_id if place else None,
        "band": place.school_class.band if place else "",
        "status": student.status,
        "is_demo": student.is_demo,
        "contacts_incomplete": student.contact_count < 2,
        "initials": initials(student),
        "has_photo": bool(student.photo) and student.photo_ok,
    }


def pupil_detail(student: Student) -> dict:
    pupil = with_details(Student.objects.filter(pk=student.pk), current_year(student.school)).get()
    row = pupil_row(pupil)
    return {
        **row,
        **{name: getattr(pupil, name) for name in PROFILE},
        "admission_date": pupil.admission_date,
        "photo_on_file": bool(pupil.photo),
        "login": pupil.user.login if pupil.user_id else None,
        "can_have_login": bool(row["band"]) and BANDS[row["band"]].student_login,
    }


def pupil_of(school, pk) -> Student:
    return get_object_or_404(Student.objects.for_school(school), pk=pk)


class NewPupilSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60)
    middle_name = serializers.CharField(max_length=60, allow_blank=True, default="")
    surname = serializers.CharField(max_length=60)
    date_of_birth = serializers.DateField()
    gender = serializers.ChoiceField(choices=Gender.choices)
    admission_date = serializers.DateField(default=timezone.localdate)
    previous_school = serializers.CharField(max_length=120, allow_blank=True, default="")
    address = serializers.CharField(max_length=200, allow_blank=True, default="")
    pickup_point = serializers.CharField(max_length=120, allow_blank=True, default="")
    school_class = serializers.IntegerField(required=False, allow_null=True)


class ProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60)
    middle_name = serializers.CharField(max_length=60, allow_blank=True)
    surname = serializers.CharField(max_length=60)
    date_of_birth = serializers.DateField()
    gender = serializers.ChoiceField(choices=Gender.choices)
    previous_school = serializers.CharField(max_length=120, allow_blank=True)
    address = serializers.CharField(max_length=200, allow_blank=True)
    pickup_point = serializers.CharField(max_length=120, allow_blank=True)


def _filtered(pupils, params, year):
    query = params.get("q", "").strip()
    if query.isdigit():
        pupils = pupils.filter(student_id__startswith=query)
    else:
        for word in query.split():
            pupils = pupils.filter(
                Q(first_name__icontains=word)
                | Q(middle_name__icontains=word)
                | Q(surname__icontains=word)
            )
    open_places = {"enrolments__end_date__isnull": True, "enrolments__academic_year": year}
    if params.get("class", "").isdigit():
        pupils = pupils.filter(enrolments__school_class_id=params["class"], **open_places)
    elif params.get("class") == "none":  # not yet placed this year (Enrolment, P1 §7.2)
        placed = Enrolment.objects.filter(academic_year=year, end_date__isnull=True)
        pupils = pupils.exclude(pk__in=placed.values("student_id"))
    if params.get("level") in BANDS:
        groups = [group.code for group in year_groups_for([params["level"]])]
        pupils = pupils.filter(enrolments__school_class__year_group__in=groups, **open_places)
    if params.get("status") in Student.Status.values:
        pupils = pupils.filter(status=params["status"])
    if params.get("demo") in ("0", "1"):
        pupils = pupils.filter(is_demo=params["demo"] == "1")
    return pupils.distinct()


class PupilsView(SchoolView):
    def get(self, request):
        year = current_year(self.school)
        pupils = _filtered(Student.objects.for_school(self.school), request.query_params, year)
        return Response([pupil_row(pupil) for pupil in with_details(pupils, year)[:LIST_LIMIT]])

    @transaction.atomic
    def post(self, request):
        data = validated(NewPupilSerializer, request)
        class_id = data.pop("school_class", None)
        school_class = None
        if class_id is not None:
            school_class = SchoolClass.objects.for_school(self.school).filter(pk=class_id).first()
            if school_class is None:
                raise serializers.ValidationError(
                    {"school_class": ["Choose a class of this school."]}
                )
        pupil = admit_student(self.school, by=request.user, **data)
        if school_class:
            enrol(pupil, school_class, start_date=pupil.admission_date, by=request.user)
        return Response(pupil_detail(pupil), status=201)


class PupilDetailView(SchoolView):
    def get(self, request, pk):
        return Response(pupil_detail(pupil_of(self.school, pk)))

    @transaction.atomic
    def patch(self, request, pk):
        pupil = pupil_of(self.school, pk)
        serializer = ProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        old = {key: getattr(pupil, key) for key in data if getattr(pupil, key) != data[key]}
        if old:
            for key in old:
                setattr(pupil, key, data[key])
            pupil.save(update_fields=list(old))
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=pupil,
                old={key: str(value) for key, value in old.items()},
                new={key: str(data[key]) for key in old},
                request=request,
            )
        return Response(pupil_detail(pupil))


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Student.Status.choices)
    reason = serializers.CharField(max_length=500, allow_blank=True)

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("Give a reason for the change.")
        return value


class PupilStatusView(SchoolView):
    @transaction.atomic
    def post(self, request, pk):
        pupil = pupil_of(self.school, pk)
        data = validated(StatusSerializer, request)
        change_student_status(pupil, data["status"], reason=data["reason"], by=request.user)
        return Response(pupil_detail(pupil))


class PupilMakeRealView(SchoolView):
    @transaction.atomic
    def post(self, request, pk):
        return Response(pupil_detail(mark_real(pupil_of(self.school, pk), by=request.user)))


class PhotoSerializer(serializers.Serializer):
    photo = serializers.FileField()

    def validate_photo(self, value):
        return validate_photo(value)


def photo_response(field_file) -> HttpResponse:
    """Private: only people allowed to see the photo get it, and shared caches never keep it.
    Read whole and closed at once: photos are small (PHOTO_MAX_MB), and Cloudinary downloads."""
    kind = mimetypes.guess_type(field_file.name)[0] or "application/octet-stream"
    with field_file.open("rb") as photo:
        response = HttpResponse(photo.read(), content_type=kind)
    response["Cache-Control"] = "private, max-age=300"
    return response


def serve_pupil_photo(pupil: Student) -> HttpResponse:
    if not pupil.photo or not photo_allowed(pupil):
        raise Http404
    return photo_response(pupil.photo)


class PupilPhotoView(SchoolView):
    parser_classes = [MultiPartParser]

    def get(self, request, pk):
        return serve_pupil_photo(pupil_of(self.school, pk))

    @transaction.atomic
    def post(self, request, pk):
        pupil = pupil_of(self.school, pk)
        data = validated(PhotoSerializer, request)
        if pupil.photo:
            pupil.photo.delete(save=False)
        pupil.photo = data["photo"]
        pupil.save(update_fields=["photo"])
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=pupil,
            new={"photo": "new"},
            request=request,
        )
        return Response(pupil_detail(pupil))

    @transaction.atomic
    def delete(self, request, pk):
        pupil = pupil_of(self.school, pk)
        if pupil.photo:
            pupil.photo.delete(save=False)
            pupil.photo = ""
            pupil.save(update_fields=["photo"])
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=pupil,
                new={"photo": "removed"},
                request=request,
            )
        return Response(pupil_detail(pupil))


def contact_row(contact: EmergencyContact) -> dict:
    return {
        "id": contact.pk,
        "name": contact.name,
        "phone": contact.phone,
        "relationship": contact.relationship,
        "priority": contact.priority,
    }


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    relationship = serializers.CharField(max_length=40)

    def validate_phone(self, value):
        try:
            return normalise_gh_phone(value, mobile_only=False)  # a landline will do
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


def _contact_note(contact: EmergencyContact) -> dict:
    return {"emergency_contact": contact.name, "phone": contact.phone}


class ContactsView(SchoolView):
    def get(self, request, pk):
        pupil = pupil_of(self.school, pk)
        return Response([contact_row(row) for row in pupil.emergency_contacts.all()])

    @transaction.atomic
    def post(self, request, pk):
        pupil = pupil_of(self.school, pk)
        data = validated(ContactSerializer, request)
        contact = add_emergency_contact(pupil, **data)
        # Recorded on the pupil, so the change history keeps it even after a removal.
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=pupil,
            new=_contact_note(contact),
            request=request,
        )
        return Response(contact_row(contact), status=201)


class ContactDetailView(SchoolView):
    def _contact(self, pk) -> EmergencyContact:
        return get_object_or_404(EmergencyContact.objects.for_school(self.school), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        contact = self._contact(pk)
        serializer = ContactSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        old = _contact_note(contact)
        for key, value in serializer.validated_data.items():
            setattr(contact, key, value)
        contact.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=contact.student,
            old=old,
            new=_contact_note(contact),
            request=request,
        )
        return Response(contact_row(contact))

    @transaction.atomic
    def delete(self, request, pk):
        contact = self._contact(pk)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=contact.student,
            old=_contact_note(contact),
            request=request,
        )
        contact.delete()
        return Response(status=204)


class PupilHistoryView(SchoolView):
    """Changes to the pupil and to their family, places and consents (P1 §7.2)."""

    def get(self, request, pk):
        pupil = pupil_of(self.school, pk)
        related = {
            "people.guardianship": pupil.guardianships.values_list("pk", flat=True),
            "people.pickupperson": pupil.pickup_people.values_list("pk", flat=True),
            "people.enrolment": pupil.enrolments.values_list("pk", flat=True),
            "consent.consent": pupil.consents.values_list("pk", flat=True),
        }
        matches = Q(entity_type="people.student", entity_id=str(pupil.pk))
        for entity_type, ids in related.items():
            matches |= Q(entity_type=entity_type, entity_id__in=[str(each) for each in ids])
        entries = (
            AuditLog.objects.filter(school=self.school).filter(matches).select_related("actor")
        )
        return Response(
            [
                {**audit_row(entry), "old": entry.old_value, "new": entry.new_value}
                for entry in entries[:HISTORY_LIMIT]
            ]
        )
