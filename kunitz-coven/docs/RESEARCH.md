# Skylight Calendar: research notes

This is what Kunitz Coven is modelled on, gathered in October 2026 from:
- Skylight's help center (all 441 articles, via its public API)
- myskylight.com product pages and their CSS
- about 40 official screenshots, with colors sampled from the pixels
- reviews from SlashGear, Reviewed, Greenlight and others

## Product and pricing

- **Hardware.** Calendar 2 is a 15.6" 1080p touchscreen for about $300. There is also a 10" (about $160) and the 27" Calendar Max (about $600).
- **Software.** It runs a customized Android build. The phone app is free.
- **Calendar Plus ($79/yr) adds:**
  - Sidekick / Magic Import
  - photo and video screensaver
  - meal planning and recipes
  - stars and rewards
  - Disney Mode
- **Free tier includes:** calendar sync, chores and routines, lists, profiles, countdowns and Parental Lock.

## Visual design

**Layout**
- Landscape.
- A pale blue-gray left sidebar (`#E9F1F7`). The active item gets a white block.
- Sidebar order: Home, Calendar, Lists, Tasks, Rewards, Meals, Recipes, Photos, then Sleep and Settings pinned to the bottom.

**Header**
- On the left: the date in a large serif ("Tue, Sep 8"), the time in a smaller serif, and a weather emoji with the temperature.
- On the right: gray pill controls such as `[Week ⌄] [Filter] [‹] [Today] [›]`.

**Fonts**
- Skylight uses *P22 Mackinac* (serif) for headings, dates and names, and *Matter* (sans) for body text.
- Kunitz Coven uses free look-alikes: **Fraunces** and **Figtree**.

**Colors**
- Coral `#F66951` marks today and draws the current-time line.
- Skylight blue `#2178AF` is used for the + button, toggles and primary buttons.
- Text is `#1F1F1F`, gridlines `#F1F1F1`, and button fills `#F8F8F8`.

**Profile colors**
- Each person has one strong color.
- Event bubbles use a tint of about 35–40% of that color on white.
- Task columns use a very pale tint (about 7%), and the rows inside them about 14%.

**Shape**
- Everything is heavily rounded: about 16–20px on event bubbles, 32px on columns and 40px on panels. Buttons are pills.
- Shadows appear only on floating things such as popovers, the + button and dialogs.

**Content**
- Full-color emoji on tasks, rewards, countdowns and weather.
- Avatars are circles: a photo, an emoji or an initial, with a colored ring.

**Theme**
- Light only, with very large type meant to be readable across a room.

## Screens

**Home** (added in 2026)
- A calendar panel on the left, which can use any view.
- On the right, "Today's Tasks" (a 2×2 grid of profile cards) above "Lists" (two list cards).
- A *Customize* menu shows or hides the right-hand panels.

**Calendar**

| View | What it shows |
|---|---|
| Schedule | A time grid of 1–7 days. Weather sits on the column headers, all-day events show as pills, and a now-line marks the current time. |
| Day | A mini month on the left and an event list on the right. |
| Week | A 4×2 grid of the 7 days plus a "Next Week" tile. Each day has an "N events" count and "+ Add Event". |
| Month | Up to 3 chips per day, or 2 chips plus "N more". Weather appears for the next 10 days, and meals as outlined chips. |

- A pink **preview bar** under the header rotates through countdowns and shows each person's task progress rings.
- **Filter options:** task progress, weather, meals, countdowns, and individual profiles.
- **Settings:** shade weekends, dim past events, and color-code multi-profile events (diagonal split colors).

**Events**
- Fields: title, start and end or all-day, profiles (at least one), repeat ("Every n unit", weekdays, until), countdown, notes, location, and a reminder.
- Editing a repeating event asks **This event / This and following / All events**.

**Tasks**
- One column per person, plus a left-most **Up For Grabs** column.
- Each column header shows the avatar, the serif name, "✓ 3/10" and "⭐ 126".
- Below that are ring buttons for Morning, Afternoon, Evening and Chores, each with a progress ring.
- Rows show an emoji, the title and a white check circle that fills with the person's color.
- A Week view shows a grid of check circles per task and day.

**Chores**
- Can be dated, timed or "anytime".
- Repeat either on a schedule, or a set time *after the last completion*.
- **Late chores roll over every day until done.** They count on the day they're checked off.
- **Up For Grabs:** tap the chore, choose who did it, and they get the stars.
- **Skip:** routines and repeating chores can be skipped. A skip earns no stars and doesn't break streaks.

