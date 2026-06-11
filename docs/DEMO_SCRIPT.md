# ArkenEdu — 2-minute demo recording script

**Target length:** 1:45–2:05.
**Audience:** school principals / admins evaluating ArkenEdu, or recruiters watching a portfolio reel.
**Goal:** show three workflows that prove the product is real, in roughly 30s each, with a tight hook and close.

---

## Before you record

### Tools

- **Recorder:** [Loom](https://www.loom.com/) (free tier, web-only) **or** QuickTime → File → New Screen Recording.
- **Browser:** Chrome in a fresh incognito window at **1440×900**. Hide bookmarks bar (`⌘+Shift+B`). Close every other tab.
- **Mic:** any USB or AirPods mic. Test once — laptop built-in mics produce echo.
- **Mobile app:** iPhone with screen-mirroring on (`QuickTime → File → New Movie Recording → camera dropdown → iPhone`). Set Do-Not-Disturb on.
- **Cursor:** macOS → System Settings → Accessibility → Display → "Pointer size" set to **medium**. Easier to follow.

### State to prep

1. Seed the local DB so demo data is realistic:
   ```bash
   docker compose exec backend python seed.py
   ```
2. Pre-login as the **admin** in the web browser at `localhost:5173`.
3. Pre-login as **parent** in the mobile app and leave it on the home screen.
4. Have **two browser tabs** ready:
   - Tab A — Admin → Attendance
   - Tab B — Admin → Finance → Manual Payments
5. Have these pages cached so they render instantly:
   - `/admin/attendance` (today's date selected)
   - `/admin/finance/manual-payments` (one pending row visible)
   - `/teacher/lesson-plan` (a finished plan loaded)

### Voice & tone

- Speak as if explaining to a school principal, **not** another engineer. No jargon.
- Use present tense ("the parent gets a notification" — not "the parent will get").
- One breath per sentence. If you stumble, stop, take a breath, start the sentence over — easier than splicing audio.

---

## The script

> Total spoken text below is **~285 words ≈ 1:55** at a natural pace (150 wpm). Time each section as you rehearse — adjust if you're consistently over.

---

### 0:00–0:10 — Hook (open on landing page)

**[On screen]** ArkenEdu marketing site / landing page (or the admin login screen with the ArkenEdu logo visible).

> "This is ArkenEdu. It's a school management platform that replaces the WhatsApp groups, paper attendance registers, and Excel fee sheets that most Indian schools still run on. Let me show you what it does in under two minutes."

---

### 0:10–0:40 — Workflow 1: attendance + parent notification

**[On screen]** Tab A — Admin → Attendance for "Class 8A, today".

> "A teacher takes attendance on the web. One tap per student — present, absent, late."

**[Action]** Mark 2-3 students absent. Click **Save**. Toast appears: *"Attendance saved successfully"*.

**[Cut to]** Mobile screen, parent app.

> "The parent of an absent student gets a push notification on their phone instantly — same backend, same data, no extra step for the school."

**[Action]** Pull down to refresh on mobile. The notification banner is visible; tap it. The Attendance screen on mobile shows the absence with date and class.

> "This is the kind of thing that today takes a teacher 20 minutes of WhatsApp messages. Now it's automatic."

---

### 0:40–1:10 — Workflow 2: offline fee approval

**[On screen]** Tab B — Admin → Finance → Manual Payments. One pending row visible — parent name, amount ₹15,000, screenshot thumbnail.

> "A lot of parents pay fees by UPI directly to the school's bank account, then send a screenshot. Most ERPs don't handle this — ArkenEdu does."

**[Action]** Click the pending row. Drawer slides in showing the screenshot enlarged + fee allocation breakdown.

> "The admin reviews the screenshot, confirms the amount, and approves."

**[Action]** Click **Approve**. Toast: *"Payment approved successfully"*. Row disappears from the pending list.

**[Cut to]** Parent mobile app → Fees tab.

> "The payment now shows up on the parent's app, posted to the same finance ledger as admin-recorded cash entries. The parent gets a receipt PDF. The admin gets reconciliation. Zero manual spreadsheet work."

---

### 1:10–1:40 — Workflow 3: AI lesson plan

**[On screen]** Teacher portal → AI Lesson Plan.

> "Teachers spend hours on lesson plans. ArkenEdu does the first draft in 30 seconds."

**[Action]** Fill the form: Subject = "Mathematics", Grade = "8", Topic = "Quadratic Equations", Duration = "45 mins". Click **Generate**.

> "It's not a chatbot — it produces a structured lesson plan with learning objectives, activities, assessment questions, and homework."

**[Action]** The generated plan renders. Scroll through it. Click **Export → PDF**.

> "Export to PDF, edit it, share it. The teacher's hour just became three minutes."

---

### 1:40–2:00 — Close (cut back to landing or logo)

**[On screen]** ArkenEdu logo / landing page. Optionally show a single slide with three stats: "100+ automated tests · 3 surfaces · 1 backend".

> "Three surfaces — admin web, teacher portal, parent mobile — one backend, real multi-tenancy, production-grade security. ArkenEdu is the platform a school can actually run on. Get in touch at [your-email] — I'd love to give your school a free pilot."

---

## Recording checklist

- [ ] Browser at 1440×900, bookmarks hidden, single tab visible per scene.
- [ ] Mobile screen mirrored, DND on, notifications cleared.
- [ ] Test mic — record 5 seconds, play back, check echo + level.
- [ ] Pre-load all three pages so nothing spinner-loads on camera.
- [ ] One uninterrupted take if possible. If not — record per section, splice in iMovie / Loom editor.
- [ ] Add 1-second fade-in and fade-out. No music (or very quiet ambient — vocals carry the demo).
- [ ] Export at 1080p, H.264, MP4. Target file size < 50 MB.

## Editing notes

- **Cut all dead air > 0.5s.** Long pauses kill demo pacing.
- **Speed up form-typing 1.5×** if it's slow — keep voice at 1.0×.
- **No zooms or transitions.** Hard cuts only. Anything fancier looks amateur.
- **Caption everything.** Open captions (burned-in subtitles) — many evaluators watch on mute. Use [https://www.veed.io](https://www.veed.io/) free tier.

## Distribution

- **YouTube unlisted** — primary host. Stable URL for the one-pager + LinkedIn.
- **Loom** — fast preview link for cold outreach.
- **LinkedIn native video** — re-upload (don't link out) for the feed algorithm.
- **GIF for cold emails** — first 6 seconds of the attendance workflow, converted via [https://ezgif.com](https://ezgif.com/). Keeps the email under 5MB.

---

*If you want a second variant — a 30-second "founder hook" cut from the first 10 seconds and the close — record both in the same session. Reuse the same audio.*
