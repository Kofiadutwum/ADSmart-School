from django.contrib import admin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["login", "school", "display_name", "kind", "is_active", "activated_at"]
    list_filter = ["school", "kind", "is_active", "groups"]
    search_fields = ["login", "display_name", "phone"]
    exclude = ["password"]
