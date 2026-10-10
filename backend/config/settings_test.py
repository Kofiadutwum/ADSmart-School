"""Test settings: fast hashing, in-memory email and cache, no real secrets."""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-not-used-anywhere-else-0123456789")

from config.settings import *  # noqa: E402,F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
PLATFORM_NAME = "SchoolSite"
PLATFORM_DOMAIN = "localhost"
PLATFORM_EMAIL = "hello@schoolsite.test"
SITE_URL_TEMPLATE = "http://{host}:3000"
ALLOWED_HOSTS = ["*"]
SMS_BACKEND = "apps.notifications.backends.MemoryBackend"
DEMO_LOGINS_ENABLED = False
