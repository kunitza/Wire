# Haven vs. Skylight Calendar: feature checklist

**Legend**
- ✅ matches Skylight
- ➕ Haven adds something Skylight doesn't have
- 🔸 works, but differently
- ❌ not built (by choice)

**How each feature was verified**
- **Automated:** covered by the test suite. That's 55 server tests (`npm test`) and 12 browser tests (`npm run test:e2e`) driving the real app in Chromium.
- **Visual:** checked by comparing screenshots against Skylight's own help-center screenshots at 1920×1080, 1280×800 and phone size.

## Home and calendar (#1–6)

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | **Home screen** | ✅ | Calendar panel with any view, Today's Tasks (2×2 profile cards), Lists (2 cards), Customize to show or hide panels |
| 2 | **Calendar views** | ✅ | See the breakdown below |
| 2 | Weather | ✅ | In the header and on calendar days |
| 2 | Countdown and progress bar | ✅ | Rotating countdowns plus per-person task progress rings |
| 2 | Filter | ✅ | Task progress, weather, meals, countdowns, per profile. Usable while locked. |
| 2 | Display options | ✅ | Shade weekends, dim past events, multi-profile diagonal colors, start week on Sun/Mon, "start on current day/week" |
| 3 | **Profiles and labels** | ✅ | Name, color (presets or custom), emoji avatar or initial, birthday. Labels for "what" calendars. Reorder. Deleting removes items that belonged only to that profile. |
| 3 | Profile photos and hats | 🔸 | Emoji avatars instead of uploaded photos |
| 4 | **Google Calendar sync** | 🔸 | Read-only, as requested, via the private iCal address. Syncs every 10 min. Handles repeating events, moved and cancelled occurrences, and daylight saving. Google can take a few hours to publish changes to this feed. |
| 4 | Two-way sync, Outlook/iCloud | 🔸 | Any iCal (ICS) feed works read-only, including iCloud and Outlook. Two-way sync is not built. |
| 5 | **Add/edit events** | ✅ | See the breakdown below |
| 5 | Invite people by email | ❌ | Not built |
| 6 | **Countdowns** | ✅ | Toggle on any event. Emoji is guessed automatically and can be changed. "Show countdowns" window setting. |

