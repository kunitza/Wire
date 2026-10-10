# Voice control: Siri and Google Home

Voice is for **kids' check-offs**. On purpose, it can only do these things:

| Say | What happens |
|---|---|
| "Emma finished the dishes" / "Jake fed the dog" | Checks off the matching chore or routine for today and says how many stars they have |
| "Emma finished her morning routine" | Checks off every item in that routine |
| "What does Jake have left?" | Lists today's unfinished tasks |
| "How many stars does Emma have?" | Says the balance |
| "Undo Emma dishes" | Unchecks it |
| "Add milk to the grocery list" | Only works if a parent turns on *Settings → Voice → Allow adding to lists* |
| "Set a 12 minute pasta timer" / "Set a timer for an hour and a half" | Starts a kitchen timer, which rings on the wall display |
| "How much time is left on the pasta timer?" | Says the time left |
| "Cancel the pasta timer" / "Stop the timer" | Cancels it, or silences one that's ringing |

Voice can't add, edit or delete events, chores or rewards, and it can't change settings.

The Google Home routes need a Home Assistant script for each phrase. For timers it's often easier to use the Google speaker's own built-in timers, and Kunitz Coven's timers through Siri.

**The voice token**
- Requests are protected by a secret **voice token**. Find it in *Settings → Voice*, where you can also regenerate it.
- Kunitz Coven must be reachable from the phone or speaker. That means your home Wi-Fi, or Tailscale when away from home.
- Use the Pi's **IP address** (e.g. `http://192.168.1.50:8080`), not a `.local` name. HomePods and Shortcuts can be unreliable with `.local` names.

To check a phrase without a phone, use *Settings → Voice → Test a phrase*.

---

## Siri (free)

### Option A: one "Chore done" shortcut that understands any phrase (iPhone)

1. Open **Shortcuts**, tap **+**, and name the shortcut **"Chore done"**.
2. Add these actions:
   1. **Dictate Text**.
   2. **Get Contents of URL**:
      - URL: `http://<pi-ip>:8080/api/voice/command`
      - Method: **POST**
      - Headers: `X-Coven-Token` = *your token*
      - Request Body: **JSON**, key `text` = *Dictated Text*
   3. **Get Dictionary Value**: `speech` from *Contents of URL*.
   4. **Speak Text**: *Dictionary Value*.
3. Say **"Hey Siri, chore done"**, then "Emma finished the dishes".

### Option B: one-tap shortcuts per kid and chore (iPhone, HomePod, Apple Watch)

This version is more reliable on HomePod because there's no follow-up question.

1. Duplicate the shortcut above.
2. Replace *Dictate Text* with a **Text** action containing, for example, `Emma finished dishes`.
3. Name the shortcut the phrase you'll say, e.g. **"Emma dishes done"**.

On HomePod, shortcuts run through the iPhone of the person who set up Personal Requests. That iPhone must be on the same Wi-Fi.

---

## Google Home / Nest Mini

**Why Google needs a helper**
- Google shut down custom voice apps in 2023.
- Google Home routines can only control smart-home devices, not call a web address.
- So Kunitz Coven appears to Google as "devices", one per kid's chore, through **Home Assistant**.

### Recommended: Home Assistant + Home Assistant Cloud (about $65/year, 31-day free trial)

1. **Install Home Assistant.**
   - Easiest is a second Pi or an old laptop. You can also run the Docker container on the same Pi 5, though 4GB+ is recommended for that.
   - See home-assistant.io/installation.
2. **Turn on Home Assistant Cloud.** Sign up for Nabu Casa (renamed "Home Assistant Link" in Dec 2026). Under *Settings → Voice assistants*, enable **Google Assistant**.
3. **Add Kunitz Coven's scripts to Home Assistant.**
   1. In Kunitz Coven, open *Settings → Voice* and copy the generated **Home Assistant YAML**. It contains your token and one script per kid and chore.
   2. Paste it into Home Assistant's `configuration.yaml`.
   3. Restart Home Assistant.
4. **Expose the scripts to Google.** In Home Assistant: *Settings → Voice assistants → Expose*, then expose the `Kunitz Coven …` scripts.
5. **Link the account.** In the **Google Home** app: *+ → Works with Google → Home Assistant Cloud*, and link your account.
6. **Create a routine for each phrase.** In the Google Home app: *Automations → +*.
   - **Starter:** *When I say to Google Assistant* → "Emma finished dishes".
   - **Action:** *Adjust home devices* → **Kunitz Coven Emma Dishes** → *Turn on*.
   - Tip: add a second action, *Broadcast*, saying "Great job Emma!"

Re-copy the YAML whenever you add new chores. Each chore and kid pair needs its own script.

### Free alternative: manual Home Assistant + Google setup

Home Assistant's *Google Assistant (manual)* integration does the same thing without the subscription.
- It needs a Google Cloud project and an HTTPS address reachable from the internet, for example a Cloudflare Tunnel.
- Expect 2–3 hours of setup.
- Guide: home-assistant.io/integrations/google_assistant.

### Things to know

- **Who can trigger routines:** Google Home routines may only respond to members of your Google home. Add kids under *Google Home → Household*.
- **Gemini:** Google's move to "Gemini for Home" is still rolling out. Routines with custom starter phrases still work as of late 2026.
