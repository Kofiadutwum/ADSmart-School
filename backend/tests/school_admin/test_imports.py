import csv
import io
from datetime import date, datetime

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from apps.accounts import roles
from apps.people.models import Parent, Staff, Student
from apps.school_admin import imports
from tests.records import make_class, make_parent, make_student, make_year

pytestmark = pytest.mark.django_db

IMPORT = "/api/school/import/"
FAMILY = [
    "First name",
    "Surname",
    "Date of birth",
    "Gender",
    "Class",
    "Parent 1 first name",
    "Parent 1 surname",
    "Parent 1 phone",
    "Parent 1 relationship",
]


def sheet(rows, name="pupils.csv"):
    buffer = io.StringIO()
    csv.writer(buffer).writerows(rows)
    return SimpleUploadedFile(name, buffer.getvalue().encode(), content_type="text/csv")


def send(client, kind, upload, commit=False):
    data = {"file": upload, **({"commit": "1"} if commit else {})}
    response = client.post(IMPORT + kind, data, format="multipart")
    assert response.status_code == 200, response.content
    return response.json()


def test_checking_a_file_says_what_would_be_imported_and_saves_nothing(admin, school):
    make_class(make_year(school), "basic_2", "A")
    upload = sheet(
        [
            FAMILY,
            [
                "Kwame",
                "Asante",
                "01/02/2018",
                "M",
                "Basic 2A",
                "Akosua",
                "Asante",
                "024 555 0101",
                "Mother",
            ],
            [
                "Efua",
                "Asante",
                "15/06/2019",
                "F",
                "basic 2a",
                "Akosua",
                "Asante",
                "0245550101",
                "mother",
            ],
        ]
    )

    body = send(admin, "pupils", upload)

    assert body["problems"] == []
    assert body["imported"] is False
    assert body["summary"] == {
        "pupils": 2,
        "new_parents": 1,
        "existing_parents": 0,
        "classes": ["Basic 2A"],
        "unplaced": 0,
    }
    assert not Student.objects.exists()


def test_importing_admits_pupils_places_them_and_gives_each_parent_one_account(admin, school):
    basic = make_class(make_year(school), "basic_2", "A")
    kofi = make_parent(school, phone="024 555 0202", first_name="Kofi", surname="Boateng")
    upload = sheet(
        [
            FAMILY,
            [
                "Kwame",
                "Asante",
                "01/02/2018",
                "M",
                "Basic 2A",
                "Akosua",
                "Asante",
                "024 555 0101",
                "Mother",
            ],
            ["Efua", "Asante", "15/06/2019", "F", "Basic 2A", "Akosua", "Asante", "0245550101", ""],
            [
                "Yaw",
                "Boateng",
                "2018-07-09",
                "Boy",
                "",
                "Kofi",
                "Boateng",
                "+233 24 555 0202",
                "Dad",
            ],
        ]
    )

    body = send(admin, "pupils", upload, commit=True)

    assert body["problems"] == [] and body["imported"] is True
    kwame = Student.objects.get(first_name="Kwame")
    assert len(kwame.student_id) == 7
    assert kwame.date_of_birth == date(2018, 2, 1)
    assert kwame.enrolments.get().school_class == basic
    akosua = Parent.objects.get(first_name="Akosua")
    assert {link.student.first_name for link in akosua.guardianships.all()} == {"Kwame", "Efua"}
    link = kwame.guardianships.get()
    assert link.relationship == "MOTHER" and link.is_payer and link.is_primary_contact
    assert Student.objects.get(first_name="Efua").guardianships.get().relationship == "GUARDIAN"
    yaw = Student.objects.get(first_name="Yaw")
    assert yaw.gender == "M" and not yaw.enrolments.exists()
    assert yaw.guardianships.get().parent == kofi
    assert Parent.objects.filter(school=school).count() == 2
    contact = kwame.emergency_contacts.get()
    assert (contact.name, contact.phone, contact.relationship) == (
        "Akosua Asante",
        akosua.phone,
        "Mother",
    )


