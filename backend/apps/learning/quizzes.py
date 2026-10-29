"""Quizzes (SMS spec §22): teachers write questions or have them drafted by AI, approve every
question before pupils see it, pupils answer once, choice and short answers are marked
automatically, and teachers see how the class did on each question.

AI drafting sends only the topic, level and difficulty: never a name or any pupil's work. With no
API key it answers 503 and the teacher writes the questions by hand.
"""

import json
import logging
import re
import urllib.error
import urllib.request
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Avg
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response

from apps.academics.models import TeachingAssignment
from apps.academics.structure import BANDS
from apps.accounts import roles
from apps.accounts.views import validated
from apps.core.exceptions import ApiError
from apps.core.resources import Resource
from apps.learning.attendance import own_staff
from apps.learning.models import Quiz, QuizAnswer, QuizAttempt, QuizQuestion
from apps.school_admin.views import SchoolView

logger = logging.getLogger(__name__)
LEADERS = (roles.ADMINISTRATOR, roles.HEAD_TEACHER)
TEACHERS = (roles.TEACHER,)


class QuizResource(Resource):
    model = Quiz
    fields = ("school_class", "subject", "title", "topic")
    shown = ("status", "created_at")
    labels = ("school_class", "subject", "teacher")
    read_roles = (*LEADERS, *TEACHERS)
    write_roles = TEACHERS
    filters = {"class": "school_class_id", "status": "status"}
    ordering = ("-created_at",)

    @classmethod
    def scope(cls, view, rows):
        if roles.has_role(view.request.user, *LEADERS):
            return rows
        return rows.filter(teacher__user=view.request.user)

    @classmethod
    def validate(cls, view, data, instance=None):
        staff = own_staff(view.request.user)
        school_class = data.get("school_class", getattr(instance, "school_class", None))
        subject = data.get("subject", getattr(instance, "subject", None))
        if not TeachingAssignment.objects.filter(
            staff=staff, school_class=school_class, subject=subject
        ).exists():
            raise serializers.ValidationError(
                {"subject": ["Choose a subject you teach in that class."]}
            )
        if instance is not None and instance.status != Quiz.Status.DRAFT:
            raise ApiError("published", "A published quiz can't change.")
        if instance is None:
            data["teacher"] = staff
        return data


def own_quiz(view, pk) -> Quiz:
    return get_object_or_404(QuizResource.queryset(view), pk=pk)


def question_row(question: QuizQuestion, with_answer: bool = True) -> dict:
    row = {
        "id": question.pk,
        "kind": question.kind,
        "text": question.text,
        "options": question.options,
        "marks": question.marks,
        "order": question.order,
    }
    if with_answer:
        row.update(answer=question.answer, approved=question.approved, from_ai=question.from_ai)
    return row


class QuestionSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=QuizQuestion.Kind.choices, default=QuizQuestion.Kind.CHOICE
    )
    text = serializers.CharField(max_length=1000)
    options = serializers.ListField(
        child=serializers.CharField(max_length=300), required=False, default=list, max_length=6
    )
    answer = serializers.CharField(max_length=300)
    marks = serializers.IntegerField(min_value=1, max_value=20, default=1)
    approved = serializers.BooleanField(default=True)

    def validate(self, data):
        if data["kind"] == QuizQuestion.Kind.CHOICE:
            if len(data["options"]) < 2 or data["answer"] not in data["options"]:
                raise serializers.ValidationError(
                    {"answer": ["Give at least two choices, one of them the answer."]}
                )
        return data


class QuestionsView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS)
    write_roles = TEACHERS

    def get(self, request, pk):
        quiz = own_quiz(self, pk)
        return Response([question_row(q) for q in quiz.questions.order_by("order", "id")])

    @transaction.atomic
    def post(self, request, pk):
        quiz = own_quiz(self, pk)
        if quiz.status != Quiz.Status.DRAFT:
            raise ApiError("published", "A published quiz can't change.")
        data = validated(QuestionSerializer, request)
        question = QuizQuestion.objects.create(
            school=self.school, quiz=quiz, order=quiz.questions.count(), **data
        )
        return Response(question_row(question), status=201)


