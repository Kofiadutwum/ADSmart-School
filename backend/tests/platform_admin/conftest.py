import itertools

import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.accounts.models import User

_numbers = itertools.count(1)


def make_platform_member(login: str, *role_names: str, **fields) -> User:
    user = User.objects.create_user(login, kind=User.Kind.PLATFORM, **fields)
    user.groups.add(*Group.objects.filter(name__in=role_names))
    return user


def signed_in(user: User) -> APIClient:
    client = APIClient(HTTP_HOST="admin.localhost")
    client.force_login(user)
    return client


@pytest.fixture
def ops(db):
    return make_platform_member("ops", roles.PLATFORM_OWNER, display_name="Kojo Ops")


@pytest.fixture
def console(ops):
    """The Owner of the platform team, signed in at the admin address."""
    return signed_in(ops)


@pytest.fixture
def member_client(db):
    """A platform team member with only the given roles, signed in at the admin address."""

    def make(*role_names: str) -> APIClient:
        return signed_in(make_platform_member(f"member{next(_numbers)}", *role_names))

    return make
