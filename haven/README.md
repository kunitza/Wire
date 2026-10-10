# Haven

A self-hosted family wall calendar and household hub, modelled on the Skylight Calendar, for personal use.
It runs on a Raspberry Pi with a touchscreen. Your phones use the same app in the browser.

**What it does**
- **Home:** calendar, today's tasks and lists on one screen.
- **Calendar:**
  - Schedule, Day, Week and Month views, with weather, countdowns and meals.
  - Read-only sync from Google Calendar.
  - Repeating events, with edit/delete for this event, this and following, or all.
- **Tasks:**
  - Chores and routines with stars.
  - Late chores carry over to the next day.
  - "Up For Grabs" chores, skips, and habit streaks.
  - Celebrations when kids finish their day.
- **Rewards:** kids redeem stars for rewards. Parents can give or remove stars.
- **Lists:** color-coded, with sections. AI "Organize" sorts a grocery list into store aisles.
- **Meals and recipes:**
  - Weekly meal grid with recipes.
  - Ingredients go to the grocery list in one tap.
- **Sidekick (AI, powered by Claude):**
  - Turns school emails, PDFs and photos of flyers into calendar events. You review them before they're added.
  - Plans meals and writes recipes, including from a photo of your fridge.
  - Builds lists and suggests activities.
- **Voice:** "Hey Siri / Hey Google, Emma finished the dishes". Voice can only do kid-safe actions: check off, undo, "what's left", stars and kitchen timers.
- **Kitchen timers:** several named timers at once, set by touch, voice or Claude. They ring on the wall display until dismissed.
- **Repeatable chores:** e.g. "Read a book", up to 3 times a day, with stars each time.
- **Weather:** tap the weather for a 10-day forecast with hourly detail.
- **Claude connector:** ask Claude Code or Claude Desktop on your home computer things like "what's on Thursday?" or "add milk to the grocery list".
- **On-screen keyboard:** a big touch keyboard on the wall display.
- **Parental Lock:** a 4-digit PIN. Kids can still check things off, use lists and redeem rewards.
- **Sleep Mode:** the screen turns off overnight.
- **Reminders:** popups with a chime.
- **Backups:** automatic, every night.

---

## 1. Hardware (about $210–255)

| Part | Suggested | ~Price |
|---|---|---|
| Computer | Raspberry Pi 5 **2GB** (plenty for this) | $77.50 |
| Power / case / storage | Official 27W USB-C PSU, case, 32GB microSD | $35–45 |
| Screen | 15.6" 1080p **capacitive touch** portable monitor (InnoView/CUNPU/Kenowa type), or Waveshare 15.6" (H) | $100–170 |

**Connecting the touchscreen**
- Use an HDMI cable for the picture.
- Use a USB-A to USB-C cable from the Pi to the monitor's USB-C port for touch. On most portable monitors touch only works over USB.
- Power the monitor with its own USB-C charger. The Pi can't power it at full brightness.
- Most portable monitors have no VESA holes. Use a 3D-printed bracket or strong adhesive strips to mount it.

A non-touch monitor also works. In that case use your phone, or voice, to check things off.

## 2. Install on the Raspberry Pi

1. Flash **Raspberry Pi OS (64-bit, with desktop)** with Raspberry Pi Imager.
   - In the Imager settings, set your Wi-Fi, a username, and your **time zone**.
2. Boot the Pi, open a terminal and run:
   ```bash
   git clone https://github.com/kunitza/wire.git haven-app
   cd haven-app/haven
   ./deploy/install.sh
   sudo reboot
   ```
3. After the reboot the screen opens Haven full-screen, and a short setup wizard walks you through:
   - adding your family
   - your location (for weather)
   - Google Calendar
   - a parent PIN

**What the installer does**
- Installs Node.js 22 and Chromium.
- Builds the app.
- Runs it as a background service that starts on boot (`haven.service`).
- Opens the full-screen display when the Pi logs in.
- Turns off screen blanking.
- Sets up Sleep Mode to switch the monitor off.

It's safe to re-run, and it never deletes your data.

| Task | Command |
|---|---|
| Update to the latest version | `./deploy/update.sh` |
| View logs | `journalctl -u haven -f` |
| Restart | `sudo systemctl restart haven` |
| Edit settings (port, time zone, API key) | `sudo nano /etc/haven.env`, then restart |

