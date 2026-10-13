"""The rest of the pupil portal (SMS spec §26): their own report cards and attendance, the
timetable, learning resources and quizzes. Everything is the signed-in pupil's own."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import Term
from apps.accounts.views import validated
from apps.core.exceptions import ApiError
from apps.finance.services import current_class
from apps.learning.attendance import attendance_summary
from apps.learning.models import LearningResource, Quiz, QuizAttempt
from apps.learning.quizzes import question_row, submit_attempt
from apps.learning.results import report_card
from apps.learning.teaching import (
    resource_row,
    resources_for_class,
    serve_resource,
    timetable_for_class,
)
from apps.pupil.views import PupilView


class TermsView(PupilView):
    def get(self, request):
        pupil = self.pupil()
        terms = Term.objects.filter(
            school=pupil.school, start_date__lte=timezone.localdate()
        ).order_by("-start_date")
        return Response([{"id": t.pk, "name": str(t)} for t in terms[:12]])


class ReportCardView(PupilView):
    def get(self, request):
        pupil = self.pupil()
        term = get_object_or_404(
            Term.objects.filter(school=pupil.school), pk=request.query_params.get("term") or 0
        )
        return Response(report_card(pupil, term, for_family=True))


class AttendanceView(PupilView):
    def get(self, request):
        return Response(attendance_summary(self.pupil()))


class TimetableView(PupilView):
    def get(self, request):
        pupil = self.pupil()
        school_class = current_class(pupil)
        today = timezone.localdate()
        term = Term.objects.filter(
            school=pupil.school, start_date__lte=today, end_date__gte=today
        ).first()
        return Response(timetable_for_class(school_class, term) if school_class and term else [])


class ResourcesView(PupilView):
    def get(self, request):
        school_class = current_class(self.pupil())
        if school_class is None:
            return Response([])
        return Response(
            [
                resource_row(item)
                for item in resources_for_class(school_class).order_by("-created_at")[:100]
            ]
        )


class ResourceFileView(PupilView):
    def get(self, request, pk):
        school_class = current_class(self.pupil())
        item = get_object_or_404(LearningResource, pk=pk)
        if (
            school_class is None
            or not resources_for_class(school_class).filter(pk=item.pk).exists()
        ):
            raise ApiError("not_found", "Not found.", 404)
        return serve_resource(item)


def open_quizzes(pupil):
    school_class = current_class(pupil)
    return Quiz.objects.filter(
        school_class=school_class, status__in=[Quiz.Status.PUBLISHED, Quiz.Status.CLOSED]
    )


class QuizzesView(PupilView):
    def get(self, request):
        pupil = self.pupil()
        attempts = {a.quiz_id: a for a in QuizAttempt.objects.filter(student=pupil)}
        return Response(
            [
                {
                    "id": quiz.pk,
                    "title": quiz.title,
                    "subject": quiz.subject.name,
                    "status": quiz.status,
                    "done": bool(attempts.get(quiz.pk) and attempts[quiz.pk].submitted_at),
                    "score": attempts[quiz.pk].score if quiz.pk in attempts else None,
                    "out_of": sum(q.marks for q in quiz.questions.all()),
                }
                for quiz in open_quizzes(pupil).select_related("subject").order_by("-created_at")
            ]
        )


class AnswersSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.CharField(max_length=1000, allow_blank=True))


class QuizView(PupilView):
    def quiz(self, pk) -> Quiz:
        return get_object_or_404(open_quizzes(self.pupil()), pk=pk)

    def get(self, request, pk):
        quiz = self.quiz(pk)
        attempt = QuizAttempt.objects.filter(
            quiz=quiz, student=self.pupil(), submitted_at__isnull=False
        ).first()
        questions = quiz.questions.order_by("order", "id")
        if attempt:
            answers = {a.question_id: a for a in attempt.answers.all()}
            return Response(
                {
                    "title": quiz.title,
                    "done": True,
                    "score": attempt.score,
                    "questions": [
                        {
                            **question_row(q, with_answer=False),
                            "your_answer": answers[q.pk].answer if q.pk in answers else "",
                            "correct": answers[q.pk].correct if q.pk in answers else False,
                            "answer": q.answer,
                        }
                        for q in questions
                    ],
                }
            )
        return Response(
            {
                "title": quiz.title,
                "done": False,
                "questions": [question_row(q, with_answer=False) for q in questions],
            }
        )

    def post(self, request, pk):
        quiz = self.quiz(pk)
        attempt = submit_attempt(
            quiz, self.pupil(), validated(AnswersSerializer, request)["answers"]
        )
        return Response({"score": attempt.score}, status=201)
