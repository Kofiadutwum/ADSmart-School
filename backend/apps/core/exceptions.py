"""Every API error has the same shape: {"code", "message", "fields"} (spec Â§10)."""

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.views import exception_handler

VALIDATION_MESSAGE = "Please check the highlighted fields."
THROTTLED_MESSAGE = "Too many attempts. Please try again later."


class ApiError(exceptions.APIException):
    """A user-facing error with its own code, e.g. ApiError("too_fast", "â€¦", 400)."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.status_code = status_code
        super().__init__(detail=message, code=code)


def _flatten(data, prefix: str = "") -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    if isinstance(data, dict):
        for key, value in data.items():
            name = "form" if key in ("non_field_errors", "detail") else str(key)
            fields.update(_flatten(value, f"{prefix}.{name}" if prefix else name))
    elif isinstance(data, list) and all(not isinstance(item, dict | list) for item in data):
        fields[prefix or "form"] = [str(item) for item in data]
    elif isinstance(data, list):
        for index, item in enumerate(data):
            fields.update(_flatten(item, f"{prefix}.{index}" if prefix else str(index)))
    else:
        fields[prefix or "form"] = [str(data)]
    return fields


def api_exception_handler(exc, context):
    # Mirror DRF's own conversion so the code below sees a DRF exception with a code.
    if isinstance(exc, Http404):
        exc = exceptions.NotFound(*exc.args)
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied(*exc.args)
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        body = {
            "code": "validation_error",
            "message": VALIDATION_MESSAGE,
            "fields": _flatten(response.data),
        }
    elif isinstance(exc, exceptions.Throttled):
        body = {"code": "throttled", "message": THROTTLED_MESSAGE, "fields": {}}
    else:
        detail = getattr(exc, "detail", None)
        code = getattr(detail, "code", None) or getattr(exc, "default_code", "error")
        message = str(detail) if detail else "Something went wrong."
        body = {"code": str(code), "message": message, "fields": {}}

    response.data = body
    return response
