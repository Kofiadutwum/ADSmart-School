"""Role groups (Phase 1 spec §4.1, amendment §4) and who needs a second factor (§5.3)."""

ADMINISTRATOR = "Administrator"
PROPRIETOR = "Proprietor"
HEAD_TEACHER = "Head Teacher"
ACCOUNTANT = "Accountant"
TEACHER = "Teacher"
CAREGIVER = "Early Years Caregiver"
FRONT_DESK = "Front Desk Officer"
NURSE = "School Nurse"
BOOKSHOP = "Bookshop Keeper"
CANTEEN = "Canteen Officer"
TRANSPORT = "Transport Officer"
PARENT = "Parent"
STUDENT = "Student"
PLATFORM_ADMIN = "Platform Admin"  # the owner's team (amendment §4)

SCHOOL_ROLES = (
    ADMINISTRATOR,
    PROPRIETOR,
    HEAD_TEACHER,
    ACCOUNTANT,
    TEACHER,
    CAREGIVER,
    FRONT_DESK,
    NURSE,
    BOOKSHOP,
    CANTEEN,
    TRANSPORT,
    PARENT,
    STUDENT,
)
ALL_ROLES = (*SCHOOL_ROLES, PLATFORM_ADMIN)
SECOND_FACTOR_ROLES = frozenset({ADMINISTRATOR, HEAD_TEACHER, ACCOUNTANT, PROPRIETOR})


def roles_of(user) -> list[str]:
    return sorted(user.groups.values_list("name", flat=True))


def has_role(user, *names: str) -> bool:
    return bool(user.is_authenticated) and user.groups.filter(name__in=names).exists()


def needs_second_factor(user) -> bool:
    return user.kind == "platform" or has_role(user, *SECOND_FACTOR_ROLES)
