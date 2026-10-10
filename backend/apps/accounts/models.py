from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.utils import timezone


def user_key(school_id, login: str) -> str:
    """The platform-wide unique key: logins are only unique within a school (amendment §3.3)."""
    return f"{school_id}:{login}" if school_id else f"platform:{login}"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, login, *, kind, school=None, password=None, **fields):
        user = self.model(login=login, kind=kind, school=school, **fields)
        user.set_password(password)  # None gives an unusable password: awaiting activation
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **fields):
        """Django's createsuperuser: a platform staff member with Django admin access."""
        fields.update(is_staff=True, is_superuser=True)
        return self.create_user(username, kind=User.Kind.PLATFORM, password=password, **fields)


class User(AbstractBaseUser, PermissionsMixin):
    """One account per person per school; platform staff belong to no school. Roles are groups."""

    class Kind(models.TextChoices):
        STAFF = "staff", "Staff"
        PARENT = "parent", "Parent"
        STUDENT = "student", "Student"
        PLATFORM = "platform", "Platform staff"

    username = models.CharField(max_length=180, unique=True, editable=False)
    school = models.ForeignKey(
        "school.School", null=True, blank=True, on_delete=models.PROTECT, related_name="users"
    )
    # Staff or platform username, parent phone (E.164) or Student ID digits: see identifiers.py.
    login = models.CharField(max_length=150)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    display_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(
        default=False, help_text="Django admin access (development only)."
    )
    must_change_password = models.BooleanField(default=False)
    activated_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(Q(kind="platform") & Q(school__isnull=True))
                | (~Q(kind="platform") & Q(school__isnull=False)),
                name="accounts_user_school_matches_kind",
            )
        ]

    def __str__(self):
        return self.display_name or self.login

    def save(self, *args, **kwargs):
        self.username = user_key(self.school_id, self.login)
        super().save(*args, **kwargs)


class UserSession(models.Model):
    """One signed-in browser (Phase 1 spec §5.6). Django's own session row holds the data."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    session_key = models.CharField(max_length=40, unique=True)
    user_agent = models.CharField(max_length=300, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField()
    idle_seconds = models.PositiveIntegerField()
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"{self.user} since {self.created_at:%Y-%m-%d %H:%M}"


class SmsCode(models.Model):
    """A 6-digit code sent by SMS or email: hashed, 10 minutes, 5 attempts, single use."""

    class Purpose(models.TextChoices):
        SIGN_IN = "sign_in", "Second factor"
        ACTIVATION = "activation", "Activation or password reset"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sms_codes")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_purpose_display()} code for {self.user}"
