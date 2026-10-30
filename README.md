# Mightora Clicker

A free, open-source presentation remote. Open the website on your computer, start a session, scan its QR code from your phone, and use **left**, **right**, **up** and **down** to control the presentation. Hosted at `https://clicker.mightora.io` using Cloudflare Workers and Durable Objects.

## Why a desktop companion is necessary

Browsers are intentionally forbidden from injecting trusted keyboard events into other desktop applications. The website displays the QR code and manages the secure pairing; the lightweight desktop companion receives arrow events and presses the corresponding OS keys on the computer. **Without this companion, tapping the phone buttons cannot advance native PowerPoint, Keynote, PDFs, etc.** The companion is required for the supported workflow.

## Presenter quick start

1. Open `https://clicker.mightora.io` on the presentation computer. At **Step 1**, choose Windows, Mac or Linux and download a desktop helper. No app is required on the phone.
2. Start the helper. At **Step 2** on the website, select **Start a clicker session**, then use the large **Copy private connection code** button. Paste that full code into the helper when prompted. The code is masked on screen until you select **Show**; it has two long parts separated by a dot. There is no six-character reference to copy.
3. Return focus to PowerPoint, Keynote, Google Slides or your presentation program.
4. At **Step 3**, scan the QR code using the phone's camera, wait for **Connected**, and tap the arrows.
5. End the session using the computer website after presenting.

### Run the companion from source

Python 3.10 or newer is required. On Windows, macOS or Linux:

```bash
python -m pip install -r companion/requirements.txt
python companion/clicker.py
```

For compatibility, the Python helper also accepts `--code PRIVATE_CODE`, but that exposes the secret in your shell history and process arguments. Running it without `--code` and pasting into the prompt is recommended.

On macOS, allow the companion (Terminal or executable) **Accessibility** access to send keys. On Linux, `pynput` typically requires an X11 session; Wayland support depends on the desktop environment and may not be available. The companion does not work on locked desktops. Use the GitHub Actions **Desktop companion executables** workflow to build stand-alone binaries for all three platforms. Version tags beginning with `v` publish the downloads under GitHub Releases. Unsigned executables may require OS approval.

Do not share the private connection code. The phone QR is also a bearer credential; only show it to people you want to be able to operate the clicker.

### Download without Python

The website has a **Get your computer ready** section immediately after the introduction, with simple Windows, Mac and Linux choices, illustrated setup steps and a separate panel for alternative downloads:

1. **Portable Windows EXE (recommended):** [download the latest Windows EXE](https://github.com/mightora/clicker.mightora.io/releases/latest/download/mightora-clicker-windows.exe). No Python, installer or administrator permissions are required to *download* it, although device policies may block execution of unsigned apps. Open it and paste the private connection code when prompted.
2. **Portable macOS/Linux executables:** choose your OS on the website, or visit the [latest public release](https://github.com/mightora/clicker.mightora.io/releases/latest). macOS may require Accessibility permissions; on Linux the executable bit may need to be set and X11 generally works best.
3. **Windows PowerShell:** download the [Windows script](https://clicker.mightora.io/downloads/clicker-windows.ps1), which uses built-in Windows capabilities. Right-click and choose **Run with PowerShell** if your computer permits it. Respect your organisation's execution policy.
4. **Python helper ZIP**: download the complete [starter ZIP](https://clicker.mightora.io/downloads/clicker-companion.zip). Extract and run `setup-windows.bat` on Windows or `sh setup-mac-linux.sh` in a macOS/Linux terminal. The ZIP installs Python dependencies into a private `.venv`, without changing global packages. Alternatively download [just the Python script](https://clicker.mightora.io/downloads/clicker.py).

If downloading the Python script on its own, install dependencies first: `python -m pip install "websockets>=14,<17" "pynput>=1.8,<2"`, then run `python mightora-clicker.py`.

### Windows safety and code signing

**The public portable EXE is currently unsigned.** Windows SmartScreen and some organisation policies may warn about or block it. This is expected for an unfamiliar unsigned executable, not evidence that it is safe or unsafe. Do not bypass your organisation's protections. Verify the [release checksums](https://github.com/mightora/clicker.mightora.io/releases/latest) and inspect the public source. Every release includes `SHA256SUMS.txt` for the binary files.

The desktop release workflow now includes **Microsoft Azure Artifact Signing** with short-lived GitHub OIDC authentication, signature and timestamp verification, and a fail-closed signing gate. It will start signing Windows releases once the publisher completes Azure identity verification and configures the account, certificate profile and GitHub Actions variables. Until then, public downloads remain explicitly unsigned. A signature provides publisher identity and file integrity, not a guarantee of safety or immediate SmartScreen approval. See the step-by-step [Azure activation guide](docs/RELEASING.md).

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

The `wrangler.jsonc` includes a declarative SQLite Durable Object export. Cloudflare deploys the Worker and provisions the room binding. Attach a **Workers Custom Domain** of `clicker.mightora.io` to the `mightora-clicker` Worker in Cloudflare. Keep HTTPS enforced.

The GitHub Actions deployment needs repository secrets:

- `CLOUDFLARE_API_TOKEN` — token with Workers Scripts edit and related permissions.
- `CLOUDFLARE_ACCOUNT_ID` — the correct Cloudflare account ID.

Build, security audit and CodeQL workflows are included. Each successful push to `main` builds and tests all three portable companions, creates SHA-256 checksums, and publishes a versioned [GitHub Release](https://github.com/mightora/clicker.mightora.io/releases). Windows signing is optional until activated; once enabled, a signing error blocks publication, while each release states whether the actual Windows EXE was signed. The release is gated on automated tests and dependency auditing. Avoid describing badges as independent certifications or a guarantee of security.

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
