"""The school bus (SMS spec §15): crew, buses, routes and stops, who rides where, stop changes the
parent confirms, and the boarding log, which texts the family as their child boards or is
dropped off."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts import roles
from apps.accounts.views import validated
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.finance.services import text_family
from apps.notifications.sms import Purpose
from apps.people.models import Student
from apps.school_admin.views import SchoolView
from apps.transport.models import (
    BoardingLog,
    Bus,
    BusAssignment,
    Crew,
    Route,
    Stop,
    StopChangeRequest,
)

READ = (
    roles.TRANSPORT,
    roles.ADMINISTRATOR,
    roles.HEAD_TEACHER,
    roles.ACCOUNTANT,
    roles.PROPRIETOR,
)
WRITE = (roles.TRANSPORT, roles.ADMINISTRATOR)


class TransportResource(Resource):
    read_roles, write_roles = READ, WRITE


class CrewResource(TransportResource):
    model = Crew
    fields = ("name", "phone", "role", "licence_number", "licence_expiry")


class BusResource(TransportResource):
    model = Bus
    fields = ("name", "plate", "capacity", "insurance_expiry", "driver", "attendant")
    labels = ("driver", "attendant")


class RouteResource(TransportResource):
    model = Route
    fields = ("name", "bus", "daily_fee")
    labels = ("bus",)


class StopResource(TransportResource):
    model = Stop
    fields = ("route", "name", "order", "pickup_time")
    labels = ("route",)
    filters = {"route": "route_id"}


class AssignmentResource(TransportResource):
    model = BusAssignment
    fields = ("student", "route", "stop", "active")
    shown = ("started_on",)
    labels = ("student", "route", "stop")
    filters = {"route": "route_id", "student": "student_id"}

    @classmethod
    def validate(cls, view, data, instance=None):
        route = data.get("route", getattr(instance, "route", None))
        stop = data.get("stop", getattr(instance, "stop", None))
        if route and stop and stop.route_id != route.pk:
            raise serializers.ValidationError({"stop": ["Choose a stop on this route."]})
        if route and route.bus and data.get("active", True):
            riders = BusAssignment.objects.filter(route=route, active=True)
            if instance:
                riders = riders.exclude(pk=instance.pk)
            if riders.count() >= route.bus.capacity:
                raise ApiError("bus_full", "That bus is full.")
        return data


class StopChangeResource(TransportResource):
    """The office proposes a new stop; it takes effect only when the parent confirms it."""

    model = StopChangeRequest
    fields = ("student", "new_stop")
    shown = ("status", "decided_at", "created_at")
    labels = ("student", "new_stop")
    stamp_user = "requested_by"
    deletable = False

    @classmethod
    def validate(cls, view, data, instance=None):
        if instance is not None:
            raise ApiError("not_allowed", "Only the parent can answer a stop change.")
        return data


@transaction.atomic
def answer_stop_change(change: StopChangeRequest, confirm: bool) -> StopChangeRequest:
    if change.status != StopChangeRequest.Status.WAITING:
        raise ApiError("decided", "This change has already been answered.")
    change.status = (
        StopChangeRequest.Status.CONFIRMED if confirm else StopChangeRequest.Status.DECLINED
    )
    change.decided_at = timezone.now()
    change.save()
    if confirm:
        BusAssignment.objects.filter(student=change.student, active=True).update(active=False)
        BusAssignment.objects.create(
            school=change.school,
            student=change.student,
            route=change.new_stop.route,
            stop=change.new_stop,
        )
    return change


class BoardingSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    kind = serializers.ChoiceField(choices=BoardingLog.Kind.choices)


class BoardingView(SchoolView):
    read_roles = READ
    write_roles = (roles.TRANSPORT,)

    def get(self, request):
        logs = BoardingLog.objects.for_school(self.school).select_related("student", "route")
        date = request.query_params.get("date")
        logs = logs.filter(at__date=date) if date else logs.filter(at__date=timezone.localdate())
        return Response(
            [
                {
                    "id": log.pk,
                    "student": f"{log.student.first_name} {log.student.surname}",
                    "route": log.route.name,
                    "kind": log.kind,
                    "at": log.at,
                }
                for log in logs[:500]
            ]
        )

    @transaction.atomic
    def post(self, request):
        data = validated(BoardingSerializer, request)
        pupil = get_object_or_404(Student.objects.for_school(self.school), pk=data["student"])
        assignment = (
            BusAssignment.objects.filter(student=pupil, active=True).select_related("route").first()
        )
        if assignment is None:
            raise ApiError("no_route", f"{pupil.first_name} isn't on a bus route.")
        log = BoardingLog.objects.create(
            school=self.school,
            student=pupil,
            route=assignment.route,
            kind=data["kind"],
            recorded_by=request.user,
        )
        event = "boarded" if log.kind == BoardingLog.Kind.BOARDED else "was dropped off from"
        transaction.on_commit(
            lambda: text_family(
                pupil,
                "BUS",
                Purpose.ALERT,
                event=event,
                time=timezone.localtime(log.at).strftime("%H:%M"),
            )
        )
        return Response({"id": log.pk, "kind": log.kind, "at": log.at}, status=201)


class RouteRidersView(SchoolView):
    """A route's riders in stop order, for the attendant's tick list."""

    read_roles = READ

    def get(self, request, pk):
        route = get_object_or_404(Route.objects.for_school(self.school), pk=pk)
        riders = (
            BusAssignment.objects.filter(route=route, active=True)
            .select_related("student", "stop")
            .order_by("stop__order", "student__surname")
        )
        return Response(
            {
                "route": route.name,
                "riders": [
                    {
                        "student": row.student_id,
                        "name": f"{row.student.first_name} {row.student.surname}",
                        "stop": row.stop.name,
                        "pickup_time": row.stop.pickup_time,
                    }
                    for row in riders
                ],
            }
        )