**Routines**
- A routine can appear in any combination of Morning, Afternoon and Evening.
- Only the current part of the day is shown: midnight–noon, noon–6pm, 6pm–midnight.
- With **Track Habit** on, a ⚡ streak counter appears, with streak celebrations and an "Amazing Week".

**Celebrations**
- Finishing a whole day's tasks triggers full-screen "emoji rain", sometimes with seasonal emoji.

**Rewards**
- One card per person, and one white card per reward.
- A reward shows a progress pill ("☆ 12/20") until it's affordable, then a solid "Redeem ⭐ 20" button.
- Costs range from 1 to 500 stars. A reward can renew after redeeming or be one-time.
- **There is no parent approval step.**
- Parents can give or remove stars with a before/after preview.

**Meals**
- A 7-day grid with up to 4 category rows (Breakfast, Lunch, Dinner, Snack), labeled with vertical text.
- Each cell is a big colored tile. Categories can be renamed, recolored, hidden, or shown on the calendar.
- Tapping a meal offers "Add to List" (ingredients go to the "Grocery List") and "Open Recipe".

**Recipes**
- A two-pane library with category filters.
- Buttons: Plan Meal, and Add to Grocery List.

**Lists**
- Columns tinted with each list's color. Each has a count badge, an "Add item" row and square checkboxes.
- Grocery lists have collapsible sections.
- Types are To-do, Grocery and Other. A list can be hidden from the wall display.
- "Clear completed", and AI "Organize" for groceries.

**Sidekick (AI)**
- **Magic Import:** forward an email, PDF or photo, get a draft to review, then add the events. An import can be undone.
- Also: meal planning ("what sounds good", which days, how many people, saved vs new recipes), fridge-photo recipes, list building, and an activity planner.

**Sleep**
- A schedule with From and To times, plus "Enter Sleep Mode Now". The screen goes black, and a tap wakes it.

**Parental Lock**
- A 4-digit PIN that can lock "Add" and/or "Modify". It re-locks after 1–10 minutes of inactivity.
- **Check-offs, lists and redemptions aren't locked.**

**Reminders**
- A popup with event and task rows and a chime. Events can remind at the start time and/or some minutes before; tasks remind when due.

**Settings**
- Display name, week start, weather address, °F/°C, text size (S/M/L), density (Cozy/Snug), Parental Lock, calendar options, reminders and add-ons.

**Voice**
- Skylight only supports **Alexa**, for adding to lists. There is no Siri or Google support.

## What Kunitz Coven deliberately does differently

- **No photo screensaver or photo uploads.** You chose to skip these.
- **No Disney Mode.** The characters are licensed. Kunitz Coven has generic emoji celebrations and emoji avatars instead.
- **Google Calendar is read-only.** You chose this. Events added in Kunitz Coven stay in Kunitz Coven.
- **Email import works differently.** Skylight gives each device an `@ourskylight.com` address. Kunitz Coven checks a mailbox you own instead, such as a dedicated Gmail account.
- **Voice is added on top.** Kunitz Coven offers Siri and Google Home voice check-offs, which Skylight doesn't have.
- **Phone access is a web app.** It's an installable web app on your phone rather than an App Store app.

## Hardware and voice findings

**Raspberry Pi** (October 2026 prices, after the RAM-driven increases)

| Board | Price |
|---|---|
| Pi 5 2GB | $77.50 |
| Pi 5 4GB | about $110 |
| Pi 4 2GB | $67.50 |

A Chromium kiosk fits comfortably in 2GB.

**Touchscreens, 12" and larger**

| Option | Price | Notes |
|---|---|---|
| Generic 15.6" 1080p capacitive portable monitor | about $100–130 | Touch works over USB-C only. Needs separate power. Usually no VESA holes. |
| Waveshare 15.6" (H) with case | about $167 | Built for the Pi. |
| Refurbished Dell P2418HT 24" touch | about $90–150 | Good value if 24" fits your wall. |

**Siri**
- Shortcuts' "Get Contents of URL" works over plain http to a local IP address.
- HomePod runs shortcuts through the owner's iPhone.
- One-tap shortcuts per chore are the most reliable option on HomePod.

**Google**
- Custom voice apps (Conversational Actions) were shut down in 2023.
- Google Home routines can't call a URL.
- The dependable route is Home Assistant with Nabu Casa, at $65/yr.
- Matter bridging is a free but unproven alternative.
