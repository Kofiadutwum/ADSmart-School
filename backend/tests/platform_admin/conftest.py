import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User


@pytest.fixture
def ops(db):
    return User.objects.create_user("ops", kind=User.Kind.PLATFORM, display_name="Kojo Ops")


@pytest.fixture
def console(ops):
    """A member of the platform team, signed in at the admin address."""
    client = APIClient(HTTP_HOST="admin.localhost")
    client.force_login(ops)
    return client
