import pytest
from rest_framework.test import APIClient

from tests.records import make_staff


@pytest.fixture
def client_for(school):
    """A client signed in at the school's address as a new staff member holding ``roles``."""
    count = iter(range(1, 1000))

    def make(*roles, owner=None):
        staff = make_staff(
            owner or school, username=f"user{next(count)}", roles_held=list(roles or ["Teacher"])
        )
        client = APIClient(HTTP_HOST=f"{(owner or school).slug}.localhost")
        client.force_login(staff.user)
        client.staff = staff
        return client

    return make


@pytest.fixture
def admin(client_for):
    return client_for("Administrator")


@pytest.fixture
def head(client_for):
    return client_for("Head Teacher")
