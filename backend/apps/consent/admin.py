from django.contrib import admin

from apps.consent.models import Consent, PrivacyNotice


@admin.register(PrivacyNotice)
class PrivacyNoticeAdmin(admin.ModelAdmin):
    list_display = ["title", "version", "school", "effective_from", "is_draft"]
    list_filter = ["school", "is_draft"]


@admin.register(Consent)
class ConsentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "student", "parent", "school", "updated_at"]
    list_filter = ["school", "type", "given"]
