"""The school's website from its own portal (Phase 1 spec §6.5, §7.2): text blocks with their
"reviewed" mark, facts, feature blocks, photo slots, news, the enquiry inbox, the privacy
notice, and Mark site live, which stays disabled while anything still blocks publication."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.views import validated
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.consent.models import PrivacyNotice
from apps.core.exceptions import ApiError
from apps.core.images import image_payload
from apps.core.resources import Resource
from apps.platform_content.refresh import refresh_school_sites
from apps.platform_content.uploads import delete_photo_files, validate_photo
from apps.school.models import School
from apps.school_admin.views import SchoolView
from apps.website.models import ContentBlock, Enquiry, Fact, FeatureBlock, NewsPost, PhotoSlot
from apps.website.services import publication_blockers

WEB = (roles.ADMINISTRATOR,)
READERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
NOT_LIVE = "The site has not been marked live"


class RefreshingResource(Resource):
    read_roles = READERS
    write_roles = WEB

    @classmethod
    def after_save(cls, view, instance, created):
        refresh_school_sites()


class FactResource(RefreshingResource):
    model = Fact
    fields = ("label", "value", "order", "visible")
    ordering = ("order", "id")


class FeatureResource(RefreshingResource):
    model = FeatureBlock
    fields = ("title", "text", "enabled", "order")
    shown = ("key", "icon")
    ordering = ("order", "id")
    deletable = False


class BlockSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, max_length=8000)
    needs_review = serializers.BooleanField(required=False)


def block_row(block: ContentBlock) -> dict:
    return {
        "id": block.pk,
        "key": block.key,
        "text": block.text,
        "help_text": block.help_text,
        "needs_review": block.needs_review,
    }


class BlocksView(SchoolView):
    read_roles, write_roles = READERS, WEB

    def get(self, request):
        return Response([block_row(row) for row in ContentBlock.objects.for_school(self.school).order_by("key")])


class BlockDetailView(SchoolView):
    read_roles, write_roles = READERS, WEB

    @transaction.atomic
    def patch(self, request, pk):
        block = get_object_or_404(ContentBlock.objects.for_school(self.school), pk=pk)
        data = validated(BlockSerializer, request)
        old = {key: getattr(block, key) for key in data if getattr(block, key) != data[key]}
        for key, value in data.items():
            setattr(block, key, value)
        block.save()
        if old:
            record(AuditLog.Action.UPDATED, actor=request.user, entity=block, old={k: str(v)[:200] for k, v in old.items()}, request=request)
            refresh_school_sites()
        return Response(block_row(block))


def photo_row(slot: PhotoSlot) -> dict:
    return {
        "id": slot.pk,
        "key": slot.key,
        "alt_text": slot.alt_text,
        "caption": slot.caption,
        "is_placeholder": slot.is_placeholder,
        "image": image_payload(slot.renditions, slot.alt_text),
    }


class PhotoSerializer(serializers.Serializer):
    alt_text = serializers.CharField(required=False, max_length=200)
    caption = serializers.CharField(required=False, max_length=120, allow_blank=True)


class PhotoUploadSerializer(serializers.Serializer):
    image = serializers.FileField()
    alt_text = serializers.CharField(max_length=200)

    def validate_image(self, value):
        return validate_photo(value)


class PhotosView(SchoolView):
    read_roles, write_roles = READERS, WEB

    def get(self, request):
        slots = PhotoSlot.objects.for_school(self.school).order_by("order", "key")
        return Response([photo_row(slot) for slot in slots])


class PhotoDetailView(SchoolView):
    read_roles, write_roles = READERS, WEB
    parser_classes = [MultiPartParser, JSONParser]

    def slot(self, pk) -> PhotoSlot:
        return get_object_or_404(PhotoSlot.objects.for_school(self.school), pk=pk)

    @transaction.atomic
    def patch(self, request, pk):
        slot = self.slot(pk)
        data = validated(PhotoSerializer, request)
        for key, value in data.items():
            setattr(slot, key, value)
        slot.save()
        record(AuditLog.Action.UPDATED, actor=request.user, entity=slot, new=dict(data), request=request)
        refresh_school_sites()
        return Response(photo_row(slot))

    @transaction.atomic
    def post(self, request, pk):
        """A real photo replaces the placeholder (P1 §6.5)."""
        slot = self.slot(pk)
        data = validated(PhotoUploadSerializer, request)
        if not slot.is_placeholder:
            delete_photo_files(slot.image, slot.renditions)
        slot.image, slot.alt_text, slot.is_placeholder = data["image"], data["alt_text"], False
        slot.renditions = []
        slot.save()
        slot.refresh_from_db()
        record(AuditLog.Action.UPDATED, actor=request.user, entity=slot, new={"photo": "new"}, request=request)
        refresh_school_sites()
        return Response(photo_row(slot))


class NewsResource(RefreshingResource):
    model = NewsPost
    fields = ("title", "summary", "body", "cover_alt")
    shown = ("slug", "status", "published_at")
    ordering = ("-id",)

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is None:
            base = slugify(data.get("title", ""))[:150] or "news"
            slug, number = base, 2
            while NewsPost.objects.filter(school=view.school, slug=slug).exists():
                slug, number = f"{base}-{number}", number + 1
            data["slug"] = slug
        return data

    @classmethod
    def row(cls, view, instance):
        return {**super().row(view, instance), "cover": image_payload(instance.renditions, instance.cover_alt)}


class NewsPublishView(SchoolView):
    read_roles, write_roles = READERS, WEB

    @transaction.atomic
    def post(self, request, pk, action):
        post = get_object_or_404(NewsPost.objects.for_school(self.school), pk=pk)
        if action == "publish":
            post.status, post.published_at = NewsPost.Status.PUBLISHED, post.published_at or timezone.now()
            audit = AuditLog.Action.PUBLISHED
        else:
            post.status = NewsPost.Status.DRAFT
            audit = AuditLog.Action.UNPUBLISHED
        post.save()
        record(audit, actor=request.user, entity=post, request=request)
        refresh_school_sites()
        return Response(NewsResource.row(self, post))


class NewsCoverSerializer(serializers.Serializer):
    image = serializers.FileField()
    cover_alt = serializers.CharField(max_length=200)

    def validate_image(self, value):
        return validate_photo(value)


class NewsCoverView(SchoolView):
    read_roles, write_roles = READERS, WEB
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request, pk):
        post = get_object_or_404(NewsPost.objects.for_school(self.school), pk=pk)
        data = validated(NewsCoverSerializer, request)
        delete_photo_files(post.cover, post.renditions)
        post.cover, post.cover_alt = data["image"], data["cover_alt"]
        post.save()
        post.refresh_from_db()
        refresh_school_sites()
        return Response(NewsResource.row(self, post))


class EnquiryResource(Resource):
    """The enquiry inbox (P1 §7.2): status and notes; the enquiry itself is the parent's."""

    model = Enquiry
    fields = ("status", "staff_notes")
    shown = (
        "parent_name",
        "phone",
        "email",
        "child_name",
        "child_date_of_birth",
        "level_wanted",
        "preferred_visit_date",
        "message",
        "created_at",
    )
    read_roles = (*READERS, roles.FRONT_DESK)
    write_roles = (roles.ADMINISTRATOR, roles.FRONT_DESK)
    filters = {"status": "status"}
    ordering = ("-created_at",)
    deletable = False

    @classmethod
    def build(cls, base):
        list_view, detail_view = super().build(base)

        class ReadOnlyList(list_view):
            def post(self, request):
                raise ApiError("not_allowed", "Enquiries come from the website form.", 405)

        return ReadOnlyList, detail_view


