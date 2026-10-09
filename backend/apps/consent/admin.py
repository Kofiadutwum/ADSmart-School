from django.contrib import admin

from apps.consent.models import PrivacyNotice


@admin.register(PrivacyNotice)
class PrivacyNoticeAdmin(admin.ModelAdmin):
    list_display = ["title", "version", "school", "effective_from", "is_draft"]
    list_filter = ["school", "is_draft"]
