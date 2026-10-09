from django.http import Http404
from rest_framework import exceptions

from apps.core.exceptions import ApiError, api_exception_handler


def test_validation_errors_are_flattened_per_field():
    exc = exceptions.ValidationError(
        {"phone": ["Enter a valid Ghana mobile number."], "non_field_errors": ["Bad request."]}
    )

    response = api_exception_handler(exc, {})

    assert response.status_code == 400
    assert response.data == {
        "code": "validation_error",
        "message": "Please check the highlighted fields.",
        "fields": {"phone": ["Enter a valid Ghana mobile number."], "form": ["Bad request."]},
    }


def test_nested_validation_errors_use_dotted_names():
    exc = exceptions.ValidationError({"guardian": {"phone": ["Required."]}})

    assert api_exception_handler(exc, {}).data["fields"] == {"guardian.phone": ["Required."]}


def test_throttled_requests_get_a_friendly_message():
    response = api_exception_handler(exceptions.Throttled(wait=3600), {})

    assert response.status_code == 429
    assert response.data == {
        "code": "throttled",
        "message": "Too many attempts. Please try again later.",
        "fields": {},
    }


def test_api_error_carries_its_code_message_and_status():
    response = api_exception_handler(ApiError("too_fast", "Please slow down.", 400), {})

    assert response.status_code == 400
    assert response.data == {"code": "too_fast", "message": "Please slow down.", "fields": {}}


def test_not_found_uses_the_same_shape():
    response = api_exception_handler(Http404(), {})

    assert response.status_code == 404
    assert response.data["code"] == "not_found"
    assert response.data["fields"] == {}


def test_unexpected_exceptions_are_left_to_django():
    assert api_exception_handler(ValueError("boom"), {}) is None
