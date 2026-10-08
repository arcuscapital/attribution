"""Windowless scheduled entry point. Does not change PowerShell security settings."""
import os
import sys
import datetime
import json
import logging
from pathlib import Path

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')
home = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'ArcusAttribution'
home.mkdir(parents=True, exist_ok=True)
status = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'executable': sys.executable}
status_file = home / 'launcher-status.json'
status_file.write_text(json.dumps(status), encoding='utf-8')
try:
    from arcus_attribution.app import main, DEFAULT
    status['dataHome'] = str(DEFAULT)
    sys.argv = [sys.argv[0], 'update', *sys.argv[1:]]
    code = main()
    status['exitCode'] = code
    manifest = DEFAULT / 'reports' / 'manifest.json'
    status['reportGeneratedAt'] = json.loads(manifest.read_text(encoding='utf-8')).get('generatedAt') if manifest.exists() else None
except Exception as error:
    status['error'] = str(error)
    code = 1
status['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
status_file.write_text(json.dumps(status), encoding='utf-8')
logging.shutdown()
sys.exit(code)
