"""The Website section of the admin area (business tools spec §5), for the Content role."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.images import image_payload
from apps.platform_admin.permissions import PlatformRole
from apps.platform_content import refresh
from apps.platform_content.models import PEOPLE_PERMISSION, GalleryPhoto
from apps.platform_content.uploads import FormBoolean, delete_photo_files, validate_photo


class ContentView(APIView):
    permission_classes = [PlatformRole(roles.PLATFORM_CONTENT)]


def checked(serializer_class, data, **kwargs) -> dict:
    serializer = serializer_class(data=data, **kwargs)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def full_clean(instance) -> None:
    try:
        instance.clean()
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.message_dict) from exc


def changed_fields(instance, data: dict) -> tuple[dict, dict]:
    old = {name: getattr(instance, name) for name in data if getattr(instance, name) != data[name]}
    for name, value in data.items():
        setattr(instance, name, value)
    return old, {name: data[name] for name in old}


def next_order(model) -> int:
    return (model.objects.aggregate(top=Max("order"))["top"] or 0) + 1


def reorder(model, ids: list[int], *, by, request) -> None:
    current = list(model.objects.values_list("pk", flat=True))
    if len(ids) != len(set(ids)) or sorted(ids) != sorted(current):
        raise serializers.ValidationError({"ids": ["List every item once."]})
    rows = model.objects.in_bulk(ids)
    for index, pk in enumerate(ids):
        rows[pk].order = index + 1
    model.objects.bulk_update(rows.values(), ["order"])
    record(
        AuditLog.Action.UPDATED,
        actor=by,
        entity_type=model._meta.label_lower,
        new={"order": ids},
        request=request,
    )
    refresh.refresh_platform_site()


class OrderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField())


# Gallery (§5.2)


def gallery_row(photo: GalleryPhoto) -> dict:
    return {
        "id": photo.pk,
        "image": image_payload(photo.renditions, photo.alt_text),
        "alt_text": photo.alt_text,
        "caption": photo.caption,
        "shows_people": photo.shows_people,
        "people_permission": photo.people_permission,
        "visible": photo.visible,
        "order": photo.order,
    }


class PhotoFieldsSerializer(serializers.Serializer):
    alt_text = serializers.CharField(max_length=200)
    caption = serializers.CharField(max_length=160, required=False, allow_blank=True)
    shows_people = FormBoolean(required=False)
    people_permission = FormBoolean(required=False)
    visible = FormBoolean(required=False)


class NewPhotoSerializer(PhotoFieldsSerializer):
    image = serializers.FileField()
    caption = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    shows_people = FormBoolean(required=False, default=False)
    people_permission = FormBoolean(required=False, default=False)
    visible = FormBoolean(required=False, default=True)

    def validate_image(self, value):
        return validate_photo(value, max_mb=10)

    def validate(self, data):
        if data["visible"] and data["shows_people"] and not data["people_permission"]:
            raise serializers.ValidationError({"people_permission": [PEOPLE_PERMISSION]})
        return data


class GalleryView(ContentView):
    parser_classes = [MultiPartParser, JSONParser]

    def get(self, request):
        return Response([gallery_row(photo) for photo in GalleryPhoto.objects.all()])

    @transaction.atomic
    def post(self, request):
        data = checked(NewPhotoSerializer, request.data)
        photo = GalleryPhoto.objects.create(**data, order=next_order(GalleryPhoto))
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=photo,
            new={"alt_text": photo.alt_text, "visible": photo.visible},
            request=request,
        )
        refresh.refresh_platform_site()
        return Response(gallery_row(photo), status=201)


class GalleryPhotoView(ContentView):
    @transaction.atomic
    def patch(self, request, pk):
        photo = get_object_or_404(GalleryPhoto, pk=pk)
        data = checked(PhotoFieldsSerializer, request.data, partial=True)
        old, new = changed_fields(photo, data)
        full_clean(photo)
        if new:
            photo.save(update_fields=list(new))
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=photo,
                old=old,
                new=new,
                request=request,
            )
            refresh.refresh_platform_site()
        return Response(gallery_row(photo))

    @transaction.atomic
    def delete(self, request, pk):
        photo = get_object_or_404(GalleryPhoto, pk=pk)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=photo,
            old={"alt_text": photo.alt_text},
            request=request,
        )
        delete_photo_files(photo.image, photo.renditions)
        photo.delete()
        refresh.refresh_platform_site()
        return Response(status=204)


class GalleryOrderView(ContentView):
    @transaction.atomic
    def post(self, request):
        data = checked(OrderSerializer, request.data)
        reorder(GalleryPhoto, data["ids"], by=request.user, request=request)
        return Response([gallery_row(photo) for photo in GalleryPhoto.objects.all()])
