import pytest
from django.contrib.auth.models import Group

from apps.accounts.models import User
from tests.helpers import PASSWORD

_DEFAULT = object()


@pytest.fixture
def make_user(school):
    default_school = school

    def make(
        login="k.mensah", *, kind="staff", school=_DEFAULT, role=None, password=PASSWORD, **fields
    ):
        owner = default_school if school is _DEFAULT else school
        user = User.objects.create_user(login, kind=kind, school=owner, password=password, **fields)
        if role:
            user.groups.add(Group.objects.get(name=role))
        return user

    return make
