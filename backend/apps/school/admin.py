from django.contrib import admin

from apps.school.models import School, SchoolDomain


class SchoolDomainInline(admin.TabularInline):
    model = SchoolDomain
    extra = 0


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "status", "is_live", "created_at"]
    list_filter = ["status", "is_live"]
    search_fields = ["name", "slug", "town"]
    inlines = [SchoolDomainInline]
