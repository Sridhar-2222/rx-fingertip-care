# Rx Fingertip Care — handover and launch checklist

Read this first. It describes what exists, what was tested, and what is left.
Keep this project **separate** from Fingertip Easy (hotel app), the old Rx Fingertip app,
and any other Patient Companion project.

## 1. What this app is

- Patient and chemist companion app for Telangana / Andhra Pradesh, Telugu + English.
- Live URL: https://sridhar-2222.github.io/rx-fingertip-care/
- Repository: https://github.com/Sridhar-2222/rx-fingertip-care (branch `main`)

## 2. How it is built (important — please do not re-platform it)

- **Plain static files, no build step.** `index.html` holds all HTML, CSS and JavaScript.
  There is no `package.json`, no Vite, no `dist/`. This is intentional.
- **GitHub Pages deploys from branch `main`, folder `/ (root)`.** No GitHub Actions workflow
  is needed. Pushing to `main` redeploys within 1–2 minutes.
- **Routing uses hash URLs** (`#home`, `#diet`, …), so there is no 404 problem on the
  `/rx-fingertip-care/` subpath and no `404.html` fallback is needed.
- Files:
  - `index.html` — the whole app
  - `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable.png` — installable PWA
  - `.nojekyll` — stops GitHub Pages from processing files
- Supabase JS v2 is loaded from the jsDelivr CDN in `index.html`.
- If a framework rewrite is ever proposed, ask the owner first. The plan in the generic
  launch document (Vite, `VITE_` variables, Actions build) does not apply to this repo.

## 3. Backend (Supabase, free plan)

- Project: `rx-fingertip-care`, ref `xeedfxkxecegmkxuqpti`, region ap-south-1.
- URL `https://xeedfxkxecegmkxuqpti.supabase.co` and the **publishable** key are in
  `index.html`. These are public by design. No secret keys are in the repo.
- Tables (all with Row Level Security ON):
  - `priv_docs`, `priv_files` — a user's private health data; each user sees only their own rows.
  - `chemists`, `hospitals`, `videos` — readable by signed-in users; only the owner can write.
  - `inventory` — only the shop owner.
  - `orders` — visible to the patient who placed it and the shop it went to; only the
    patient can create it; a trigger stops changing `patient_uid` / `chemist_id`; no deletes.
- RLS was tested with two separate accounts (data did not mix). Supabase security
  advisors returned no warnings.
- Auth settings (already done):
  - Site URL: `https://sridhar-2222.github.io/rx-fingertip-care/`
  - Redirect URLs: the same URL, and the same URL followed by `**`
  - Email confirmation: ON

## 3a. Login: mobile number + PIN (main way to sign in)

Most target customers do not use email, so patients and chemists sign in with a
**10-digit mobile number and a 6-digit PIN**. No email or SMS is sent.

- Behind the scenes each number becomes an internal address `91XXXXXXXXXX@phone.rxfingertip.app`
  (never emailed). The PIN is the Supabase password.
- Accounts are created by the Edge Function **`pin-auth`** (source in
  `supabase/functions/pin-auth/index.ts`, deployed with verify_jwt off because it checks callers itself):
  - `signup` — creates a confirmed user and a row in `phone_accounts`; rejects a number already in use.
  - `reset` — sets a new PIN for a number; **only users listed in `public.app_admins`** may call it.
