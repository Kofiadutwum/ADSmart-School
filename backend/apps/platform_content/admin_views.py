"""The Website section of the admin area (business tools spec §5), for the Content role."""

import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError
from apps.core.images import image_payload
from apps.platform_admin.permissions import PlatformRole
from apps.platform_content import refresh
from apps.platform_content.articles import email_due_articles
from apps.platform_content.models import (
    PEOPLE_PERMISSION,
    Article,
    ArticleImage,
    FaqItem,
    GalleryPhoto,
    PlatformSettings,
    Testimonial,
)
from apps.platform_content.uploads import FormBoolean, delete_photo_files, validate_photo
from apps.school.models import School


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


# Articles and tips (§5.3)


def article_row(article: Article) -> dict:
    return {
        "id": article.pk,
        "kind": article.kind,
        "title": article.title,
        "slug": article.slug,
        "summary": article.summary,
        "body": article.body,
        "cover": image_payload(article.renditions, article.cover_alt),
        "cover_alt": article.cover_alt,
        "author_name": article.author_name,
        "status": article.status,
        "state": article.state,
        "publish_at": article.publish_at,
        "email_subscribers": article.email_subscribers,
        "emailed_at": article.emailed_at,
        "updated_at": article.updated_at,
    }


def unique_slug(title: str, *, exclude_pk=None) -> str:
    base = slugify(title)[:160] or "article"
    slug, number = base, 2
    while Article.objects.filter(slug=slug).exclude(pk=exclude_pk).exists():
        slug, number = f"{base}-{number}", number + 1
    return slug


class ArticleFieldsSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Article.Kind.choices)
    title = serializers.CharField(max_length=160)
    summary = serializers.CharField(max_length=240, required=False, allow_blank=True)
    body = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    author_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    cover_alt = serializers.CharField(max_length=200, required=False, allow_blank=True)


def _article(pk: int) -> Article:
    return get_object_or_404(Article, pk=pk)


def _is_live(article: Article) -> bool:
    return article.status == Article.Status.PUBLISHED


class ArticlesView(ContentView):
    def get(self, request):
        return Response([article_row(article) for article in Article.objects.all()])

    @transaction.atomic
    def post(self, request):
        data = dict(checked(ArticleFieldsSerializer, request.data))
        data.setdefault("author_name", str(request.user))
        article = Article.objects.create(**data, slug=unique_slug(data["title"]))
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=article,
            new={"title": article.title},
            request=request,
        )
        return Response(article_row(article), status=201)


class ArticleView(ContentView):
    def get(self, request, pk):
        return Response(article_row(_article(pk)))

    @transaction.atomic
    def patch(self, request, pk):
        article = _article(pk)
        data = checked(ArticleFieldsSerializer, request.data, partial=True)
        old, new = changed_fields(article, data)
        if "title" in new and article.publish_at is None:  # never shared: the address follows
            article.slug = unique_slug(article.title, exclude_pk=article.pk)
        if new:
            article.save()
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=article,
                old=old,
                new=new,
                request=request,
            )
            if _is_live(article):
                refresh.refresh_platform_site()
        return Response(article_row(article))

    @transaction.atomic
    def delete(self, request, pk):
        article = _article(pk)
        if _is_live(article):
            raise ApiError("still_published", "Unpublish it first.", 400)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=article,
            old={"title": article.title},
            request=request,
        )
        delete_photo_files(article.cover, article.renditions)
        article.delete()
        return Response(status=204)


class CoverSerializer(serializers.Serializer):
    image = serializers.FileField()
    cover_alt = serializers.CharField(max_length=200)

    def validate_image(self, value):
        return validate_photo(value, max_mb=10)


class ArticleCoverView(ContentView):
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, pk):
        article = _article(pk)
        data = checked(CoverSerializer, request.data)
        delete_photo_files(article.cover, article.renditions)
        article.cover, article.cover_alt = data["image"], data["cover_alt"]
        article.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=article,
            new={"cover": article.cover.name},
            request=request,
        )
        if _is_live(article):
            refresh.refresh_platform_site()
        return Response(article_row(article))

    @transaction.atomic
    def delete(self, request, pk):
        article = _article(pk)
        delete_photo_files(article.cover, article.renditions)
        article.cover, article.cover_alt = "", ""
        article.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=article,
            new={"cover": ""},
            request=request,
        )
        if _is_live(article):
            refresh.refresh_platform_site()
        return Response(article_row(article))


class PublishSerializer(serializers.Serializer):
    publish_at = serializers.DateTimeField(required=False, allow_null=True)
    email_subscribers = serializers.BooleanField(default=False)


PUBLISH_NEEDS = {
    "title": "Give it a title.",
    "summary": "Write a short summary before publishing.",
    "body": "Write the article before publishing.",
}


