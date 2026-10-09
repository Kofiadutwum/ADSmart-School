from django.contrib import admin

from apps.website.models import (
    ContentBlock,
    Enquiry,
    Fact,
    FeatureBlock,
    NewsPost,
    PhotoSlot,
    SiteSettings,
)


@admin.register(ContentBlock)
class ContentBlockAdmin(admin.ModelAdmin):
    list_display = ["key", "needs_review", "help_text"]
    list_filter = ["needs_review"]
    search_fields = ["key", "text"]


@admin.register(PhotoSlot)
class PhotoSlotAdmin(admin.ModelAdmin):
    list_display = ["key", "caption", "is_placeholder", "order"]
    list_filter = ["is_placeholder"]


@admin.register(NewsPost)
class NewsPostAdmin(admin.ModelAdmin):
    list_display = ["title", "status", "published_at"]
    prepopulated_fields = {"slug": ["title"]}


admin.site.register(SiteSettings)
admin.site.register(Fact)
admin.site.register(FeatureBlock)


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ["child_name", "level_wanted", "parent_name", "phone", "status", "created_at"]
    list_filter = ["status", "level_wanted"]
