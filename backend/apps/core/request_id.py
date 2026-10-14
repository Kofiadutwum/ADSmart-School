"""A short ID on every request (SMS spec §38): sent back as X-Request-ID and shown on the error
page, so a person reporting a problem can quote it and the team can find it in the logs."""

import logging
import re
import uuid

from django.http import JsonResponse

log = logging.getLogger(__name__)
SAFE = re.compile(r"^[A-Za-z0-9:_-]{1,64}$")


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        given = request.headers.get("X-Request-ID", "")
        request.id = given if SAFE.match(given) else uuid.uuid4().hex[:12]
        response = self.get_response(request)
        response["X-Request-ID"] = request.id
        return response


def server_error(request, *args, **kwargs):
    """Django's 500 handler: a plain message and the request ID, never the error itself."""
    request_id = getattr(request, "id", "")
    log.error("Server error, request %s", request_id)
    return JsonResponse(
        {
            "code": "server_error",
            "message": "Something went wrong on our side. Please try again.",
            "request_id": request_id,
            "fields": {},
        },
        status=500,
    )
