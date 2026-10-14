# Backups and restoring them

The database lives on Neon. Neon keeps a history of recent changes, so the database can be put back to how it was at any moment within its history window. How far back that goes depends on your Neon plan: check it in the Neon console under the project's settings.

## Check a backup works (once a term)

1. On your computer, in `backend`, with `DATABASE_URL` pointing at the **live** database:

   ```bash
   python manage.py backup_check > before.json
   ```

   This writes the number of schools, users, pupils, payments and other records, and the money totals. It reads the database but doesn't change anything.

2. In the Neon console, open the project, choose **Branches**, then **Create branch**. Pick **Point in time** and choose a moment a few minutes ago. Neon makes a copy (a "branch") from its history.

3. Copy the new branch's connection string. Point `DATABASE_URL` at the **copy** (never paste it into the repository or a chat), then run:

   ```bash
   python manage.py backup_check --compare before.json
   ```

   - "The restored copy matches" means the backup works.
   - Otherwise it lists what differs. Small differences in recent records are expected if people were using the system between steps 1 and 2.

4. Delete the branch in the Neon console when you've finished.

## Restore after a mistake

1. Note the time just **before** the mistake.
2. In Neon, use **Restore** on the main branch, picking that time. Neon keeps the current state as a backup branch, so nothing is lost for good.
3. Run `python manage.py backup_check` and check the numbers look right.
4. Tell the affected schools what was restored and from what time.

## Uploaded files

Photos and documents are stored on Cloudinary, which keeps its own copies. They aren't part of the database backup.
