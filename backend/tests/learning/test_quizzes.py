"""Quizzes (SMS spec §22): questions approved before publishing, one attempt, automatic marking,
and AI drafting that is off without a key and never sends pupils' details."""

import pytest

from apps.academics.models import Subject, TeachingAssignment
from apps.learning import quizzes
from apps.learning.models import Quiz, QuizQuestion
from apps.people.services import enrol
from tests.records import make_class, make_staff, make_student, make_term, make_year

pytestmark = pytest.mark.django_db


@pytest.fixture
def quiz(school):
    year = make_year(school)
    term = make_term(year)
    klass = make_class(year, "basic_5")
    science = Subject.objects.create(
        school=school, name="Science", code="SCI", bands=["upper_primary"]
    )
    teacher = make_staff(school, username="science.teacher")
    TeachingAssignment.objects.create(
        school=school, staff=teacher, school_class=klass, subject=science, term=term
    )
    quiz = Quiz.objects.create(
        school=school,
        teacher=teacher,
        school_class=klass,
        subject=science,
        title="Plants",
        topic="Photosynthesis",
    )
    QuizQuestion.objects.create(
        school=school,
        quiz=quiz,
        text="Plants need?",
        options=["Light", "Sand"],
        answer="Light",
        marks=2,
        approved=True,
    )
    QuizQuestion.objects.create(
        school=school,
        quiz=quiz,
        kind="SHORT",
        text="Green pigment?",
        answer="Chlorophyll",
        approved=True,
    )
    pupil = make_student(school)
    enrol(pupil, klass, start_date=term.start_date)
    return quiz, pupil


def test_answers_are_marked_automatically_and_only_once(school, quiz):
    quiz, pupil = quiz
    quiz.status = Quiz.Status.PUBLISHED
    quiz.save()
    first, second = quiz.questions.order_by("id")
    attempt = quizzes.submit_attempt(
        quiz, pupil, {str(first.pk): "Light", str(second.pk): "  chlorophyll "}
    )
    assert attempt.score == 3
    with pytest.raises(Exception, match="already done"):
        quizzes.submit_attempt(quiz, pupil, {})


def test_a_quiz_with_unchecked_questions_cant_be_published(school, quiz):
    quiz, _ = quiz
    QuizQuestion.objects.create(
        school=school, quiz=quiz, text="Drafted", options=["a", "b"], answer="a", from_ai=True
    )
    from rest_framework.test import APIClient

    teacher = APIClient(HTTP_HOST="adsmart.localhost")
    teacher.force_login(quiz.teacher.user)
    assert (
        teacher.post(f"/api/school/learning/quizzes/{quiz.pk}/publish").json()["code"]
        == "unchecked"
    )


def test_ai_drafting_is_off_without_a_key(school, quiz, settings):
    settings.ANTHROPIC_API_KEY = ""
    with pytest.raises(Exception, match="isn't set up"):
        quizzes.ask_ai("Photosynthesis", "Basic 4–6", "easy", 3)


def test_ai_drafting_sends_only_the_topic_level_and_difficulty(school, quiz, settings, monkeypatch):
    settings.ANTHROPIC_API_KEY = "test-key"
    sent = {}

    class Answer:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            text = '[{"text": "Q?", "options": ["A", "B"], "answer": "A"}]'
            return (
                '{"content": [{"type": "text", "text": %s}]}' % __import__("json").dumps(text)
            ).encode()

    def fake_open(request, timeout=0):
        sent["body"] = request.data.decode()
        return Answer()

    monkeypatch.setattr(quizzes.urllib.request, "urlopen", fake_open)
    drafted = quizzes.ask_ai("Photosynthesis", "Basic 4–6", "easy", 1)
    assert drafted == [{"text": "Q?", "options": ["A", "B"], "answer": "A"}]
    _, pupil = quiz
    assert pupil.first_name not in sent["body"] and pupil.surname not in sent["body"]
