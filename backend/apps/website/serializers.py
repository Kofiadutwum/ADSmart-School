from datetime import date, timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.core.phones import normalise_gh_phone
from apps.website.models import Enquiry

MAX_CHILD_AGE_YEARS = 18
MAX_VISIT_DAYS_AHEAD = 180


def _years_ago(today: date, years: int) -> date:
    try:
        return today.replace(year=today.year - years)
    except ValueError:  # 29 February
        return today.replace(year=today.year - years, day=28)


class EnquirySerializer(serializers.ModelSerializer):
    data_consent = serializers.BooleanField()

    class Meta:
        model = Enquiry
        fields = [
            "parent_name",
            "phone",
            "email",
            "child_name",
            "child_date_of_birth",
            "level_wanted",
            "preferred_visit_date",
            "message",
            "data_consent",
        ]
        extra_kwargs = {
            "email": {"required": False, "allow_blank": True},
            "message": {"required": False, "allow_blank": True},
            "preferred_visit_date": {"required": False, "allow_null": True},
        }

    def validate_parent_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return value.strip()

    def validate_child_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Enter your child's full name.")
        return value.strip()

    def validate_phone(self, value: str) -> str:
        try:
            return normalise_gh_phone(value, mobile_only=True)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_level_wanted(self, value: str) -> str:
        school = self.context.get("school")
        if school is not None and value not in school.levels_offered:
            raise serializers.ValidationError(
                "We don't teach that level. Choose one of the levels listed."
            )
        return value

    def validate_child_date_of_birth(self, value: date) -> date:
        today = timezone.localdate()
        if value > today:
            raise serializers.ValidationError("Date of birth can't be in the future.")
        if value < _years_ago(today, MAX_CHILD_AGE_YEARS):
            raise serializers.ValidationError(
                "Please check the date of birth: we teach children up to JHS."
            )
        return value

    def validate_preferred_visit_date(self, value: date | None) -> date | None:
        if value is None:
            return value
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("Choose today or a later date.")
        if value > today + timedelta(days=MAX_VISIT_DAYS_AHEAD):
            raise serializers.ValidationError("Choose a date within the next six months.")
        return value

    def validate_data_consent(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError(
                "Please agree so we can use these details to reply to you."
            )
        return value