class ArticlePublishView(ContentView):
    @transaction.atomic
    def post(self, request, pk):
        article = _article(pk)
        data = checked(PublishSerializer, request.data)
        missing = {
            name: [message]
            for name, message in PUBLISH_NEEDS.items()
            if not getattr(article, name).strip()
        }
        if article.cover and not article.cover_alt.strip():
            missing["cover_alt"] = ["Describe the cover photo for blind visitors."]
        if missing:
            raise serializers.ValidationError(missing)
        now = timezone.now()
        when = data.get("publish_at") or now
        article.status = Article.Status.PUBLISHED
        article.publish_at = when if when > now else now
        article.email_subscribers = data["email_subscribers"]
        article.save()
        record(
            AuditLog.Action.PUBLISHED,
            actor=request.user,
            entity=article,
            new={
                "publish_at": article.publish_at.isoformat(),
                "email_subscribers": article.email_subscribers,
            },
            request=request,
        )
        refresh.refresh_platform_site()
        if article.email_subscribers and article.publish_at <= now:
            transaction.on_commit(email_due_articles)
        return Response(article_row(article))


class ArticleUnpublishView(ContentView):
    @transaction.atomic
    def post(self, request, pk):
        article = _article(pk)
        if _is_live(article):
            article.status = Article.Status.DRAFT
            article.save(update_fields=["status", "updated_at"])
            record(AuditLog.Action.UNPUBLISHED, actor=request.user, entity=article, request=request)
            refresh.refresh_platform_site()
        return Response(article_row(article))


class ArticleImageSerializer(serializers.Serializer):
    image = serializers.FileField()
    alt_text = serializers.CharField(max_length=200)

    def validate_image(self, value):
        return validate_photo(value, max_mb=10)


class ArticleImagesView(ContentView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        data = checked(ArticleImageSerializer, request.data)
        photo = ArticleImage.objects.create(**data)
        src = image_payload(photo.renditions, photo.alt_text)["src"]
        alt = photo.alt_text.replace("[", "").replace("]", "")
        return Response(
            {"src": src, "alt": photo.alt_text, "markdown": f"![{alt}]({src})"}, status=201
        )


# Comments from schools (§5.5)


def testimonial_row(comment: Testimonial) -> dict:
    return {
        "id": comment.pk,
        "quote": comment.quote,
        "person_name": comment.person_name,
        "person_role": comment.person_role,
        "school_name": comment.school_name,
        "school_slug": comment.school.slug if comment.school else "",
        "photo": image_payload(comment.renditions, comment.person_name),
        "permission": comment.permission,
        "visible": comment.visible,
        "order": comment.order,
    }


class TestimonialSerializer(serializers.Serializer):
    quote = serializers.CharField(max_length=600)
    person_name = serializers.CharField(max_length=80)
    person_role = serializers.CharField(max_length=80, required=False, allow_blank=True)
    school_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    school_slug = serializers.CharField(max_length=30, required=False, allow_blank=True)
    permission = serializers.BooleanField(required=False)
    visible = serializers.BooleanField(required=False)

    def validate_school_slug(self, value):
        if not value:
            return None
        school = School.objects.filter(slug=value).first()
        if school is None:
            raise serializers.ValidationError("No school has that address.")
        return school

    def validate(self, data):
        if "school_slug" in data:
            data["school"] = data.pop("school_slug")
            if data["school"] and not data.get("school_name"):
                data["school_name"] = data["school"].name
        return data


def _comment(pk: int) -> Testimonial:
    return get_object_or_404(Testimonial.objects.select_related("school"), pk=pk)


class TestimonialsView(ContentView):
    def get(self, request):
        comments = Testimonial.objects.select_related("school")
        return Response([testimonial_row(comment) for comment in comments])

    @transaction.atomic
    def post(self, request):
        data = checked(TestimonialSerializer, request.data)
        comment = Testimonial(**data, order=next_order(Testimonial))
        full_clean(comment)
        comment.save()
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=comment,
            new={"person_name": comment.person_name, "visible": comment.visible},
            request=request,
        )
        refresh.refresh_platform_site()
        return Response(testimonial_row(comment), status=201)


class TestimonialView(ContentView):
    @transaction.atomic
    def patch(self, request, pk):
        comment = _comment(pk)
        data = checked(TestimonialSerializer, request.data, partial=True)
        old, new = changed_fields(comment, data)
        full_clean(comment)
        if new:
            comment.save()
            audit_new = {key: getattr(value, "slug", value) for key, value in new.items()}
            audit_old = {key: getattr(value, "slug", value) for key, value in old.items()}
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=comment,
                old=audit_old,
                new=audit_new,
                request=request,
            )
            refresh.refresh_platform_site()
        return Response(testimonial_row(comment))

    @transaction.atomic
    def delete(self, request, pk):
        comment = _comment(pk)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=comment,
            old={"person_name": comment.person_name},
            request=request,
        )
        delete_photo_files(comment.photo, comment.renditions)
        comment.delete()
        refresh.refresh_platform_site()
        return Response(status=204)


