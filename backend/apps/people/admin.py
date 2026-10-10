from django.contrib import admin

from apps.people.models import (
    EmergencyContact,
    Enrolment,
    Guardianship,
    Parent,
    PickupPerson,
    Staff,
    Student,
)


class EmergencyContactInline(admin.TabularInline):
    model = EmergencyContact
    extra = 0
    exclude = ["school"]


class GuardianshipInline(admin.TabularInline):
    model = Guardianship
    extra = 0
    exclude = ["school"]


class EnrolmentInline(admin.TabularInline):
    model = Enrolment
    extra = 0
    exclude = ["school", "academic_year"]


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ["student_id", "full_name", "school", "status", "is_demo"]
    list_filter = ["school", "status", "is_demo"]
    search_fields = ["student_id", "first_name", "surname"]
    readonly_fields = ["student_id"]
    inlines = [EmergencyContactInline, GuardianshipInline, EnrolmentInline]

    def has_add_permission(self, request):
        return False  # admissions go through apps.people.services.admit_student (Student IDs)


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "phone", "school", "is_demo"]
    list_filter = ["school", "is_demo"]
    search_fields = ["first_name", "surname", "phone"]


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ["__str__", "staff_number", "school", "employment_status", "is_demo"]
    list_filter = ["school", "employment_status", "is_demo"]
    search_fields = ["first_name", "surname", "staff_number"]


@admin.register(PickupPerson)
class PickupPersonAdmin(admin.ModelAdmin):
    list_display = ["__str__", "relationship", "school", "is_demo"]
    list_filter = ["school", "is_demo"]
