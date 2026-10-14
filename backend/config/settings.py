"""Settings for the ADsmartschool backend.

Every value that differs between environments comes from environment
variables; backend/.env.example lists them all.
"""

import os
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

from config.mail import mailers

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

PLATFORM_NAME = env("PLATFORM_NAME", default="ADsmartschool")
PLATFORM_DOMAIN = env("PLATFORM_DOMAIN", default="localhost")
# Until the platform has its own domain there is no admin.<domain>: name another address for
# the admin area, e.g. a second Vercel address (Plan 6A). Empty once the domain is in place.
ADMIN_HOST = env("ADMIN_HOST", default="").lower()
PLATFORM_EMAIL = env("PLATFORM_EMAIL", default="kofiadutwumjnr881@gmail.com")
PLATFORM_PHONE = env("PLATFORM_PHONE", default="+233545875881")
# The Next.js server, which Django asks to rebuild the platform website after content changes
# (business tools spec §5.7). Without a secret nothing is sent; pages catch up within 5 minutes.
FRONTEND_ORIGIN = env("FRONTEND_ORIGIN", default="http://127.0.0.1:3000")
REVALIDATE_SECRET = env("REVALIDATE_SECRET", default="")
# Next.js signs the visitor's address and IP with this (apps.core.forwarding, Plan 6A). Leave
# empty in development, where Next.js and Django share one machine.
PROXY_SECRET = env("PROXY_SECRET", default="")
# Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" (Plan 6A).
CRON_SECRET = env("CRON_SECRET", default="")
# Uploads go through Vercel Functions, which accept at most 4.5 MB: set 4 there (Plan 6A).
PHOTO_MAX_MB = env.int("PHOTO_MAX_MB", default=10)
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
if not DEBUG:  # behind HTTPS in production (Vercel or Caddy)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
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
    "apps.academics",
    "apps.people",
    "apps.platform_admin",
    "apps.platform_content",
    "apps.school_admin",
    "apps.family",
    "apps.pupil",
    "apps.support",
    "apps.finance",
    "apps.transport",
    "apps.billing",
    "apps.learning",
    "apps.care",
    "apps.shop",
]

MIDDLEWARE = [
    "apps.core.request_id.RequestIdMiddleware",
    "apps.core.forwarding.SignedForwardingMiddleware",
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
    # A pooled address (Neon's "-pooler") shares connections between requests, so it cannot
    # keep server-side cursors open (Django docs: transaction pooling).
    if "-pooler." in env("DATABASE_URL"):
        DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
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
# Uploaded photos live on Cloudinary when CLOUDINARY_URL is set (Plan 6A), else in MEDIA_ROOT.
STORAGES = {
    "default": {
        "BACKEND": "apps.core.cloudinary_storage.CloudinaryStorage"
        if env("CLOUDINARY_URL", default="")
        else "django.core.files.storage.FileSystemStorage"
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# API paths have no trailing slash; Next.js forwards them unchanged.
APPEND_SLASH = False
# The browser's Origin is checked against the forwarded host (USE_X_FORWARDED_HOST), so every
# school's own address passes CSRF checks without listing them here.
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"

# Django 6.1 mailers (EMAIL_BACKEND is deprecated). Tests swap every mailer for locmem.
MAILERS = mailers(os.environ)
DEFAULT_FROM_EMAIL = env("DJANGO_DEFAULT_FROM_EMAIL", default="ADsmartschool <no-reply@localhost>")

# SMS (Phase 1 spec §3.7). Development logs codes to the console (and SMS_FILE_PATH, if set).
# Stage 10: Arkesel is the provider once its key is set (SMS spec §24, §32).
SMS_API_KEY = env("SMS_API_KEY", default="")
SMS_SENDER_ID = env("SMS_SENDER_ID", default="ADsmartsch")
SMS_WEBHOOK_TOKEN = env("SMS_WEBHOOK_TOKEN", default="")
SMS_LOW_CREDIT = env.int("SMS_LOW_CREDIT", default=50)
_SMS_DEFAULT = (
    "ConsoleBackend" if DEBUG else ("ArkeselBackend" if SMS_API_KEY else "UnavailableBackend")
)
SMS_BACKEND = env("SMS_BACKEND", default="apps.notifications.backends." + _SMS_DEFAULT)
SMS_FILE_PATH = env("SMS_FILE_PATH", default="")

# Stage 14: Paystack (MoMo and card) and USSD. Empty keys: "not set up yet".
PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY", default="")
PAYSTACK_FEE_BEARER = env("PAYSTACK_FEE_BEARER", default="school")  # or "payer"
USSD_PROVIDER = env("USSD_PROVIDER", default="simulator")
USSD_SECRET = env("USSD_SECRET", default="")

# Stage 22: AI-assisted questions. Only topic, level and difficulty are ever sent.
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", default="")
AI_MODEL = env("AI_MODEL", default="claude-sonnet-5-5")

# Phase 1 spec §9: seed_demo adds one sign-in per role for trying the system. Development only.
DEMO_LOGINS_ENABLED = env.bool("DEMO_LOGINS_ENABLED", default=False)
if DEMO_LOGINS_ENABLED and not DEBUG:
    raise ImproperlyConfigured("DEMO_LOGINS_ENABLED is for development only (Phase 1 spec §9).")

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
        "tips_ip": "30/hour",
        "visit_ip": "600/hour",
        "sms_code_ip": "10/hour",
        "pay_ip": "120/hour",
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