class SmallPhotoSerializer(serializers.Serializer):
    image = serializers.FileField()

    def validate_image(self, value):
        return validate_photo(value, max_mb=5)


class TestimonialPhotoView(ContentView):
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, pk):
        comment = _comment(pk)
        data = checked(SmallPhotoSerializer, request.data)
        delete_photo_files(comment.photo, comment.renditions)
        comment.photo = data["image"]
        comment.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=comment,
            new={"photo": comment.photo.name},
            request=request,
        )
        refresh.refresh_platform_site()
        return Response(testimonial_row(comment))

    @transaction.atomic
    def delete(self, request, pk):
        comment = _comment(pk)
        delete_photo_files(comment.photo, comment.renditions)
        comment.photo = ""
        comment.save()
        record(
            AuditLog.Action.UPDATED,
            actor=request.user,
            entity=comment,
            new={"photo": ""},
            request=request,
        )
        refresh.refresh_platform_site()
        return Response(testimonial_row(comment))


class TestimonialOrderView(ContentView):
    @transaction.atomic
    def post(self, request):
        data = checked(OrderSerializer, request.data)
        reorder(Testimonial, data["ids"], by=request.user, request=request)
        return Response([testimonial_row(c) for c in Testimonial.objects.select_related("school")])


# Questions and answers (§5.5)


def faq_row(item: FaqItem) -> dict:
    return {
        "id": item.pk,
        "question": item.question,
        "answer": item.answer,
        "visible": item.visible,
        "order": item.order,
    }


class FaqSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=200)
    answer = serializers.CharField(trim_whitespace=False)
    visible = serializers.BooleanField(required=False)


class FaqsView(ContentView):
    def get(self, request):
        return Response([faq_row(item) for item in FaqItem.objects.all()])

    @transaction.atomic
    def post(self, request):
        item = FaqItem.objects.create(
            **checked(FaqSerializer, request.data), order=next_order(FaqItem)
        )
        record(
            AuditLog.Action.CREATED,
            actor=request.user,
            entity=item,
            new={"question": item.question},
            request=request,
        )
        refresh.refresh_platform_site()
        return Response(faq_row(item), status=201)


class FaqView(ContentView):
    @transaction.atomic
    def patch(self, request, pk):
        item = get_object_or_404(FaqItem, pk=pk)
        old, new = changed_fields(item, checked(FaqSerializer, request.data, partial=True))
        if new:
            item.save(update_fields=list(new))
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=item,
                old=old,
                new=new,
                request=request,
            )
            refresh.refresh_platform_site()
        return Response(faq_row(item))

    @transaction.atomic
    def delete(self, request, pk):
        item = get_object_or_404(FaqItem, pk=pk)
        record(
            AuditLog.Action.DELETED,
            actor=request.user,
            entity=item,
            old={"question": item.question},
            request=request,
        )
        item.delete()
        refresh.refresh_platform_site()
        return Response(status=204)


class FaqOrderView(ContentView):
    @transaction.atomic
    def post(self, request):
        reorder(
            FaqItem, checked(OrderSerializer, request.data)["ids"], by=request.user, request=request
        )
        return Response([faq_row(item) for item in FaqItem.objects.all()])


# Website settings (§5.6)

CHANNEL_LINK = re.compile(r"^https://(www\.)?whatsapp\.com/channel/[A-Za-z0-9_-]+/?$")


class SettingsSerializer(serializers.Serializer):
    whatsapp_channel_url = serializers.CharField(max_length=200, allow_blank=True)

    def validate_whatsapp_channel_url(self, value):
        value = value.strip()
        if value and not CHANNEL_LINK.match(value):
            raise serializers.ValidationError(
                "Paste your WhatsApp Channel's link. It starts with https://whatsapp.com/channel/"
            )
        return value


class SettingsView(ContentView):
    def get(self, request):
        return Response({"whatsapp_channel_url": PlatformSettings.load().whatsapp_channel_url})

    @transaction.atomic
    def patch(self, request):
        found = PlatformSettings.load()
        old, new = changed_fields(found, checked(SettingsSerializer, request.data))
        if new:
            found.save(update_fields=list(new))
            record(
                AuditLog.Action.UPDATED,
                actor=request.user,
                entity=found,
                old=old,
                new=new,
                request=request,
            )
            refresh.refresh_platform_site()
        return Response({"whatsapp_channel_url": found.whatsapp_channel_url})