def test_every_problem_is_reported_by_spreadsheet_row_and_nothing_is_imported(admin, school):
    make_class(make_year(school), "basic_2", "A")
    make_student(school, first_name="Ama", surname="Mensah", date_of_birth=date(2018, 1, 1))
    upload = sheet(
        [
            [
                "First name",
                "Surname",
                "Date of birth",
                "Gender",
                "Class",
                "Parent 1 first name",
                "Parent 1 surname",
                "Parent 1 phone",
            ],
            ["Kwame", "Asante", "31/02/2018", "M", "Basic 2A", "", "", ""],
            ["Efua", "", "15/06/2019", "F", "Basic 9Z", "", "", ""],
            ["Yaw", "Boateng", "15/06/2019", "X", "", "Kofi", "Boateng", "12345"],
            ["Ama", "Mensah", "01/01/2018", "F", "", "", "", ""],
            ["", "", "", "", "", "", "", ""],
            ["Kojo", "Asare", "02/02/2018", "M", "", "Kofi", "", "0245550303"],
            ["Kojo", "Asare", "02/02/2018", "M", "", "", "", ""],
        ]
    )

    body = send(admin, "pupils", upload, commit=True)

    assert body["imported"] is False
    by_row = {}
    for problem in body["problems"]:
        by_row.setdefault(problem["row"], []).append(problem["message"])
    assert sorted(by_row) == [2, 3, 4, 5, 7, 8]
    assert "DD/MM/YYYY" in " ".join(by_row[2])
    assert "Surname is missing." in by_row[3]
    assert any("No class called Basic 9Z" in message for message in by_row[3])
    assert any(message.startswith("Gender") for message in by_row[4])
    assert any(message.startswith("Parent 1 phone") for message in by_row[4])
    assert any("already a pupil" in message for message in by_row[5])
    assert "Parent 1 surname is missing." in by_row[7]
    assert any("row 7" in message for message in by_row[8])
    assert Student.objects.count() == 1


def test_reads_an_excel_workbook(admin, school):
    book = Workbook()
    book.active.append(
        [
            "First name",
            "Surname",
            "Date of birth",
            "Gender",
            "Parent 1 first name",
            "Parent 1 surname",
            "Parent 1 phone",
        ]
    )
    # Excel turns dates into dates and drops a phone number's leading zero.
    book.active.append(
        ["Kwame", "Asante", datetime(2018, 2, 1), "Male", "Akosua", "Asante", 245550101]
    )
    buffer = io.BytesIO()
    book.save(buffer)
    upload = SimpleUploadedFile("pupils.xlsx", buffer.getvalue())

    body = send(admin, "pupils", upload, commit=True)

    assert body["problems"] == [] and body["imported"] is True
    kwame = Student.objects.get()
    assert (kwame.date_of_birth, kwame.gender) == (date(2018, 2, 1), "M")
    assert Parent.objects.get().phone == "+233245550101"


def test_reads_a_csv_saved_by_excel_with_semicolons_and_windows_letters(admin, school):
    creche = make_class(make_year(school), "creche")
    text = "First name;Surname;Date of birth;Gender;Class\r\nAdwoa;Owusu;03/04/2024;F;Crèche\r\n"
    upload = SimpleUploadedFile("pupils.csv", text.encode("cp1252"))

    body = send(admin, "pupils", upload, commit=True)

    assert body["problems"] == [] and body["imported"] is True
    assert Student.objects.get().enrolments.get().school_class == creche


def test_excel_files_are_read_with_protection_against_booby_trapped_xml():
    from openpyxl.xml import DEFUSEDXML

    assert DEFUSEDXML  # openpyxl guards against XML bombs only when defusedxml is installed


def test_a_sheet_without_the_required_columns_is_refused(admin, school):
    body = send(admin, "pupils", sheet([["First name", "Date of birth"], ["Kwame", "01/02/2018"]]))

    assert body["imported"] is False
    [problem] = body["problems"]
    assert problem["row"] == 1
    assert "Surname" in problem["message"] and "Gender" in problem["message"]


