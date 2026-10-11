# Putting ADsmartschool online with Vercel, Neon and Cloudinary

This guide takes you from code on GitHub to a working website. You'll set up two Vercel
projects from the same GitHub repository:

| Project | What it is | Root Directory | Its free address |
|---|---|---|---|
| **adsmartschool-api** | The backend (Django) | `backend` | `https://adsmartschool-api.vercel.app` |
| **adsmartschool** | Your website and admin area | `frontend` | `https://adsmartschool.vercel.app` |

The database is on **Neon** and uploaded photos are on **Cloudinary**.

> **Names:** if a name above is taken on Vercel, Vercel gives a slightly different address. Use
> the address Vercel actually shows wherever this guide uses the ones above.

> **Never paste a password, key or secret into a chat, an email or a file in the project.**
> Type them only into the Vercel, Neon or Cloudinary websites.

---

## 1. Before you start

- [ ] **The code is on GitHub**, including all the latest work. Ask Claude to push it.
- [ ] **Accounts:** you have accounts at [Vercel](https://vercel.com), [Neon](https://neon.tech) and
  [Cloudinary](https://cloudinary.com).
- [ ] **Vercel plan:** Vercel's free Hobby plan is for personal, non-commercial use. A business that
  charges schools should use **Vercel Pro**. On Hobby, the daily scheduled job (step 6) runs once a
  day at most, which is fine.

## 2. The database (Neon)

1. **Reset the password.** In Neon, open your project, then **Roles**, then `neondb_owner`, then
   **Reset password**. The old one was shared in a chat, so treat it as public.
2. **Copy the connection address.** Open **Dashboard**, then **Connection string**, and choose the
   **pooled** connection. Copy the address that starts with `postgresql://`. This is your
   **DATABASE_URL**.

> **Tip:** your Neon database is in the USA (us-east-2). That works. For faster pages in Ghana you can
> later create a Neon project in **Europe (Frankfurt)** and use that address instead.

## 3. Photos (Cloudinary)

1. Open the Cloudinary **Dashboard**, find **API Environment variable** and copy the value that
   starts with `cloudinary://`. This is your **CLOUDINARY_URL**.
2. Note your **Cloud name** (shown on the same page). Your **media address** is
   `https://res.cloudinary.com/<your cloud name>/`.

## 4. Email for sign-in codes (Gmail)

Sign-in codes are sent by email. Text messages need an SMS provider, which comes later.

1. In your Google account, turn on **2-Step Verification**.
2. Search your Google account settings for **App passwords** and create one called
   `ADsmartschool`. Google shows 16 letters once: this is your **SMTP password**.
3. Gmail can send up to about 500 emails a day. That's plenty to start with.

## 5. Make four secrets

You need four long random values: **DJANGO_SECRET_KEY**, **PROXY_SECRET**, **REVALIDATE_SECRET**
and **CRON_SECRET**. Make each one with this command (run it four times):

```powershell
backend\.venv\Scripts\python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Keep them somewhere private, such as a password manager.
**PROXY_SECRET** and **REVALIDATE_SECRET** go into **both** Vercel projects, with exactly the
same value in each.

## 6. The backend project (adsmartschool-api)

1. **Create the project.** In Vercel, choose **Add New**, then **Project**, and import your
   GitHub repository. Name it `adsmartschool-api`.
2. **Set the Root Directory** to `backend`. Vercel recognises Django by itself.
3. **Add these settings** under **Environment Variables**:

| Name | Value |
|---|---|
| `DJANGO_SECRET_KEY` | your first secret |
| `DJANGO_DEBUG` | `false` |
| `DATABASE_URL` | the Neon address from step 2 |
| `CLOUDINARY_URL` | the Cloudinary value from step 3 |
| `PHOTO_MAX_MB` | `4` (Vercel accepts uploads up to 4.5 MB) |
| `PLATFORM_NAME` | `ADsmartschool` |
| `PLATFORM_DOMAIN` | `adsmartschool.vercel.app` |
| `ADMIN_HOST` | `adsmartschool-admin.vercel.app` |
| `PLATFORM_EMAIL` | `kofiadutwumjnr881@gmail.com` |
| `PLATFORM_PHONE` | `+233545875881` |
| `SITE_URL_TEMPLATE` | `https://{host}` |
| `FRONTEND_ORIGIN` | `https://adsmartschool.vercel.app` |
| `PROXY_SECRET` | your second secret |
| `REVALIDATE_SECRET` | your third secret |
| `CRON_SECRET` | your fourth secret |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | `kofiadutwumjnr881@gmail.com` |
| `SMTP_PASSWORD` | the Gmail app password from step 4 |
| `DJANGO_DEFAULT_FROM_EMAIL` | `ADsmartschool <kofiadutwumjnr881@gmail.com>` |

4. **Deploy.** While building, Vercel installs Python 3.14 and the packages, and brings the
   database up to date.
5. **Check it.** Open `https://adsmartschool-api.vercel.app/api/health`. It should show `"ok"`.

A daily job at 07:00 (UTC) emails tip subscribers about any **scheduled** articles that went live.
Articles you publish straight away are emailed at once.

## 7. Starting content and your Owner account (once, from your computer)

The database is empty. Fill it from your computer, using the **new** Neon address and your
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
  starter tips (as drafts).
- **create_user** asks you to choose a password. That account is an **Owner**.

**Close the Terminal panel tab afterwards,** so these addresses don't stay in it.

## 8. The website project (adsmartschool)

1. **Create the project.** In Vercel, choose **Add New**, then **Project**, and import the
   **same** repository again. Name it `adsmartschool`.
2. **Set the Root Directory** to `frontend`. Vercel recognises Next.js by itself.
3. **Add these settings:**

| Name | Value |
|---|---|
| `DJANGO_ORIGIN` | `https://adsmartschool-api.vercel.app` |
| `PLATFORM_DOMAIN` | `adsmartschool.vercel.app` |
| `ADMIN_HOST` | `adsmartschool-admin.vercel.app` |
| `PROXY_SECRET` | the **same** second secret as the backend |
| `REVALIDATE_SECRET` | the **same** third secret as the backend |
| `NEXT_PUBLIC_MEDIA_ORIGIN` | `https://res.cloudinary.com/<your cloud name>/` |

4. **Deploy.** The backend must already be working, because the website reads its content while
   it builds.
5. **Add the admin address.** In the project, open **Settings**, then **Domains**, then **Add**, and
   type `adsmartschool-admin.vercel.app`. This is your admin area until you have your own domain.

## 9. Check that everything works

- [ ] **Your website:** `https://adsmartschool.vercel.app` shows your homepage, with your phone and
  email in the footer. A "Preview" ribbon is normal until your privacy notice is approved.
- [ ] **Signing in:** `https://adsmartschool-admin.vercel.app` opens the admin sign-in. Sign in as
  `kofi`, choose **Email the code**, and the code should arrive in Gmail. Check the spam folder the
  first time.
- [ ] **Photos:** in **Website**, then **Gallery**, add a photo. It appears in your Cloudinary
  media library and, within seconds, on your homepage.

If something fails, open the project in Vercel and look under **Logs**.

## 10. What needs your own domain

Until you buy a domain, school websites such as Sample School can't be reached online. Each school
lives at `school-name.yourdomain`, and a free Vercel address can't have those sub-addresses.

When you buy one (for example in Vercel, under **Domains**):

1. **Add the domains.** On the **website** project, add `yourdomain.com` and `*.yourdomain.com`.
   Vercel asks you to use its nameservers for the `*.` one.
2. **Change these settings** on **both** projects, then redeploy both:
   - `PLATFORM_DOMAIN` becomes `yourdomain.com`.
   - Remove `ADMIN_HOST`. The admin area becomes `admin.yourdomain.com`.
   - On the backend, `FRONTEND_ORIGIN` becomes `https://yourdomain.com`.
3. **Done:** schools are then at `https://<slug>.yourdomain.com`, for example
   `https://sample.yourdomain.com`.

## Still to come

- **Text-message sign-in codes:** they need an SMS provider, such as Hubtel, Arkesel or mNotify.
  Until then, people with an email address get codes by email.
- **Approving your website's privacy notice** from the admin area, so the "Preview" ribbon goes
  and search engines can list you.
