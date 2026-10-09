"""Settings for the AD Smart School backend.

Every value that differs between environments comes from environment
variables; backend/.env.example lists them all.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
if (BASE_DIR / ".env").exists():
    env.read_env(str(BASE_DIR / ".env"))

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
# Any host may reach Django because only Next.js (on the same machine) can: each request's
# host is matched to a school by apps.school.hosts, and unknown hosts get 404 (amendment §2.4).
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])
USE_X_FORWARDED_HOST = True

PLATFORM_NAME = env("PLATFORM_NAME", default="SchoolSite")
PLATFORM_DOMAIN = env("PLATFORM_DOMAIN", default="localhost")
PLATFORM_EMAIL = env("PLATFORM_EMAIL", default="")
# How a school's address is written in links: development "http://{host}:3000",
# production "https://{host}".
SITE_URL_TEMPLATE = env("SITE_URL_TEMPLATE", default="http://{host}:3000")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.accounts",
    "apps.audit",
    "apps.notifications",
    "apps.core",
    "apps.school",
    "apps.consent",
    "apps.website",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.middleware.SessionActivityMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Plan 1 runs on SQLite while DATABASE_URL is unset; Plan 2 switches to PostgreSQL.
if env("DATABASE_URL", default=""):
    DATABASES = {"default": env.db("DATABASE_URL")}
else:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

# Spec §5.4: Argon2; PBKDF2 stays listed so any older hashes still verify.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

# Shared by every process without extra services. Create with: manage.py createcachetable
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "Africa/Accra"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("DJANGO_MEDIA_ROOT", default=str(BASE_DIR / "media")))

# API paths have no trailing slash; Next.js forwards them unchanged.
APPEND_SLASH = False
# The browser's Origin is checked against the forwarded host (USE_X_FORWARDED_HOST), so every
# school's own address passes CSRF checks without listing them here.
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"

# Django 6.1 mailers (EMAIL_BACKEND is deprecated). Tests swap every mailer for locmem.
MAILERS = {
    "default": {
        "BACKEND": env(
            "DJANGO_EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
        ),
    }
}
DEFAULT_FROM_EMAIL = env(
    "DJANGO_DEFAULT_FROM_EMAIL", default="AD Smart School <no-reply@localhost>"
)

# SMS (Phase 1 spec §3.7). Development logs codes to the console (and SMS_FILE_PATH, if set).
SMS_BACKEND = env("SMS_BACKEND", default="apps.notifications.backends.ConsoleBackend")
SMS_FILE_PATH = env("SMS_FILE_PATH", default="")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    # Proxies that append to X-Forwarded-For. Next.js passes the header through without adding
    # to it, so this stays 1 in production (Caddy adds the client IP). Raising it would let
    # visitors forge their IP and dodge the enquiry limits (see test_ip_throttle_uses_...).
    "NUM_PROXIES": env.int("DJANGO_NUM_PROXIES", default=1),
    # Generous per-IP limits: many Ghanaian mobile users share one public IP (carrier NAT).
    "DEFAULT_THROTTLE_RATES": {
        "enquiry_ip": "30/hour",
        "enquiry_token": "60/hour",
        "lead_ip": "30/hour",
        "sms_code_ip": "10/hour",
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
