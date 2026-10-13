# Stages 9–22 together (Implementation Plan)

> The owner asked (2026-10-13): "build all together at one goal, be fast, text only after building all
> together to fix errors". So the remaining roadmap stages are built in one branch, and the whole
> check runs once at the end (owner's instruction overrides per-step testing).

**Spec:** `docs/superpowers/roadmap.md` Stages 9–22 (with P1, MS, BT and SMS spec references there).

## Architecture
- **Shared register framework.**
  - `apps/core/resources.py` turns a short `Resource` description (model, fields, reader and writer roles, filters, restricted reads) into list, add, edit and remove endpoints.
  - School registers are always filtered to the user's own school, and related records named in a request must belong to that school.
  - On screen, `RecordsView` renders any such register from a field list.
- **New apps:** `finance` (fees, ledger, payments, wallets, daily lists, cash-up, statements, extra-class pay, Paystack, USSD, reconciliation), `transport`, `billing` (platform plans, subscriptions, bills), `learning` (attendance, assessment, results, report cards, lesson notes, timetable, resources, AI quizzes), `care` (early years, pick-up control, gate, visitors, medical, sickbay, incidents), `shop` (books, uniforms, orders), `support` (support access, platform announcements, support conversations, data requests).
- **Existing apps grow:** `notifications` (Arkesel, templates, credits, announcements, jobs), `school_admin` (school website editing, SMS log), `platform_admin` (domains, platform notice, statistics), `family` and `pupil` (full portals).

## Decisions (owner absent; rulings)
- **Money** is stored in pesewas, in one append-only ledger: never deleted, reversed by a linked entry. Receipts and bills are numbered without gaps.
- **SMS credits** are charged only for school messages (announcements, reminders, absence, receipts). Sign-in codes and account notices stay free.
- **Paystack, Arkesel, USSD and AI** are switched on by settings. Until a key is set, each answers "not set up yet" (owner supplies the keys).
- **Report cards** are a print-ready page (the browser's Print or PDF).
- **Backups:** Neon's point-in-time restore plus a `backup_check` command that exports and verifies a data dump each term.
- **Retention:** the anonymising command only runs when given `--apply` (it only reports otherwise).
