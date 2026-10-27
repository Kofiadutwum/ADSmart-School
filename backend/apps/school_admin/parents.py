"""Parents and their links to pupils (Phase 1 spec §5.2, §7.2): add, link with relationship,
payer and primary contact, send the activation text and reset access. Demo numbers are never
texted (§9): send_sms refuses them and the screen is told so."""

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.sessions import end_other_sessions
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.phones import normalise_gh_phone
from apps.notifications.models import SmsMessage
from apps.notifications.sms import Purpose, send_sms
from apps.people.demo import mark_real
from apps.people.models import Guardianship, Parent
from apps.people.services import create_parent, link_guardian
from apps.school_admin.pupils import pupil_of
from apps.school_admin.views import NoticeGivenField, SchoolView

LIST_LIMIT = 200  # shortcut: the first 200 matches; add paging once schools pass that
TAKEN = "A parent with this number is already registered at this school."


def child_row(link: Guardianship) -> dict:
    return {
        "guardianship": link.pk,
        "student": link.student_id,
        "name": link.student.full_name,
        "relationship": link.relationship,
        "is_payer": link.is_payer,
        "is_primary_contact": link.is_primary_contact,
    }


def parent_row(parent: Parent) -> dict:
    links = parent.guardianships.select_related("student").order_by("student__first_name")
    return {
        "id": parent.pk,
        "name": str(parent),
        "title": parent.title,
        "first_name": parent.first_name,
        "surname": parent.surname,
        "phone": parent.phone,
        "alt_phone": parent.alt_phone,
        "email": parent.email,
        "address": parent.address,
        "activated": parent.user.activated_at is not None,
        "is_demo": parent.is_demo,
        "children": [child_row(link) for link in links],
    }


def guardian_row(link: Guardianship) -> dict:
    parent = link.parent
    return {
        "id": link.pk,
        "parent": parent.pk,
        "name": str(parent),
        "phone": parent.phone,
        "relationship": link.relationship,
        "is_payer": link.is_payer,
        "is_primary_contact": link.is_primary_contact,
        "activated": parent.user.activated_at is not None,
        "is_demo": parent.is_demo,
    }


def parent_of(school, pk) -> Parent:
    return get_object_or_404(Parent.objects.for_school(school).select_related("user"), pk=pk)


class MobileField(serializers.CharField):
    """The parent's sign-in number: a Ghana mobile."""

    def to_internal_value(self, data):
        try:
            return normalise_gh_phone(super().to_internal_value(data))
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class AnyPhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalise_gh_phone(value, mobile_only=False) if value else ""
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class LinkSerializer(serializers.Serializer):
    relationship = serializers.ChoiceField(choices=Guardianship.Relationship.choices)
    is_payer = serializers.BooleanField(default=False)
    is_primary_contact = serializers.BooleanField(default=False)


class GuardianSerializer(LinkSerializer):
    parent = serializers.IntegerField()


class NewLinkSerializer(LinkSerializer):
    student = serializers.IntegerField()


class ParentSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=10, allow_blank=True, default="")
    first_name = serializers.CharField(max_length=60)
    surname = serializers.CharField(max_length=60)
    phone = MobileField(max_length=20)
    alt_phone = AnyPhoneField(max_length=20, allow_blank=True, default="")
    email = serializers.EmailField(allow_blank=True, default="")
    address = serializers.CharField(max_length=200, allow_blank=True, default="")


class NewParentSerializer(ParentSerializer):
    link = NewLinkSerializer(required=False)
    privacy_notice_given = NoticeGivenField()


def _number_taken(school, phone: str, exclude: Parent | None = None) -> bool:
    users = User.objects.filter(school=school, login=phone)
    if exclude is not None:
        users = users.exclude(pk=exclude.user_id)
    return users.exists()


def _link(parent, pupil, data: dict, by) -> Guardianship:
    """One primary contact per pupil: choosing a new one clears the old."""
    if data.get("is_primary_contact"):
        Guardianship.objects.filter(student=pupil).update(is_primary_contact=False)
    try:
        with transaction.atomic():
            return link_guardian(
                parent,
                pupil,
                data["relationship"],
                is_payer=data.get("is_payer", False),
                is_primary_contact=data.get("is_primary_contact", False),
                by=by,
            )
    except IntegrityError as exc:
        raise serializers.ValidationError(
            {"parent": ["This parent is already linked to this pupil."]}
        ) from exc


