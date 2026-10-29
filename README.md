# Mightora Clicker

A free, open-source presentation remote. Open the website on your computer, start a session, scan its QR code from your phone, and use **left**, **right**, **up** and **down** to control the presentation. Hosted at `https://clicker.mightora.io` using Cloudflare Workers and Durable Objects.

## Why a desktop companion is necessary

Browsers are intentionally forbidden from injecting trusted keyboard events into other desktop applications. The website displays the QR code and manages the secure pairing; the lightweight desktop companion receives arrow events and presses the corresponding OS keys on the computer. **Without this companion, tapping the phone buttons cannot advance native PowerPoint, Keynote, PDFs, etc.** The companion is required for the supported workflow.

## Presenter quick start

1. Open `https://clicker.mightora.io` on the presentation computer and select **Start a clicker session**.
2. Run the desktop companion below, copy the **private connection code** on the website, and paste it into the companion.
3. Return focus to PowerPoint, Keynote, Google Slides or your presentation program.
4. Scan the QR code using the phone's camera, wait for **Connected** and tap the arrows.
5. End the session using the computer website after presenting.

### Run the companion from source

Python 3.10 or newer is required. On Windows, macOS or Linux:

```bash
python -m pip install -r companion/requirements.txt
python companion/clicker.py
```

On macOS, allow the companion (Terminal or executable) **Accessibility** access to send keys. On Linux, `pynput` typically requires an X11 session; Wayland support depends on the desktop environment and may not be available. The companion does not work on locked desktops. Use the GitHub Actions **Desktop companion executables** workflow to build stand-alone binaries for all three platforms; unsigned executables may require OS approval.

Do not share the private connection code. The phone QR is also a bearer credential; only show it to people you want to be able to operate the clicker.

## How it works

- `POST /api/sessions` creates a new independent Durable Object room and returns strong random, separate host and phone tokens.
- The room stores only SHA-256 hashes of those tokens and an expiry (two hours). It never stores command history or slides.
- The host website, desktop companion and phone connect over encrypted WebSockets and authenticate immediately.
- Only four allowlisted arrow commands are broadcast from the remote to the authenticated computer hosts. The relay limits each remote to twelve commands per second.
- At most one phone remote is active per session. A new connection with the QR displaces the previous one.
- Closing or expiring a session revokes tokens and disconnects both ends.
- The system has no user accounts, cookies or visitor identifiers. It uses no ad or analytics scripts.

This is a convenience clicker, **not** a remote administration tool: it cannot type arbitrary text, run scripts, control the mouse or send other keys.

## Build and deploy to Cloudflare

Requirements: Node.js 22+, a Cloudflare account with Workers and Durable Objects enabled, and Wrangler.

```bash
npm test
npm run build
npx wrangler deploy
```

The `wrangler.jsonc` includes a SQLite Durable Object migration. Cloudflare deploys the Worker and provisions the room binding. Attach a **Workers Custom Domain** of `clicker.mightora.io` to the `mightora-clicker` Worker in Cloudflare. Keep HTTPS enforced.

The GitHub Actions deployment needs repository secrets:

- `CLOUDFLARE_API_TOKEN` — token with Workers Scripts edit and related permissions.
- `CLOUDFLARE_ACCOUNT_ID` — the correct Cloudflare account ID.

Build and security workflows are included. Tag `v1.0.0` or run the desktop packaging workflow to produce binaries. Review the artifacts before publishing them as a release.

## Development and testing

```bash
npm test       # builds and tests token handling, relay controls, assets
npm run check  # JS syntax and companion Python syntax
```

The local build is a single self-contained Worker module at `dist/worker.mjs`. QR generation is client-side and uses a vendored copy of `qrcodejs` (MIT). To test connected clients end-to-end, deploy to a test Worker or use local Wrangler development with Durable Objects.

## Limitations and privacy

- **Internet required.** The two devices connect to Cloudflare to exchange commands. A complete offline edition is not technically possible for this architecture.
- Cloudflare processes requests and WebSocket metadata. This tool does not deliberately retain IP addresses, personal details, slide content or individual keypresses.
- The public interface loads official Mightora shared UI from jsDelivr and branding images from the documented Mightora sources. Inspect browser network activity with F12 → Network and Preserve log.
- The default page has no general keyboard injection capability. Only the separately authorised desktop companion can press OS keys. Leave the companion running while presenting and terminate it afterward.
- The 2-hour hard expiry is not extended by activity. Start a fresh session for a long event.

## Third-party acknowledgements

- [QRCode.js by davidshimjs](https://github.com/davidshimjs/qrcodejs), MIT-licensed, vendored as `src/qrcode.min.js`.
- [pynput](https://github.com/moses-palmer/pynput) and [websockets](https://github.com/python-websockets/websockets), used by the desktop companion.

The application is MIT licensed. See [LICENSE](LICENSE).
