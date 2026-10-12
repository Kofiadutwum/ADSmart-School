"""The school's own profile, programme bands, logo and colours (Phase 1 spec §3.1, §7.2). The
name, address slug and status stay with the platform team."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.academics.models import SchoolClass
from apps.academics.structure import BANDS, YEAR_GROUPS
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.images import image_payload
from apps.platform_content.refresh import refresh_school_sites
from apps.platform_content.uploads import delete_photo_files, validate_photo
from apps.school.models import School
from apps.school_admin.views import SchoolView

EDITABLE = (
    "motto",
    "founded_year",
    "address",
    "town",
    "region",
    "ghana_post_gps",
    "phone",
    "whatsapp",
    "email",
    "map_query",
    "levels_offered",
    "brand_primary",
    "brand_accent",
)


def profile_payload(school: School) -> dict:
    return {
        "name": school.name,
        "slug": school.slug,
        **{name: getattr(school, name) for name in EDITABLE},
        "logo": image_payload(school.renditions, f"{school.name} logo"),
        "level_choices": [{"code": band.code, "name": band.name} for band in BANDS.values()],
    }


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = EDITABLE
        extra_kwargs = {"levels_offered": {"required": False}}


def _bands_in_use(school: School, levels: list[str]) -> None:
    groups = SchoolClass.objects.for_school(school).values_list("year_group", flat=True).distinct()
    used = {YEAR_GROUPS[group].band for group in groups} - set(levels)
    if used:
        names = ", ".join(BANDS[code].name for code in BANDS if code in used)
        raise serializers.ValidationError(
            {"levels_offered": [f"Classes in {names} use this level; remove them first."]}
        )


class ProfileView(SchoolView):
    def get(self, request):
        return Response(profile_payload(self.school))

    @transaction.atomic
    def patch(self, request):
        school = School.objects.select_for_update().get(pk=self.school.pk)
        serializer = ProfileSerializer(school, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "levels_offered" in data:
            _bands_in_use(school, data["levels_offered"])
        before = {name: getattr(school, name) for name in data}
        for name, value in data.items():
            setattr(school, name, value)
        try:
            school.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict) from exc
        old = {name: value for name, value in before.items() if getattr(school, name) != value}
        if old:
            school.save(update_fields=list(old))
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=school,
                old=old,
                new={name: getattr(school, name) for name in old},
                request=request,
            )
            refresh_school_sites()
        return Response(profile_payload(school))


class LogoSerializer(serializers.Serializer):
    logo = serializers.FileField()

    def validate_logo(self, value):
        return validate_photo(value)


class LogoView(SchoolView):
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request):
        school = School.objects.select_for_update().get(pk=self.school.pk)
        data = validated(LogoSerializer, request)
        delete_photo_files(school.logo, school.renditions)
        school.logo = data["logo"]
        school.save()
        school.refresh_from_db()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=school,
            new={"logo": school.logo.name},
            request=request,
        )
        refresh_school_sites()
        return Response(profile_payload(school))

    @transaction.atomic
    def delete(self, request):
        school = School.objects.select_for_update().get(pk=self.school.pk)
        if school.logo:
            delete_photo_files(school.logo, school.renditions)
            school.logo = ""
            school.save()
            school.refresh_from_db()
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=school,
                new={"logo": ""},
                request=request,
            )
            refresh_school_sites()
        return Response(profile_payload(school))
