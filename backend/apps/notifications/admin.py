from django.contrib import admin

from apps.notifications.models import SmsMessage


@admin.register(SmsMessage)
class SmsMessageAdmin(admin.ModelAdmin):
    list_display = ["created_at", "school", "to", "purpose", "status", "error"]
    list_filter = ["school", "status", "purpose"]