def test_an_old_excel_file_or_anything_else_is_refused_with_a_way_forward(admin, school):
    upload = SimpleUploadedFile("pupils.xls", b"\xd0\xcf\x11\xe0" + b"\x00" * 64)

    [problem] = send(admin, "pupils", upload)["problems"]

    assert "Save it as" in problem["message"]


def test_a_class_needs_a_current_school_year(admin, school):
    upload = sheet([FAMILY[:5], ["Kwame", "Asante", "01/02/2018", "M", "Basic 2A"]])

    [problem] = send(admin, "pupils", upload)["problems"]

    assert problem["row"] == 2 and "current school year" in problem["message"]


def test_a_sheet_with_too_many_rows_is_refused(admin, school, monkeypatch):
    monkeypatch.setattr(imports, "MAX_ROWS", 2)
    row = ["Kwame", "Asante", "01/02/2018", "M"]
    upload = sheet([FAMILY[:4], row, row, row])

    [problem] = send(admin, "pupils", upload)["problems"]

    assert "at most 2" in problem["message"]


STAFF_HEAD = ["First name", "Surname", "Username", "Roles", "Phone", "Email"]


def test_imports_staff_with_their_roles_and_one_time_passwords(admin, school):
    rows = [
        STAFF_HEAD,
        ["Abena", "Owusu", "Abena.Owusu", "Teacher; canteen officer", "024 555 0404", ""],
        ["Kojo", "Mensah", "kojo", "Accountant", "", "kojo@example.com"],
    ]
    assert send(admin, "staff", sheet(rows))["summary"] == {"staff": 2}

    body = send(admin, "staff", sheet(rows), commit=True)

    assert body["problems"] == [] and body["imported"] is True
    passwords = {row["username"]: row["one_time_password"] for row in body["passwords"]}
    assert set(passwords) == {"abena.owusu", "kojo"}
    abena = Staff.objects.get(first_name="Abena")
    assert set(roles.roles_of(abena.user)) == {roles.TEACHER, roles.CANTEEN}
    assert abena.phone == "+233245550404"
    assert abena.user.must_change_password
    assert abena.user.check_password(passwords["abena.owusu"])


def test_staff_problems_are_reported_by_row(admin, school):
    taken = admin.staff.user.login
    upload = sheet(
        [
            STAFF_HEAD,
            ["Ama", "Boateng", taken, "Teacher", "", ""],
            ["Yaw", "Asare", "yaw", "Driver", "", ""],
            ["Yaw", "Owusu", "YAW", "Teacher", "", "not-an-email"],
        ]
    )

    body = send(admin, "staff", upload, commit=True)

    by_row = {}
    for problem in body["problems"]:
        by_row.setdefault(problem["row"], []).append(problem["message"])
    assert sorted(by_row) == [2, 3, 4]
    assert any("already used" in message for message in by_row[2])
    assert any("Driver" in message for message in by_row[3])
    assert any("row 3" in message for message in by_row[4])
    assert any(message.startswith("Email") for message in by_row[4])
    assert Staff.objects.count() == 1  # only the Administrator signed in


def test_only_the_administrator_imports_and_leaders_can_get_the_templates(head, school):
    upload = sheet([FAMILY[:4], ["Kwame", "Asante", "01/02/2018", "M"]])
    assert head.post(IMPORT + "pupils", {"file": upload}, format="multipart").status_code == 403

    response = head.get(IMPORT + "pupils/template")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    header = response.content.decode("utf-8-sig").splitlines()[0]
    assert header.startswith("First name,Middle name,Surname,Date of birth,Gender,Class")
    staff_header = head.get(IMPORT + "staff/template").content.decode("utf-8-sig").splitlines()[0]
    assert staff_header.startswith("First name,Surname,Username,Roles")
    assert head.get(IMPORT + "teachers/template").status_code == 404
