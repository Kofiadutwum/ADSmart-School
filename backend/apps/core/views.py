from django.http import JsonResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


def csrf_failure(request, reason=""):
    """Django's CSRF rejection in the API's error shape (Phase 1 spec §10)."""
    message = "Your session has expired. Refresh the page and try again."
    return JsonResponse({"code": "csrf_failed", "message": message, "fields": {}}, status=403)
