"""Simple registers as list / add / edit / remove APIs, each described in a few lines.

School registers are always filtered to the signed-in user's own school, and every related
record a request names must belong to that school too (amendment §3.2). Writes are audited;
a restricted register logs every read (VIEWED_RESTRICTED, SMS spec §37).
"""

from django.db import transaction
from django.db.models import ProtectedError
from django.shortcuts import get_object_or_404
from django.urls import path
from rest_framework import serializers
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.services import record
from apps.core.exceptions import ApiError


class Resource:
    """Subclass and set the class attributes; `urls()` gives the two routes."""

    model = None
    fields: tuple[str, ...] = ()  # editable
    shown: tuple[str, ...] = ()  # read-only extras in each row
    labels: tuple[str, ...] = ()  # related fields whose name is added as `<field>_label`
    school_scoped = True
    read_roles: tuple[str, ...] = ()
    write_roles: tuple[str, ...] = ()
    deletable = True
    restricted = False
    stamp_user: str | None = None  # set to the signed-in user when a record is added
    filters: dict[str, str] = {}  # query parameter -> lookup
    ordering: tuple[str, ...] | None = None
    limit = 500  # shortcut: the newest 500 rows; add paging when a register outgrows it

    @classmethod
    def queryset(cls, view):
        rows = cls.model.objects.all()
        if cls.school_scoped:
            rows = rows.filter(school=view.school)
        for param, lookup in cls.filters.items():
            value = view.request.query_params.get(param, "").strip()
            if value:
                rows = rows.filter(**{lookup: value})
        rows = cls.scope(view, rows)
        return rows.order_by(*cls.ordering) if cls.ordering else rows

    @classmethod
    def scope(cls, view, rows):
        """Narrow further for a role (a teacher's own classes, say)."""
        return rows

    @classmethod
    def validate(cls, view, data: dict, instance=None) -> dict:
        return data

    @classmethod
    def after_save(cls, view, instance, created: bool) -> None:
        return None

    @classmethod
    def serializer(cls, view, *args, **kwargs):
        meta = type("Meta", (), {"model": cls.model, "fields": ("id", *cls.fields, *cls.shown)})
        attrs = {"Meta": meta}
        for name in cls.shown:
            attrs[name] = serializers.ReadOnlyField()
        serializer_class = type(f"{cls.__name__}Serializer", (serializers.ModelSerializer,), attrs)
        serializer = serializer_class(*args, **kwargs)
        school = getattr(view, "school", None)
        if cls.school_scoped and school is not None:
            for field in serializer.fields.values():
                related = getattr(field, "queryset", None)
                if related is None:
                    continue
                model = related.model
                if model is User or any(f.name == "school" for f in model._meta.fields):
                    field.queryset = related.filter(school=school)
        return serializer

    @classmethod
    def row(cls, view, instance) -> dict:
        data = dict(cls.serializer(view, instance).data)
        for name in cls.labels:
            value = getattr(instance, name, None)
            data[f"{name}_label"] = str(value) if value is not None else ""
        return data

    @classmethod
    def build(cls, base):
        resource = cls

        class ListView(base):
            read_roles = resource.read_roles
            write_roles = resource.write_roles

            def get(self, request):
                rows = list(resource.queryset(self)[: resource.limit])
                if resource.restricted:
                    record(
                        AuditLog.Action.VIEWED_RESTRICTED,
                        actor=request.user,
                        entity_type=resource.model._meta.label_lower,
                        entity_id="list",
                        request=request,
                        school=getattr(self, "school", None),
                    )
                return Response([resource.row(self, row) for row in rows])

            @transaction.atomic
            def post(self, request):
                serializer = resource.serializer(self, data=request.data)
                serializer.is_valid(raise_exception=True)
                data = resource.validate(self, dict(serializer.validated_data))
                extra = {"school": self.school} if resource.school_scoped else {}
                if resource.stamp_user:
                    extra[resource.stamp_user] = request.user
                instance = serializer.save(**{**data, **extra})
                resource.after_save(self, instance, True)
                record(
                    AuditLog.Action.CREATED,
                    actor=request.user,
                    entity=instance,
                    new={"record": str(instance)[:200]},
                    request=request,
                )
                return Response(resource.row(self, instance), status=201)

        class DetailView(base):
            read_roles = resource.read_roles
            write_roles = resource.write_roles

            def instance(self, pk):
                return get_object_or_404(resource.queryset(self), pk=pk)

            def get(self, request, pk):
                instance = self.instance(pk)
                if resource.restricted:
                    record(
                        AuditLog.Action.VIEWED_RESTRICTED,
                        actor=request.user,
                        entity=instance,
                        request=request,
                    )
                return Response(resource.row(self, instance))

            @transaction.atomic
            def patch(self, request, pk):
                instance = self.instance(pk)
                serializer = resource.serializer(self, instance, data=request.data, partial=True)
                serializer.is_valid(raise_exception=True)
                data = resource.validate(self, dict(serializer.validated_data), instance)
                old = {
                    key: str(getattr(instance, key))
                    for key in data
                    if getattr(instance, key) != data[key]
                }
                instance = serializer.save(**data)
                resource.after_save(self, instance, False)
                if old:
                    record(
                        AuditLog.Action.UPDATED,
                        actor=request.user,
                        entity=instance,
                        old=old,
                        new={key: str(getattr(instance, key)) for key in old},
                        request=request,
                    )
                return Response(resource.row(self, instance))

            @transaction.atomic
            def delete(self, request, pk):
                if not resource.deletable:
                    raise ApiError("not_deletable", "This record can't be removed.", 405)
                instance = self.instance(pk)
                record(
                    AuditLog.Action.DELETED,
                    actor=request.user,
                    entity=instance,
                    old={"record": str(instance)[:200]},
                    request=request,
                )
                try:
                    instance.delete()
                except ProtectedError as exc:
                    raise ApiError(
                        "in_use", "Other records still use this one; change them first."
                    ) from exc
                return Response(status=204)

        return ListView, DetailView

    @classmethod
    def urls(cls, prefix: str, base) -> list:
        list_view, detail_view = cls.build(base)
        return [
            path(prefix, list_view.as_view()),
            path(f"{prefix}/<int:pk>", detail_view.as_view()),
        ]
