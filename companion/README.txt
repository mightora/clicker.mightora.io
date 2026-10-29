MIGHTORA CLICKER — DESKTOP COMPANION
===================================

This tool lets your paired phone press the four arrow keys on your computer.
Only run it on a computer you own or are authorised to control.

WINDOWS
-------
NO PYTHON OPTION: If Windows permits local PowerShell scripts, right-click
clicker-windows.ps1 and choose Run with PowerShell. This uses built-in Windows
features. If your organisation restricts script execution, do not bypass its
policy; use the downloadable standalone Windows executable instead.

PYTHON OPTION:
1. Install Python 3.10+ from https://www.python.org/downloads/windows/
   Enable "Add Python to PATH" during installation.
2. Double-click setup-windows.bat in this extracted folder.
3. Allow it to install the two required dependencies.
4. On the Clicker website, click "Copy private connection code" and paste it
   into the companion terminal.
5. Click back into your full-screen presentation before using the phone.

MACOS / LINUX
-------------
1. Install Python 3.10 or newer.
2. Open Terminal in this extracted folder.
3. Run: sh setup-mac-linux.sh
4. Paste the private code shown on the Clicker website.
5. Return focus to your slide application.
6. macOS: grant Terminal or the companion Accessibility permission in System Settings.
   Linux: X11 desktops work best; Wayland may prevent simulated keys.

MANUAL COMMANDS (ALL SYSTEMS)
-----------------------------
python -m pip install -r requirements.txt
python clicker.py

If you downloaded the .py file on its own instead of this ZIP:
python -m pip install 'websockets>=14,<17' 'pynput>=1.8,<2'
python mightora-clicker.py

KEEPING YOUR SESSION PRIVATE
----------------------------
Do not share your computer's private connection code or QR pairing link.
Sessions automatically expire after two hours, or you can end them at the site.
The companion only receives four arrow commands; it cannot run arbitrary code.

TROUBLESHOOTING
---------------
"No module named websockets/pynput": run the setup script to install dependencies.
"Python was not found": install Python 3.10+ and reopen Terminal.
macOS keys not moving slides: grant Accessibility permissions.
No arrow response: focus your presentation window and check both devices show
the session as connected.

Project: https://github.com/mightora/clicker.mightora.io
Licence: MIT (see LICENSE).
