#!/usr/bin/env python3
"""Mightora Clicker desktop companion. Sends paired arrow commands to the active app.

Install: python -m pip install -r requirements.txt
Run:     python clicker.py
"""
from __future__ import annotations

import argparse
import getpass
import json
import re
import ssl
import sys
import time
from urllib.parse import urlparse

CODE_PATTERN = re.compile(r'^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32})$')


def websocket_url(server: str, room: str) -> str:
    parsed = urlparse(server)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Server must be a valid https:// or http:// URL')
    if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Enter a server origin without a path or query')
    scheme = 'wss' if parsed.scheme == 'https' else 'ws'
    return f'{scheme}://{parsed.netloc}/api/rooms/{room}/ws'


def run(server: str, code: str) -> None:
    match = CODE_PATTERN.fullmatch(code.strip())
    if not match:
        if re.fullmatch(r'[A-Za-z0-9_-]{6}', code.strip()):
            raise ValueError('That is the six-character session reference, not the private connection code. On the website, click "Copy private connection code" and paste the FULL value (two long parts separated by a dot).')
        raise ValueError('Invalid connection code. Copy the entire private code from the computer website.')
    room, token = match.groups()
    address = websocket_url(server, room)
    # Import after validating command-line input so --help and helpful errors
    # work even before the optional Python dependencies are installed.
    try:
        from pynput.keyboard import Controller, Key
        from websockets.sync.client import connect
        from websockets.exceptions import ConnectionClosed
    except ImportError:
        print('Missing dependencies. Run: python -m pip install -r requirements.txt', file=sys.stderr)
        raise SystemExit(2)
    keys = {
        'ArrowUp': Key.up,
        'ArrowDown': Key.down,
        'ArrowLeft': Key.left,
        'ArrowRight': Key.right,
    }
    keyboard = Controller()
    delay = 1
    print('Connecting to your Mightora Clicker session…')
    print('Only the four arrow keys are accepted. Press Ctrl+C to disconnect.')
    print('Focus your presentation window after the companion connects.\n')

    while True:
        try:
            # max_size limits what the companion will accept from the relay.
            with connect(address, open_timeout=12, max_size=1024, ssl=ssl.create_default_context() if address.startswith('wss:') else None) as socket:
                socket.send(json.dumps({'type': 'auth', 'role': 'host', 'token': token}))
                response = json.loads(socket.recv(timeout=10))
                if response.get('type') != 'ready':
                    raise RuntimeError('Authentication failed or session expired')
                socket.send(json.dumps({'type': 'host_info', 'native': True}))
                print('✓ Connected. Switch to your slides now.')
                delay = 1
                for raw in socket:
                    try:
                        message = json.loads(raw)
                    except (TypeError, ValueError):
                        continue
                    if message.get('type') in ('ended', 'expired'):
                        print('Session ended.')
                        return
                    key_name = message.get('key') if message.get('type') == 'key' else None
                    if key_name not in keys:
                        continue
                    key = keys[key_name]
                    keyboard.press(key)
                    keyboard.release(key)
                    print(f'  {key_name}', flush=True)
        except (OSError, ConnectionClosed, TimeoutError) as exc:
            print(f'Connection interrupted ({type(exc).__name__}). Reconnecting in {delay}s…')
            time.sleep(delay)
            delay = min(delay * 2, 15)


def main() -> int:
    parser = argparse.ArgumentParser(description='Mightora Clicker desktop key companion')
    parser.add_argument('--server', default='https://clicker.mightora.io', help='Website origin (default: https://clicker.mightora.io)')
    parser.add_argument('--code', metavar='PRIVATE_CODE', help='Full private connection code (optional; omitting it avoids exposing the secret in shell history)')
    args = parser.parse_args()
    print('\nMIGHTORA CLICKER · Desktop companion\n')
    code = args.code if args.code is not None else getpass.getpass('Paste the private connection code from the website: ')
    try:
        run(args.server, code)
    except (ValueError, RuntimeError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('\nDisconnected.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
