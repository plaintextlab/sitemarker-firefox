# Site Marker (Firefox extension)

Mark any site's domain with a label (Fraud / Scam / Suspicious / Note) plus a
free-text reason. Next time you land on that domain, a red banner appears
on the page and the toolbar icon gets a badge.

## Load it (temporary, for testing)

1. Open `about:debugging` in Firefox
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on...**
4. Select `manifest.json` inside this folder

The extension will stay loaded until you close Firefox. To make it permanent
you'd need to sign it via Mozilla's addon developer hub (free, but adds a
review step) — fine to skip while you're just using it for yourself.

## Use it

- Click the toolbar icon on any site to mark it
- Pick a label, optionally add a note, click "Mark site"
- Revisit that domain later -> red banner + badge shows up automatically
- Click the icon again to remove a mark, or manage the full list

## Notes / limitations

- Matching is **by hostname**, not full URL. Marking `example.com` flags
  every page under that domain, including subpaths. This is deliberate —
  fraud sites are rarely worth remembering at the URL level.
- Two storage backends, chosen per-save via radio buttons:
  - **Local** — `browser.storage.local` with the `unlimitedStorage`
    permission, capped only by disk space. Stays on this machine.
  - **Sync** — `browser.storage.sync`, tied to your Firefox Account.
    Each site is stored under its own key (`site:<hostname>`), not one
    big blob, because `sync` caps each *individual item* at 8,192 bytes
    separately from the 100KB total quota — one key per site lets your
    list fill the full 100KB instead of hitting a wall around 20-30 sites.
  - **The radio only decides where the *next* save goes.** Toggling it
    does not move marks you already saved under the other backend — a
    site keeps living wherever it was last saved until you open its
    popup and click "Mark site" again with the other radio selected.
    The list at the bottom tags each site `local` or `sync` so you can
    see where it actually is.
  - Reading/checking a site (the banner, the badge, pre-filling the
    popup) always checks both backends, so nothing disappears just
    because the radio is on the "wrong" setting.
- Notes are capped at 280 characters, enforced in the textarea and in code.
- Both radio labels show live numbers (`getBytesInUse` / `QUOTA_BYTES`):
  local shows KB used so far, sync shows KB free out of 100KB.
- `storage.sync` also throttles writes: roughly 120/minute and 1800/hour
  in Firefox. Irrelevant for occasional manual marking, but don't wire
  this up to anything that marks sites automatically and rapidly.
- `storage.sync` silently behaves like local-only storage if you aren't
  signed into a Firefox Account under Sync — no error is thrown.
- The banner injection silently no-ops on privileged pages (`about:`,
  `addons.mozilla.org`, etc.) — Firefox blocks content-script injection
  there regardless of permissions.
