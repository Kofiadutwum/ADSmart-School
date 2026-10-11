"""Plan 6A Task 4: Vercel's daily cron sends scheduled articles' emails."""

import pytest

from apps.platform_content import articles

pytestmark = pytest.mark.django_db
URL = "/api/cron/article-emails"


def test_the_cron_sends_due_emails_with_the_secret(api, settings, monkeypatch):
    settings.CRON_SECRET = "s3cret"
    monkeypatch.setattr(articles, "email_due_articles", lambda: 4)

    response = api.get(URL, HTTP_AUTHORIZATION="Bearer s3cret")

    assert response.status_code == 200 and response.json() == {"sent": 4}


@pytest.mark.parametrize(
    ("secret", "given"), [("s3cret", ""), ("s3cret", "Bearer guess"), ("", "Bearer ")]
)
def test_the_cron_refuses_anyone_without_the_secret(api, settings, monkeypatch, secret, given):
    settings.CRON_SECRET = secret
    monkeypatch.setattr(articles, "email_due_articles", lambda: pytest.fail("must not send"))

    assert api.get(URL, HTTP_AUTHORIZATION=given).status_code == 401