**Calendar views (#2)**
- **Schedule:** 1–7 days, hour grid, current-time line, all-day lanes.
- **Day:** mini month alongside the event list.
- **Week:** 4×2 grid with a "Next Week" tile.
- **Month:** chips, "N more", continuous multi-day bars.

**Event fields (#5)**
- Title, all-day, start and end, profiles.
- Repeat: every N days/weeks/months/years, chosen weekdays, repeat-until.
- Location, notes, per-event reminder, countdown.
- Editing and deleting a repeating event asks "This event / This and following / All events".

## Kids and tasks (#7–10)

| # | Feature | Status | Notes |
|---|---|---|---|
| 7 | **Chore chart** | ✅ | See the breakdown below |
| 8 | **Routines** | ✅ | See the breakdown below |
| 9 | **Stars and rewards** | ✅ | See the breakdown below |
| 9 | Disney celebrations | ❌ | Licensed characters, so not copied |
| 10 | **Voice check-off** | ➕ | Siri Shortcuts (free) and Google Home via Home Assistant (about $65/yr). Kid-safe only: check off, undo, what's left, stars, and optionally "add to list". Skylight only supports Alexa for lists. |

**Chores (#7)**
- **Columns:** one per person, plus Up For Grabs.
- **Fields:** emoji, description, stars, due date and time.
- **Repeats:** on a schedule, or a set time after completion.
- **Late chores:** roll over until done.
- **Actions:** skip and unskip; delete this one, all future, or all.
- **Week view:** a grid of check circles per task and day.
- **Task Box:** a library of preset chores.

**Routines (#8)**
- Morning, Afternoon and Evening.
- Only the current part of the day is shown; the ring buttons show progress and toggle each section.
- Habit streaks (⚡), with streak milestone and "Amazing Week" celebrations.
- Emoji rain when someone finishes the whole day.

**Stars and rewards (#9)**
- One card per person.
- Progress pill, then a "Redeem ⭐ N" button once affordable. Rewards can renew or be one-time.
- Give or remove stars with a before → after preview, plus a history ledger.
- Optional parent approval for redemptions. Skylight has no approval step, so this is off by default.

## Household (#11–15)

| # | Feature | Status | Notes |
|---|---|---|---|
| 11 | **Lists** | ✅ | Color-coded columns; To-do/Grocery/Other; sections; check, undo, edit, move, drag reorder; clear completed; hide on wall display |
| 11 | Send to Instacart/AnyList | ❌ | Not built |
| 12 | **Meal planner** | ✅ | 7-day grid with up to 4 renamable/recolorable categories; repeating meals; "Add to List" sends ingredients to the Grocery List; meals on the calendar per category |
| 12 | Recipe box | ✅ | Two-pane library, categories, favorites, search, Plan Meal, Add to Grocery List |
| 13 | **AI meal ideas and recipes** | ✅ | Sidekick meal planner: meal type, "what sounds good", days, servings, saved/new/both, review before saving. Recipes from an idea, a fridge photo or a link. |
| 14 | **Magic Import** | ✅ | Photo, PDF, pasted text or forwarded email. Editable draft review, then Add to Calendar, plus Undo Import. Names in the email subject assign profiles. |
| 14 | Import email address | 🔸 | Haven checks a mailbox you own (e.g. a dedicated Gmail) instead of an `@ourskylight.com` address |
| 15 | **AI list builder** | ✅ | Plus AI "Organize" to sort a grocery list into aisles and remove duplicates, and an activity planner |

## Display and control (#16–21)

| # | Feature | Status | Notes |
|---|---|---|---|
| 16–17 | **Photo screensaver and uploads** | ❌ | Skipped at your request |
| 18 | **Sleep mode** | ✅ | Daily schedule plus "Enter Sleep Mode Now". Tap to wake. On the Pi the monitor is actually switched off. |
| 19 | **Parental Lock** | ✅ | See the breakdown below |
| 20 | **Fun mode** | 🔸 | Seasonal emoji rain and emoji avatars instead of Disney Mode |
| 21 | **Phone companion** | 🔸 | An installable web app (Add to Home Screen) rather than an App Store app. Same features; bottom tab bar; stays in sync live. |
| — | Reminders | ✅ | Popup with a chime for events (at time and/or minutes before) and timed chores |
| — | Display settings | ✅ | Text size Small/Medium/Large, density Cozy/Snug, 12/24h, °F/°C, display name instead of date |
| — | Backups | ➕ | Nightly automatic database backups (keeps 14), plus Download Backup |
| — | Kitchen timers | ➕ | Several named timers. Set by touch, Siri or Claude. They ring and flash on the wall display until dismissed, with +1 minute, pause and resume. |
| — | Repeatable chores | ➕ | "Up to N times a day" chores with stars each time, a progress ring, and "undo one" |
| — | Hourly weather | ➕ | Tap the header or a calendar day's weather for a 10-day forecast, hourly detail, sunrise and sunset |
| — | Claude connector | ➕ | MCP server for Claude Code and Claude Desktop on the home network, with a token and household-only tools |
| — | On-screen keyboard | ➕ | Big touch keyboard on the wall display, since the Pi has no physical keyboard |
| — | Data ownership | ➕ | Everything stays on your Pi. No subscription. AI costs pennies per use from your own API key, with a monthly budget cap. |

**Parental Lock (#19)**
- 4-digit PIN.
- Lock "Add" and/or "Modify".
- Re-locks after 1–10 minutes of inactivity.
- Kids can always check off tasks, use lists and redeem rewards.
- "Remember this device" for parents' phones.
- If you forget the PIN, run `npm run reset-pin` on the Pi.

## Things only real hardware can confirm

These depend on the Pi and your accounts, so they couldn't be tested in the build environment:
- `deploy/install.sh` on Raspberry Pi OS
- the full-screen display starting at boot
- turning the monitor off during Sleep Mode (`wlr-randr`)
- touch input on your specific monitor
- live calls to Claude (they need your API key)
- live Google feeds and IMAP email
- Siri and Google Home voice setups

The code paths behind all of them are covered by automated tests that use local stand-ins:
- a sample Google `.ics` feed
- a mock Claude API server that checks every request
- simulated voice phrases
