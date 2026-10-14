# Putting ADsmartschool online (free plans, for a trial)

| Part | Where it runs | Plan |
|---|---|---|
| **Website and admin area** (Next.js) | Vercel, project `adsmartschool`, folder `frontend` | Hobby (free) |
| **Backend** (Django) | Render, service `adsmartschool-api`, folder `backend` | Free |
| **Database** | Neon, in Frankfurt | Free |
| **Photos** | Cloudinary | Free |
| **Email** (sign-in codes, bills) | Brevo | Free |

> **Never paste a password, key or secret into a chat, an email or a file in the project.** Type
> them only into the Vercel, Render, Neon, Cloudinary or Brevo websites.

## What free plans mean for a trial

- **Render sleeps.** After about 15 minutes with no visits, the backend goes to sleep. The next
  visit wakes it, which takes up to about a minute. After that, pages are quick again.
- **The daily jobs still run.** Each morning Vercel calls the backend twice: at 06:00 (UTC) to wake
  it, and at 06:05 to run the reminders, billing and payment checks.
- **Email goes through Brevo, not Gmail directly.** Render's free plan blocks the ports that
  ordinary email (SMTP) uses, so the backend sends email through Brevo's web service instead.
  Brevo's free plan has a daily sending limit; check it on Brevo's pricing page.
- **Photos must go to Cloudinary.** Render's free plan keeps no files between restarts.
- **Vercel's free Hobby plan is for non-commercial use.** It's fine for a trial. Move to Vercel Pro
  before you charge schools.
- **Upgrading later** is a setting change on each service. Nothing in the code needs changing.

---

## 1. Before you start