- Tables: `phone_accounts` (phone → user; no client access at all, only the function reads it) and
  `app_admins` (owner's account is the only admin). The Supabase advisor note "RLS enabled, no policy"
  on `phone_accounts` is intentional.
- Forgot PIN: the patient visits the chemist / contacts the owner; the admin uses
  **Profile → Reset a patient's PIN** after checking the person owns the number.
- Signed-in users can change their own PIN from **Profile → Change PIN**.
- Email + password sign-in is still there under "Sign in with email instead" for older/staff accounts.
- Do **not** switch on "Leaked password protection" in Supabase Auth: it would reject common 6-digit PINs.
- Tested 22 Nov 2026: live function (signup, duplicate, bad number, sign-in, wrong PIN,
  reset blocked for non-admins and signed-out callers) and the app screens in a browser.
  Still to test on the live site: an admin PIN reset by the owner.

## 3b. Hospitals, record handover, "enrolled by"

- **Hospital registration** (`hospital_accounts`): a hospital signs in with mobile + PIN, taps
  *I'm a hospital* on Home and fills name, registration/licence no., address, phone, emergency no.,
  ambulance, departments, doctors & OPD timings, map link. Status starts `pending`.
- **One-time approval by the owner**: Profile → *Approve hospitals*. Only admins (table `app_admins`)
  can change status (database trigger). Changing the hospital **name or registration no.** sends it
  back to `pending`; other edits do not.
- **Record handover** (`vault_handover`): an approved hospital sends a photo/PDF record (up to 3 files,
  about 190 KB each) to a patient's mobile number. The patient sees it in *Health vault → From hospitals*.
  The hospital can edit, replace or delete only its own records; the patient can view and download
  but not change them; nobody else can see them. Records wait for patients who sign up later.
- **Enrolment** (`enrollments`): a chemist (Chemist → *Patients* tab) or an approved hospital enrols
  a patient by mobile number; sending a record enrols automatically. The patient sees
  *My pharmacy & hospital* on the Patient tab and can remove any link.
- Approved hospitals are listed for everyone under Hospitals → *Registered hospitals ✓*.
- Privacy rules were tested on the live database with simulated users (20 checks, rolled back).

## 4. Email (Brevo free plan, used as Supabase custom SMTP)

- Host `smtp-relay.brevo.com`, port 587, sender name "Rx Fingertip Care",
  sender address is the owner's verified Gmail. Login and key are stored in Supabase only.
- Status: **working**. On 22 Nov 2026 a signup confirmation (7:52 pm IST) and a
  password-reset email (7:58 pm IST) were accepted by Brevo, and the reset link was opened.
- Known risk: sending from a gmail.com address through Brevo can land in Spam.
  Fix later with an own domain (for example `rxfingertip.in`) — do not buy one without
  the owner's approval; check the yearly renewal price first.
- Limits: Brevo 300 emails/day; Supabase 30 emails/hour (Auth → Rate Limits).
- **Never** ask the owner to paste the SMTP key, Supabase service-role key, database
  password or any password into chat, and never commit them.

## 5. Privacy rules for this app

- No medicine names or order details in WhatsApp messages. Health information is allowed.
- General guidance only, not medical advice; the app says this on the sign-in screen.
- AI features (Smart scan, Smart fill, chatbot) are switched off and say "coming soon".
  They need a paid AI API later, called from a server function — never put an AI key
  in `index.html`.

## 6. Launch checklist

Done:
- [x] Public GitHub repository created and app uploaded
- [x] GitHub Pages switched on (main / root) — app loads at the live URL
- [x] Supabase Site URL and Redirect URLs set
- [x] Brevo sender verified and connected as Supabase custom SMTP
- [x] Signup confirmation email sent successfully
- [x] Forgot-password email sent and link opened
- [x] RLS on every table; two-account privacy test passed
- [x] Mobile number + PIN login built and tested (see 3a)
- [x] Hospital registration, approval, record handover and enrolment built and tested (see 3b)
- [x] Owner's own account works (it was confirmed manually in Supabase during setup)

Still to do (test on Android Chrome, on mobile data as well as Wi-Fi):
- [ ] Create an account with a **mobile number + PIN** on the live site and sign in on a second phone
- [ ] Owner signs in (email) → Profile → Reset a patient's PIN → patient signs in with the new PIN
- [ ] Hospital registers → owner approves → hospital sends a record → patient sees it in the vault
- [ ] Chemist enrols a patient → patient sees the pharmacy under "My pharmacy & hospital"
- [ ] (Optional, email users only) Register a new email account and confirm via the email link
- [ ] Sign in, sign out, sign in again
- [ ] Forgot password → set a **different** new password → sign in with it
- [ ] Wrong password shows a clear message
- [ ] Unconfirmed email shows "please confirm your email first"
- [ ] Telugu language switch and voice read-aloud work
- [ ] Install to home screen with the "App" button; app opens full-screen
- [ ] Two accounts: patient data does not appear in the other account
- [ ] Chemist flow: create shop, add stock, receive a patient order
- [ ] Check that confirmation emails do not land in Spam for a non-Gmail address too
- [ ] Brevo tidy-up: delete unused SMTP keys, keep only the one in use
- [ ] Owner deletes any copy of the SMTP key saved in chats/notes

Later (needs owner approval / payment):
- [ ] Own domain for email and optionally a custom web address
- [ ] AI features through a Supabase Edge Function with a paid AI API key stored as a secret
- [ ] WhatsApp Business messages (health info only) through a server function

## 7. How to report back to the owner

Share only non-secret information: what changed, test results, the live URL, error
messages and screenshots. Do not claim launch until each "Still to do" item is tested
on the live URL.
