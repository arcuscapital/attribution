"""Prepare server-only secrets without saving the password. Upload with Wrangler."""
import getpass
import hashlib
import hmac
import json
from pathlib import Path
import secrets

if __name__ == '__main__':
    password=getpass.getpass('New Attribution password: ')
    if not password or len(password)>256:raise SystemExit('Use 1–256 characters.')
    if password!=getpass.getpass('Repeat password: '):raise SystemExit('Passwords differ.')
    pepper=secrets.token_hex(32)
    output=Path(__file__).resolve().parents[1]/'private/worker-secrets.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({'PASSWORD_PEPPER':pepper,'PASSWORD_VERIFIER':hmac.new(pepper.encode(),('password:'+password).encode(),hashlib.sha256).hexdigest(),'SESSION_KEY':secrets.token_hex(32)}),encoding='utf-8')
    print('Verifier and fresh session key saved to private/worker-secrets.json. Upload with Wrangler; existing sessions expire after upload.')