- [ ] **The code is on GitHub**, including the latest work. Ask Claude to push it.
- [ ] **Accounts** at [Vercel](https://vercel.com), [Render](https://render.com),
  [Neon](https://neon.tech), [Cloudinary](https://cloudinary.com) and [Brevo](https://www.brevo.com).
  Sign in to Render and Vercel with your GitHub account, so they can see the repository.

## 2. The database (Neon, Frankfurt)

Your current Neon database is in the USA. For the backend in Frankfurt, make a new one in Europe.
This also replaces the old database password, which was shared in a chat.

1. In Neon, choose **New project**. Name it `adsmartschool`. For **Region**, choose
   **AWS Europe Central 1 (Frankfurt)**.
2. Open **Dashboard**, then **Connection string**, and choose the **pooled** connection. Copy the
   address that starts with `postgresql://`. This is your **DATABASE_URL**.
3. The new database starts empty. That's right for a trial: step 8 fills it with starting
   content. Once everything works, delete the old project in the USA.

## 3. Photos (Cloudinary)

1. Open the Cloudinary **Dashboard**, find **API Environment variable** and copy the value that
   starts with `cloudinary://`. This is your **CLOUDINARY_URL**.
2. Note your **Cloud name** (on the same page). Your **media address** is
   `https://res.cloudinary.com/<your cloud name>/`.

## 4. Email (Brevo)

1. **Verify the address you send from.** In Brevo, open **Senders, Domains & Dedicated IPs**, then
   **Senders**, then **Add a sender**. Use `kofiadutwumjnr881@gmail.com` and click the link Brevo
   emails you.
2. **Make an API key.** Open **SMTP & API**, then **API Keys**, then **Generate a new API key**.
   Name it `ADsmartschool`. Copy it (it starts with `xkeysib-`). This is your **BREVO_API_KEY**.
3. Until you have your own domain, emails come from your Gmail address through Brevo. The first
   ones may land in spam: check the spam folder, and mark them "not spam".

## 5. Make four secrets

You need four long random values: **DJANGO_SECRET_KEY**, **PROXY_SECRET**, **REVALIDATE_SECRET** and
**CRON_SECRET**. Render makes DJANGO_SECRET_KEY for you, so make the other three. Run this three
times in the Terminal panel:

```powershell
backend\.venv\Scripts\python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Keep them somewhere private, such as a password manager. **PROXY_SECRET**, **REVALIDATE_SECRET** and
**CRON_SECRET** go into **both** Render and Vercel, with exactly the same value in each.

## 6. The backend (Render)

1. In Render, choose **New**, then **Blueprint**, and pick your GitHub repository
   (`ADSmart-School`). Render reads `render.yaml` from the repository: one free web service,
   `adsmartschool-api`, in Frankfurt.
2. Render asks for the settings marked as secret. Fill them in:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon address from step 2 |
| `CLOUDINARY_URL` | the Cloudinary value from step 3 |
| `PLATFORM_DOMAIN` | `adsmartschool.vercel.app` |
| `ADMIN_HOST` | `adsmartschool-admin.vercel.app` |
| `FRONTEND_ORIGIN` | `https://adsmartschool.vercel.app` |
| `PLATFORM_EMAIL` | `kofiadutwumjnr881@gmail.com` |
| `PLATFORM_PHONE` | `+233545875881` |
| `PROXY_SECRET` | your PROXY_SECRET |
| `REVALIDATE_SECRET` | your REVALIDATE_SECRET |
| `CRON_SECRET` | your CRON_SECRET |
| `BREVO_API_KEY` | the Brevo key from step 4 |
| `DJANGO_DEFAULT_FROM_EMAIL` | `ADsmartschool <kofiadutwumjnr881@gmail.com>` |

   The rest (`DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `PHOTO_MAX_MB`, `SITE_URL_TEMPLATE` and so on)
   come from `render.yaml`.

3. Choose **Apply**. Render installs Python 3.14 and the packages, brings the database up to date
   and starts the server. The first deploy takes a few minutes.
4. **Note the address** Render shows for the service, such as
   `https://adsmartschool-api.onrender.com`. That's your **backend address**.
5. **Check it:** open `<backend address>/api/health`. It should show `"ok"`. If it's asleep, the
   first try can take up to a minute.

> If Render says Python 3.14.7 isn't available, change `PYTHON_VERSION` on the service's
> **Environment** page to the newest 3.14 it lists.

## 7. The website (Vercel)

You already have the `adsmartschool` project on Vercel (folder `frontend`). Open it, then
**Settings**, then **Environment Variables**, and set:

| Name | Value |
|---|---|
| `DJANGO_ORIGIN` | your **backend address** from step 6 |
| `PLATFORM_DOMAIN` | `adsmartschool.vercel.app` |
| `ADMIN_HOST` | `adsmartschool-admin.vercel.app` |
| `PROXY_SECRET` | the **same** PROXY_SECRET as on Render |
| `REVALIDATE_SECRET` | the **same** REVALIDATE_SECRET as on Render |
| `CRON_SECRET` | the **same** CRON_SECRET as on Render |
| `NEXT_PUBLIC_MEDIA_ORIGIN` | `https://res.cloudinary.com/<your cloud name>/` |

Then:

1. **Redeploy** the website (**Deployments**, the newest one, **Redeploy**). The backend must be
   awake, because the website reads its content while it builds: open the health address from
   step 6 first.
2. **Admin address:** under **Settings**, then **Domains**, make sure
   `adsmartschool-admin.vercel.app` is listed.
3. **Daily jobs:** under **Settings**, then **Cron Jobs**, you should see two jobs: `/api/health`
   at 06:00 and `/api/cron/jobs` at 06:05. They come from `frontend/vercel.json`.
4. **Delete the old backend project** `adsmartschool-api` on Vercel, if you made one before. The
   backend now lives only on Render.

## 8. Starting content and your Owner account (once, from your computer)

The new database is empty. Fill it from your computer with the **new** Neon address and your
Cloudinary value. Run these in the Terminal panel, one line at a time:

```powershell
cd C:\Dev\ad-smart-school\backend
```

```powershell
$env:DATABASE_URL = "PASTE YOUR NEW NEON ADDRESS HERE"
```

```powershell
$env:CLOUDINARY_URL = "PASTE YOUR CLOUDINARY VALUE HERE"
```

```powershell
.venv\Scripts\python manage.py seed_website
```

```powershell
.venv\Scripts\python manage.py create_user --kind platform --username kofi --name "Kofi Adutwum" --email kofiadutwumjnr881@gmail.com --phone 0545875881
```

- **seed_website** adds Sample School with its photos, your website's draft privacy notice and the
  starter tips (as drafts). The five price plans are already there.
- **create_user** asks you to choose a password. That account is an **Owner**.

**Close the Terminal panel tab afterwards,** so these addresses don't stay in it.

## 9. Check that everything works

- [ ] **Your website:** `https://adsmartschool.vercel.app` shows your homepage with the prices
  section. A "Preview" ribbon is normal until your privacy notice is approved.
- [ ] **Signing in:** `https://adsmartschool-admin.vercel.app` opens the admin sign-in. Sign in as
  `kofi`, choose **Email the code**, and the code should arrive (check spam the first time).
- [ ] **Photos:** in **Website**, then **Gallery**, add a photo. It appears in your Cloudinary
  media library and, within seconds, on your homepage.
- [ ] **Daily jobs (next morning):** in Vercel, **Logs**, filtered to `/api/cron/jobs`, shows a
  successful call after 06:05 UTC.

If something fails: the backend's logs are on its Render page under **Logs**; the website's are in
Vercel under **Logs**.

## 10. When you buy your own domain

School websites such as Sample School live at `school-name.yourdomain`, so they need your own
domain. When you buy one:

1. **Add the domains** to the **Vercel** project: `yourdomain.com` and `*.yourdomain.com`. Vercel
   asks you to use its nameservers for the `*.` one.
2. **Change these settings** on **both** Render and Vercel, then redeploy both:
   - `PLATFORM_DOMAIN` becomes `yourdomain.com`.
   - Remove `ADMIN_HOST`. The admin area becomes `admin.yourdomain.com`.
   - On Render, `FRONTEND_ORIGIN` becomes `https://yourdomain.com`.
3. **Email from your domain:** in Brevo, add and verify the domain, then change
   `DJANGO_DEFAULT_FROM_EMAIL` on Render to an address at it, such as `no-reply@yourdomain.com`.
   Fewer emails land in spam that way.