class QuestionDetailView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS)
    write_roles = TEACHERS

    def question(self, pk) -> QuizQuestion:
        question = get_object_or_404(
            QuizQuestion.objects.for_school(self.school).select_related("quiz"), pk=pk
        )
        own_quiz(self, question.quiz_id)
        if question.quiz.status != Quiz.Status.DRAFT:
            raise ApiError("published", "A published quiz can't change.")
        return question

    @transaction.atomic
    def patch(self, request, pk):
        question = self.question(pk)
        serializer = QuestionSerializer(data={**question_row(question), **request.data})
        serializer.is_valid(raise_exception=True)
        for key, value in serializer.validated_data.items():
            setattr(question, key, value)
        question.save()
        return Response(question_row(question))

    @transaction.atomic
    def delete(self, request, pk):
        self.question(pk).delete()
        return Response(status=204)


class DraftSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=1, max_value=10, default=5)
    difficulty = serializers.ChoiceField(choices=["easy", "medium", "hard"], default="medium")


def _post_json(url: str, payload: dict, headers: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        # Cloudflare in front of Groq refuses Python's default agent (error 1010).
        headers={"content-type": "application/json", "User-Agent": "ADsmartschool/1.0", **headers},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - fixed hosts
        return json.loads(response.read())


def _draft_text(prompt: str) -> str:
    """The AI's reply: Groq's free tier when its key is set, otherwise Anthropic."""
    messages = [{"role": "user", "content": prompt}]
    if settings.GROQ_API_KEY:
        answer = _post_json(
            "https://api.groq.com/openai/v1/chat/completions",
            {"model": settings.GROQ_MODEL, "max_completion_tokens": 4000, "messages": messages},
            {"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
        )
        return answer["choices"][0]["message"]["content"] or ""
    answer = _post_json(
        "https://api.anthropic.com/v1/messages",
        {"model": settings.AI_MODEL, "max_tokens": 2000, "messages": messages},
        {"x-api-key": settings.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
    )
    return "".join(part.get("text", "") for part in answer.get("content", []))


def _reason(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"{exc.code}: {exc.read().decode(errors='replace')[:300]}"
    return str(exc)


def ask_ai(topic: str, level: str, difficulty: str, count: int) -> list[dict]:
    if not (settings.GROQ_API_KEY or settings.ANTHROPIC_API_KEY):
        raise ApiError("ai_off", "AI drafting isn't set up. Write the questions yourself.", 503)
    prompt = (
        f"Write {count} multiple-choice quiz questions for pupils in {level} in Ghana "
        f"on the topic: {topic}. Difficulty: {difficulty}. Use simple, clear English. "
        "Reply with JSON only: a list of objects with "
        '"text", "options" (4 strings) and "answer" (one of the options).'
    )
    try:
        text = _draft_text(prompt)
        found = re.search(r"\[.*\]", text, re.S)
        items = json.loads(found.group(0)) if found else []
    except (OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        logger.warning("AI drafting failed: %s", _reason(exc))  # the provider's reason, for staff
        raise ApiError(
            "ai_unavailable",
            "The AI couldn't draft questions just now. Try again or write them yourself.",
            503,
        ) from exc
    clean = []
    for item in items[:count]:
        options = (
            [str(o)[:300] for o in item.get("options", [])][:6] if isinstance(item, dict) else []
        )
        answer_text = str(item.get("answer", ""))[:300] if isinstance(item, dict) else ""
        if len(options) >= 2 and answer_text in options and item.get("text"):
            clean.append(
                {"text": str(item["text"])[:1000], "options": options, "answer": answer_text}
            )
    return clean


class DraftView(SchoolView):
    """Drafted questions arrive unapproved; the teacher checks each one."""

    read_roles = write_roles = TEACHERS

    @transaction.atomic
    def post(self, request, pk):
        quiz = own_quiz(self, pk)
        if quiz.status != Quiz.Status.DRAFT:
            raise ApiError("published", "A published quiz can't change.")
        data = validated(DraftSerializer, request)
        level = BANDS[quiz.school_class.band].name
        drafted = ask_ai(quiz.topic, level, data["difficulty"], data["count"])
        start = quiz.questions.count()
        created = [
            QuizQuestion.objects.create(
                school=self.school,
                quiz=quiz,
                kind=QuizQuestion.Kind.CHOICE,
                approved=False,
                from_ai=True,
                order=start + index,
                **item,
            )
            for index, item in enumerate(drafted)
        ]
        return Response([question_row(q) for q in created], status=201)


class QuizActionView(SchoolView):
    read_roles = write_roles = TEACHERS

    @transaction.atomic
    def post(self, request, pk, action):
        quiz = own_quiz(self, pk)
        if action == "publish":
            questions = quiz.questions.all()
            if not questions.exists():
                raise ApiError("empty", "Add at least one question first.")
            if questions.filter(approved=False).exists():
                raise ApiError("unchecked", "Check and approve every question before publishing.")
            quiz.status = Quiz.Status.PUBLISHED
        else:
            quiz.status = Quiz.Status.CLOSED
        quiz.save(update_fields=["status"])
        return Response(QuizResource.row(self, quiz))


def normalise(text: str) -> str:
    return " ".join(text.lower().split())


@transaction.atomic
def submit_attempt(quiz: Quiz, pupil, answers: dict[str, str]) -> QuizAttempt:
    """One attempt per pupil, marked at once."""
    if quiz.status != Quiz.Status.PUBLISHED:
        raise ApiError("closed", "This quiz isn't open.")
    attempt, created = QuizAttempt.objects.get_or_create(
        school=quiz.school, quiz=quiz, student=pupil
    )
    if attempt.submitted_at:
        raise ApiError("done", "You have already done this quiz.")
    score = Decimal(0)
    for question in quiz.questions.all():
        given = str(answers.get(str(question.pk), ""))[:1000]
        correct = normalise(given) == normalise(question.answer) if given else False
        awarded = Decimal(question.marks) if correct else Decimal(0)
        QuizAnswer.objects.create(
            school=quiz.school,
            attempt=attempt,
            question=question,
            answer=given,
            correct=correct,
            marks_awarded=awarded,
        )
        score += awarded
    attempt.score, attempt.submitted_at = score, timezone.now()
    attempt.save(update_fields=["score", "submitted_at"])
    return attempt


class QuizResultsView(SchoolView):
    read_roles = (*LEADERS, *TEACHERS)

    def get(self, request, pk):
        quiz = own_quiz(self, pk)
        attempts = quiz.attempts.filter(submitted_at__isnull=False).select_related("student")
        total = sum(q.marks for q in quiz.questions.all())
        questions = []
        for question in quiz.questions.order_by("order", "id"):
            answers = QuizAnswer.objects.filter(
                question=question, attempt__submitted_at__isnull=False
            )
            count = answers.count()
            questions.append(
                {
                    "id": question.pk,
                    "text": question.text,
                    "answered": count,
                    "correct_percent": round(answers.filter(correct=True).count() * 100 / count)
                    if count
                    else None,
                }
            )
        return Response(
            {
                "quiz": QuizResource.row(self, quiz),
                "out_of": total,
                "average": attempts.aggregate(a=Avg("score"))["a"],
                "attempts": [
                    {
                        "student": f"{a.student.first_name} {a.student.surname}",
                        "score": a.score,
                        "submitted_at": a.submitted_at,
                    }
                    for a in attempts
                ],
                "questions": questions,
            }
        )