class ParentsView(SchoolView):
    def get(self, request):
        parents = Parent.objects.for_school(self.school).select_related("user")
        query = request.query_params.get("q", "").strip()
        if query:
            matches = Q()
            for word in query.split():
                matches |= Q(first_name__icontains=word) | Q(surname__icontains=word)
            digits = "".join(char for char in query if char.isdigit())
            if len(digits) >= 4:
                matches |= Q(phone__contains=digits[-9:])  # 024… and +23324… end the same way
            parents = parents.filter(matches)
        return Response([parent_row(parent) for parent in parents[:LIST_LIMIT]])

    @transaction.atomic
    def post(self, request):
        data = validated(NewParentSerializer, request)
        data.pop("privacy_notice_given")
        link = data.pop("link", None)
        if _number_taken(self.school, data["phone"]):
            raise serializers.ValidationError({"phone": [TAKEN]})
        pupil = pupil_of(self.school, link["student"]) if link else None
        parent = create_parent(self.school, by=request.user, **data)
        if pupil:
            _link(parent, pupil, link, request.user)
        return Response(parent_row(parent), status=201)


class ParentDetailView(SchoolView):
    def get(self, request, pk):
        return Response(parent_row(parent_of(self.school, pk)))

    @transaction.atomic
    def patch(self, request, pk):
        parent = parent_of(self.school, pk)
        serializer = ParentSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "phone" in data and _number_taken(self.school, data["phone"], exclude=parent):
            raise serializers.ValidationError({"phone": [TAKEN]})
        old = {key: getattr(parent, key) for key in data if getattr(parent, key) != data[key]}
        if old:
            for key in old:
                setattr(parent, key, data[key])
            parent.save(update_fields=list(old))
            user = parent.user
            user.display_name = str(parent)
            user.login = user.phone = parent.phone  # the number is the parent's sign-in
            user.email = parent.email
            user.save()
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=parent,
                old=old,
                new={key: getattr(parent, key) for key in old},
                request=request,
            )
        return Response(parent_row(parent))


def send_activation(parent: Parent, request) -> dict:
    school = parent.school
    message = send_sms(
        parent.phone,
        f"{school.name}: your parent account is ready. To sign in, open "
        f"{school.base_url()}/activate and enter this phone number to get a code.",
        purpose=Purpose.ACCOUNT_NOTICE,
        school=school,
    )
    record(
        AuditLog.Action.ACTIVATION_SENT,
        actor=request.user,
        entity=parent,
        new={"status": message.status},
        request=request,
    )
    if message.status == SmsMessage.Status.SENT:
        return {"sent": True, "reason": ""}
    return {"sent": False, "reason": "demo" if message.error == "demo_recipient" else "failed"}


class ParentActivationView(SchoolView):
    def post(self, request, pk):
        return Response(send_activation(parent_of(self.school, pk), request))


class ParentResetView(SchoolView):
    """Lost phone or forgotten password: the parent activates again with a texted code."""

    def post(self, request, pk):
        parent = parent_of(self.school, pk)
        with transaction.atomic():
            user = parent.user
            user.set_unusable_password()
            user.save(update_fields=["password"])
            end_other_sessions(user, keep_key=None)
            record(
                AuditLog.Action.PASSWORD_RESET,
                actor=request.user,
                entity=user,
                reason="Access reset by the school",
                request=request,
            )
        return Response(send_activation(parent, request))


class ParentMakeRealView(SchoolView):
    @transaction.atomic
    def post(self, request, pk):
        return Response(parent_row(mark_real(parent_of(self.school, pk), by=request.user)))


class GuardiansView(SchoolView):
    def get(self, request, pk):
        pupil = pupil_of(self.school, pk)
        links = pupil.guardianships.select_related("parent__user").order_by("parent__first_name")
        return Response([guardian_row(link) for link in links])

    @transaction.atomic
    def post(self, request, pk):
        pupil = pupil_of(self.school, pk)
        data = validated(GuardianSerializer, request)
        parent = Parent.objects.for_school(self.school).filter(pk=data["parent"]).first()
        if parent is None:
            raise serializers.ValidationError({"parent": ["Choose a parent of this school."]})
        return Response(guardian_row(_link(parent, pupil, data, request.user)), status=201)


class GuardianDetailView(SchoolView):
    def _link(self, pk) -> Guardianship:
        links = Guardianship.objects.for_school(self.school)
        return get_object_or_404(links.select_related("parent__user", "student"), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        link = self._link(pk)
        serializer = LinkSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get("is_primary_contact"):
            others = Guardianship.objects.filter(student=link.student).exclude(pk=link.pk)
            others.update(is_primary_contact=False)
        old = {key: getattr(link, key) for key in data if getattr(link, key) != data[key]}
        for key, value in data.items():
            setattr(link, key, value)
        link.save()
        if old:
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=link,
                old=old,
                new={key: getattr(link, key) for key in old},
                request=request,
            )
        return Response(guardian_row(link))

    @transaction.atomic
    def delete(self, request, pk):
        link = self._link(pk)
        # Recorded on the pupil: the link itself is gone afterwards.
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=link.student,
            old={"guardian": str(link.parent), "relationship": link.relationship},
            request=request,
        )
        link.delete()
        return Response(status=204)
