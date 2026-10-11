"""Business tools spec §4 (visitor counting) and §5.7 (the website refreshes straight away)."""

import contextlib
import json
import urllib.error

import pytest
from django.utils import timezone

from apps.platform_content import refresh
from apps.platform_content.models import PageVisit

pytestmark = pytest.mark.django_db
VISIT = "/api/public/platform/visit"
PHONE = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"


def visit(client, path, agent=PHONE):
    return client.post(VISIT, {"path": path}, format="json", HTTP_USER_AGENT=agent)


def counts() -> dict:
    return dict(PageVisit.objects.values_list("path", "count"))


def test_visits_are_counted_per_page_and_day(visitor):
    for path in ("/", "/", "/articles", "/articles/collect-fees-on-time-kindly"):
        assert visit(visitor, path).status_code == 204

    assert counts() == {"/": 2, "/articles": 1, "/articles/collect-fees-on-time-kindly": 1}
    assert set(PageVisit.objects.values_list("day", flat=True)) == {timezone.localdate()}


def test_robots_other_hosts_and_unknown_paths_are_ignored(visitor, api):
    ignored = [
        visit(visitor, "/", agent="Googlebot/2.1 (+http://www.google.com/bot.html)"),
        visit(visitor, "/", agent="Mozilla/5.0 HeadlessChrome/120"),
        visit(visitor, "/", agent=""),
        visit(api, "/"),
        visit(visitor, "articles"),
        visit(visitor, "/wp-admin"),
        visit(visitor, "/articles/" + "a" * 250),
        visitor.post(VISIT, {}, format="json", HTTP_USER_AGENT=PHONE),
        visitor.post(VISIT, "not json", content_type="application/json", HTTP_USER_AGENT=PHONE),
    ]

    assert [response.status_code for response in ignored] == [204] * len(ignored)
    assert counts() == {}


def test_query_strings_and_fragments_are_dropped(visitor):
    visit(visitor, "/articles?kind=tip#latest")

    assert counts() == {"/articles": 1}


@pytest.fixture
def sent(monkeypatch):
    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request)
        return contextlib.nullcontext()

    monkeypatch.setattr(refresh.urllib.request, "urlopen", fake_urlopen)
    return requests


def test_refresh_posts_the_tag_with_the_secret(settings, sent, django_capture_on_commit_callbacks):
    settings.REVALIDATE_SECRET = "s3cret"
    settings.FRONTEND_ORIGIN = "http://127.0.0.1:3100"

    with django_capture_on_commit_callbacks(execute=True):
        refresh.refresh_platform_site()

    [request] = sent
    assert request.full_url == "http://127.0.0.1:3100/api/revalidate"
    assert request.get_header("X-revalidate-secret") == "s3cret"
    assert json.loads(request.data) == {"tag": "platform"}


def test_refresh_is_skipped_without_a_secret(settings, sent, django_capture_on_commit_callbacks):
    settings.REVALIDATE_SECRET = ""

    with django_capture_on_commit_callbacks(execute=True):
        refresh.refresh_platform_site()

    assert sent == []


def test_a_failed_refresh_is_only_logged(
    settings, monkeypatch, django_capture_on_commit_callbacks, caplog
):
    settings.REVALIDATE_SECRET = "s3cret"

    def down(request, timeout):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(refresh.urllib.request, "urlopen", down)
    with django_capture_on_commit_callbacks(execute=True):
        refresh.refresh_platform_site()

    assert "Couldn't refresh the platform website" in caplog.text
