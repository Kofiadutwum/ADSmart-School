"""The pupil portal API (Phase 1 spec §7.3): a pupil from Basic 4 sees their own profile and
class. The pupil record comes from the signed-in account itself."""

from django.shortcuts import get_object_or_404
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.people.models import Student
from apps.school_admin.class_lists import class_teacher_name
from apps.school_admin.dashboard import current_year
from apps.school_admin.pupils import pupil_row, serve_pupil_photo, with_details

SHOWN = ("student_id", "name", "class", "initials", "has_photo")


class IsPupil(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.kind == User.Kind.STUDENT and user.school_id
        )


class PupilView(APIView):
    permission_classes = [IsPupil]

    def pupil(self) -> Student:
        return get_object_or_404(Student, user=self.request.user)


class MeView(PupilView):
    def get(self, request):
        own = self.pupil()
        pupil = with_details(Student.objects.filter(pk=own.pk), current_year(own.school)).get()
        row = pupil_row(pupil)
        place = pupil.places[0] if pupil.places else None
        return Response(
            {
                **{key: row[key] for key in SHOWN},
                "first_name": pupil.first_name,
                "status": pupil.status,
                "class_teacher": class_teacher_name(place.school_class) if place else None,
            }
        )


class PhotoView(PupilView):
    def get(self, request):
        return serve_pupil_photo(self.pupil())