**Your data**
- Everything lives in `haven/data/haven.db`, a SQLite file.
- Nightly backups go in `haven/data/backups/` (the last 14 are kept).
- *Settings → Backup* also downloads a copy.

## 3. Phones (parents)

1. On the same Wi-Fi, open `http://<pi-name>.local:8080` (or the Pi's IP address) in Safari or Chrome.
2. Choose **Add to Home Screen**. You now have an app icon with a phone-sized layout.
3. If Parental Lock is on, unlock once and tick **Remember this device**, so your phone stays unlocked.

**Access away from home (optional, free):**
1. Install [Tailscale](https://tailscale.com) on the Pi (`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`) and on your phones.
2. Use the Pi's Tailscale address instead.

Don't expose Haven directly to the internet.

## 4. Google Calendar (read-only)

1. In Google Calendar on a computer, open *Settings → (your calendar) → Integrate calendar*.
2. Copy **Secret address in iCal format**.
3. In Haven, open *Settings → Calendars → Add*. Paste the address and pick whose calendar it is.
4. Repeat for each calendar you want to show.

Haven syncs every 10 minutes. Google can take a few hours to publish changes to this feed, which is a Google limitation.

## 5. Sidekick (AI)

Sidekick needs an **Anthropic API key**. A Claude.ai Pro or Max subscription can't be used by other apps.

1. Create a key at [console.anthropic.com](https://console.anthropic.com).
2. Paste it in *Settings → Sidekick*.
3. Set a monthly budget there ($5 default). Typical family use costs well under that.

**Forward-to-calendar email (optional)**
1. Create a dedicated Gmail address and an **app password** for it.
2. Enter them in *Settings → Email import*.
3. Forward school emails to that address. Put names in the subject ("Emma, Jake") to assign the events.

## 6. Voice (Siri and Google Home)

See [docs/VOICE.md](docs/VOICE.md). In short:
- **Siri:** free. A Shortcut sends your phrase to Haven, and Siri speaks the reply.
- **Google Home Mini:** Google no longer allows custom voice apps. The route is Home Assistant with its cloud add-on (about $65/yr), and Haven generates the Home Assistant config for you.

## 7. Claude connector (optional)

*Settings → Claude connector* lets Claude read and update Haven.

**What Claude can do**
- Read: calendar, chores, lists, meals, stars, weather.
- Add: events, chores, list items, meals, timers.
- It can't delete anything or change settings.

**How it connects**
- It uses a token you can turn off or regenerate at any time.
- **Claude Code:** copy the one-line `claude mcp add …` command shown there.
- **Claude Desktop:**
  1. Download `haven-mcp.mjs` from that page.
  2. Paste the config snippet it shows into Claude Desktop's config file.
  3. Claude Desktop needs Node.js installed.
- It only works from computers on your home network or Tailscale. The Claude phone and web apps can't reach a home network, and that's on purpose.

## 8. Security notes

- **Allowed addresses.** Haven only answers to IP addresses and home-network names (`*.local`, `*.lan`, Tailscale `*.ts.net`). This blocks "DNS rebinding" attacks from websites. If you open Haven under another name, add it to `HAVEN_ALLOWED_HOSTS=` in `/etc/haven.env`.
- **Turn Parental Lock on once things are set up.** It also protects the secrets: the API key, the email password, the voice and Claude tokens, and the backup download.
- **PIN guessing is slowed down.** After 5 wrong PINs, entry pauses for 1 minute, then 2, 4… up to an hour.
- **Email imports wait for review unless the sender is trusted.** Mail from senders not on your *Allowed senders* list stays in Sidekick until you approve it.

## 9. Reset a forgotten PIN

On the Pi, run:

```bash
cd ~/haven-app/haven && npm run reset-pin && sudo systemctl restart haven
```

This turns Parental Lock off. Set a new PIN in Settings.

## Development

```bash
npm install
npm run seed:demo        # demo family in ./data
npm run dev              # API on :8080, web app on :5173
npm test                 # server tests
npm run test:e2e         # browser tests (Playwright)
npm run build && npm start
```

- **Stack:** Node 22 (Fastify, built-in SQLite), React 19 + Vite, TypeScript.
- **Live updates:** a server-sent event stream keeps the wall display and phones in sync instantly.

See [docs/RESEARCH.md](docs/RESEARCH.md) for the Skylight research this is based on, and [docs/PARITY.md](docs/PARITY.md) for a feature-by-feature comparison.