def notice_row(notice: PrivacyNotice) -> dict:
    return {
        "id": notice.pk,
        "version": notice.version,
        "title": notice.title,
        "body": notice.body,
        "effective_from": notice.effective_from,
        "is_draft": notice.is_draft,
    }


class NoticeSerializer(serializers.Serializer):
    version = serializers.CharField(max_length=20)
    title = serializers.CharField(max_length=120, required=False)
    body = serializers.CharField(max_length=20000)
    effective_from = serializers.DateField()


def notices_view(school_of, base=SchoolView, read=READERS, write=WEB):
    """The same draft-and-approve screens for a school's notice and the platform's own."""

    class NoticesView(base):
        read_roles, write_roles = read, write

        def get(self, request):
            return Response([notice_row(n) for n in PrivacyNotice.objects.filter(school=school_of(self))])

        @transaction.atomic
        def post(self, request):
            data = validated(NoticeSerializer, request)
            school = school_of(self)
            if PrivacyNotice.objects.filter(school=school, version=data["version"]).exists():
                raise serializers.ValidationError({"version": ["That version already exists."]})
            notice = PrivacyNotice.objects.create(school=school, is_draft=True, **data)
            record(AuditLog.Action.CREATED, actor=request.user, entity=notice, request=request, school=school)
            return Response(notice_row(notice), status=201)

    class NoticeDetailView(base):
        read_roles, write_roles = read, write

        @transaction.atomic
        def patch(self, request, pk):
            notice = get_object_or_404(PrivacyNotice, pk=pk, school=school_of(self))
            if not notice.is_draft:
                raise ApiError("approved", "An approved notice can't change; write a new version.")
            serializer = NoticeSerializer(data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            for key, value in serializer.validated_data.items():
                setattr(notice, key, value)
            notice.save()
            return Response(notice_row(notice))

        @transaction.atomic
        def post(self, request, pk):
            notice = get_object_or_404(PrivacyNotice, pk=pk, school=school_of(self))
            notice.is_draft = False
            notice.save(update_fields=["is_draft"])
            record(AuditLog.Action.PUBLISHED, actor=request.user, entity=notice, request=request, school=school_of(self))
            refresh_school_sites()
            return Response(notice_row(notice))

    return NoticesView, NoticeDetailView


SchoolNoticesView, SchoolNoticeDetailView = notices_view(lambda view: view.school)


class LiveSerializer(serializers.Serializer):
    live = serializers.BooleanField()


class LiveView(SchoolView):
    """Mark site live is refused while anything else still blocks publication (P1 §6.5)."""

    read_roles, write_roles = READERS, WEB

    def payload(self, school: School) -> dict:
        blockers = [item for item in publication_blockers(school) if item != NOT_LIVE]
        return {"is_live": school.is_live, "blockers": blockers, "went_live_at": school.went_live_at}

    def get(self, request):
        return Response(self.payload(self.school))

    @transaction.atomic
    def post(self, request):
        live = validated(LiveSerializer, request)["live"]
        school = School.objects.select_for_update().get(pk=self.school.pk)
        payload = self.payload(school)
        if live and payload["blockers"]:
            raise ApiError("not_ready", "The site can't go live yet: " + "; ".join(payload["blockers"]) + ".")
        school.is_live = live
        if live and not school.went_live_at:
            school.went_live_at = timezone.now()
        school.save(update_fields=["is_live", "went_live_at"])
        action = AuditLog.Action.WEBSITE_LIVE if live else AuditLog.Action.UPDATED
        record(action, actor=request.user, entity=school, new={"is_live": live}, request=request)
        refresh_school_sites()
        return Response(self.payload(school))
