from django.contrib import admin

from apps.website.models import (
    ContentBlock,
    Enquiry,
    Fact,
    FeatureBlock,
    Lead,
    NewsPost,
    PhotoSlot,
)


@admin.register(ContentBlock)
class ContentBlockAdmin(admin.ModelAdmin):
    list_display = ["key", "school", "needs_review", "help_text"]
    list_filter = ["school", "needs_review"]
    search_fields = ["key", "text"]


@admin.register(PhotoSlot)
class PhotoSlotAdmin(admin.ModelAdmin):
    list_display = ["key", "school", "caption", "is_placeholder", "order"]
    list_filter = ["school", "is_placeholder"]


@admin.register(NewsPost)
class NewsPostAdmin(admin.ModelAdmin):
    list_display = ["title", "school", "status", "published_at"]
    list_filter = ["school", "status"]
    prepopulated_fields = {"slug": ["title"]}


@admin.register(Fact)
class FactAdmin(admin.ModelAdmin):
    list_display = ["label", "value", "school", "visible"]
    list_filter = ["school"]


@admin.register(FeatureBlock)
class FeatureBlockAdmin(admin.ModelAdmin):
    list_display = ["title", "school", "enabled"]
    list_filter = ["school", "enabled"]


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ["child_name", "school", "level_wanted", "parent_name", "phone", "status"]
    list_filter = ["school", "status", "level_wanted"]


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ["school_name", "town", "contact_name", "phone", "status", "created_at"]
    list_filter = ["status"]
