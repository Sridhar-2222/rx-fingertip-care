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
  ambulance, departments, doctors & OPD timings, map link.
- **No approval step (owner's decision, 22 Nov 2026)**: hospitals are active (`verified`) as soon as they
  register. The owner can **block** or unblock a hospital from Profile → *Manage hospitals*; only admins
  (table `app_admins`) can change status (database trigger), and a blocked hospital cannot send records.
  To bring approval back later: set the column default to `pending` and require `status = 'pending'`
  in the insert policy.
- **Record handover** (`vault_handover`): an approved hospital sends a photo/PDF record (up to 3 files,
  about 190 KB each) to a patient's mobile number. The patient sees it in *Health vault → From hospitals*.
  The hospital can edit, replace or delete only its own records; the patient can view and download
  but not change them; nobody else can see them. Records wait for patients who sign up later.
- **Enrolment** (`enrollments`): a chemist (Chemist → *Patients* tab) or an approved hospital enrols
  a patient by mobile number; sending a record enrols automatically. The patient sees
  *My pharmacy & hospital* on the Patient tab and can remove any link.
- Approved hospitals are listed for everyone under Hospitals → *Registered hospitals ✓*.
- Privacy rules were tested on the live database with simulated users (20 checks, rolled back).

## 3c. Health video library (no API key)

- Table `video_library` (read-only for signed-in users; admins can hide a video) is filled by the
  Edge Function **`video-sync`** (source in `supabase/functions/video-sync/index.ts`). It reads YouTube's
  free public RSS feeds — each trusted channel's latest uploads plus up to 40 of its playlists — tags each
  video with conditions (English + Telugu keywords) and language, and stores views.
- Trusted channels live in table `video_channels` (Yashoda, Prathima, CARE, AIG; Apollo inactive because
  its handle was not confirmed). Add a channel by inserting its handle or channel ID.
- Runs daily at 00:30 UTC via `pg_cron` (job `video-sync-daily`, using `pg_net`); the function itself
  refuses to run more than once every 6 hours. First run (23 Nov 2026): 673 videos.
- App: Health videos screen has condition chips, word/voice search (Telugu words like షుగర్ work),
  "Telugu first" ordering, in-app playback via youtube-nocookie embed, "More on YouTube" search link.
- Only titles and links are stored; videos are not copied. A bigger library (1,000+) can use the
  YouTube Data API later (needs a Google API key stored as an Edge Function secret).

## 3d. Voice first, then photo, then typing (free, on the phone)

- Every form opened in a sheet (except PIN/password forms marked `data-nosf`) gets a bar at the top:
  **🎤 Speak (Telugu / English)**, **📷 Photo**, **⌨️ Type**, **🔊 What to say**.
- Speech: browser speech recognition (Chrome, te-IN / en-IN). When the person stops speaking, the
  form fills automatically. Details can be said **in any order**; the local engine `LS` in `index.html`
  understands names, age, sex, village/address, phone numbers (own / doctor / emergency), height,
  weight, blood group, conditions, BP ("140 by 90"), sugar (fasting/after food), pulse/HR, SpO2,
  temperature, medicine name + strength, dose, morning/afternoon/night, before/after food, days,
  quantities, batch, expiry, supplier, invoice, licence/registration no., hospital/shop names,
  order lists ("Dolo 650 two strips and Pan 40 one strip"), in English and Telugu (Telugu digits too).
  Words that match nothing (e.g. a name said without "name") are used for the name, then the place.
- Photo: printed slips are read on the phone with Tesseract.js (English + Telugu, loaded from the
  jsDelivr CDN only when first used; first use downloads language data). Handwriting is weak.
- Always shows "Here's what I understood" with a 🔊 Read back button; the person checks and saves.
- If a paid AI is added later (`CAP.sample`), the same bar switches to the AI path automatically.
- Privacy note for pilot users: Chrome's speech recognition sends audio to Google to turn it into text.

## 3e. Rx Assistant (chat) — free, voice-first

- The 💬 button on every page opens the assistant. Without a paid AI (`CAP.sample` absent) it runs the
  local engine `localReply()` in `index.html`: Telugu/English keyword understanding + the `LS` parser.
- Speak (🎤) and it sends when you stop talking and **reads the answer aloud**; 📷 reads a printed paper.
- It can: explain the person's medicines and next dose; save BP/sugar/pulse/SpO2/temperature readings
  said in a sentence ("నా షుగర్ పరగడుపు 150", "BP 130 by 85") after a tap; show recent readings; start a
  medicine order ("order Dolo 650 two strips", or refills running low); read today's diet; show doctors'
  videos for a condition; show hospital records; call the enrolled pharmacy/hospital; chemist stock and
  new-order summary.
- Safety: emergency words (chest pain, not breathing, unconscious, stroke, bleeding, poison, suicide…, in
  Telugu too) always answer first with a **Call 108** button. Questions about doses, mixing medicines or
  side effects are never answered — it points to the pharmacist/doctor.
- If a paid AI is added later, the same chat switches to it automatically.

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
- [ ] Hospital registers → hospital sends a record → patient sees it in the vault; owner can block it
- [ ] Chemist enrols a patient → patient sees the pharmacy under "My pharmacy & hospital"
- [ ] (Optional, email users only) Register a new email account and confirm via the email link
- [ ] Sign in, sign out, sign in again
- [ ] Forgot password → set a **different** new password → sign in with it
- [ ] Wrong password shows a clear message
- [ ] Unconfirmed email shows "please confirm your email first"
- [ ] Telugu language switch and voice read-aloud work
- [ ] On a real Android phone: speak a patient's details in any order (Telugu and English) and check the form
- [ ] Photograph a printed OP slip / BP slip and check the form
- [ ] Assistant on a real phone: speak "BP 130 by 85", "my medicines", "sugar videos", "chest pain" (Telugu and English)
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
