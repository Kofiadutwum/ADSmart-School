from django.contrib import admin

from apps.academics.models import (
    AcademicYear,
    CalendarDay,
    ClassTeacherAssignment,
    SchoolClass,
    Subject,
    TeachingAssignment,
    Term,
)


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "start_date", "end_date", "is_current"]
    list_filter = ["school"]


@admin.register(Term)
class TermAdmin(admin.ModelAdmin):
    list_display = ["__str__", "school", "start_date", "end_date"]
    list_filter = ["school"]


@admin.register(CalendarDay)
class CalendarDayAdmin(admin.ModelAdmin):
    list_display = ["date", "school", "type", "note"]
    list_filter = ["school", "type"]


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display = ["name", "school", "academic_year"]
    list_filter = ["school", "academic_year"]


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "school", "is_learning_area"]
    list_filter = ["school"]


@admin.register(ClassTeacherAssignment, TeachingAssignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "school", "term"]
    list_filter = ["school"]
