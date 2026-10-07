#!/usr/bin/env python3
"""Run a QA command with an isolated environment and timestamped, redacted evidence."""
import datetime
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')

def redact(text):
    patterns = [
        r'(?i)(Bearer\s+)[A-Za-z0-9_.-]{12,}',
        r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,}|sk-(?:live-|test-|proj-)?[A-Za-z0-9_-]{20,})',
        r'(?s)-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----',
    ]
    for pattern in patterns:
        text = re.sub(pattern, '[REDACTED]', text)
    return text

group, label, *command = sys.argv[1:]
if group not in ('coord', 'backend', 'frontend', 'ux', 'review') or not command:
    raise SystemExit('usage: run.py {coord,backend,frontend,ux,review} label command ...')
label = re.sub(r'[^a-zA-Z0-9_-]', '-', label)
start = now()
# Never forward service credentials to tests or package subprocesses.
env = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SYSTEMROOT') if key in os.environ}
env.update({'CI': 'true', 'NO_COLOR': '1', 'NPM_CONFIG_USERCONFIG': '/dev/null',
            'NPM_CONFIG_GLOBALCONFIG': '/private/tmp/sentinel-qa-unused-global-npmrc', 'NPM_CONFIG_CACHE': '/private/tmp/sentinel-qa-npm-cache',
            'NPM_CONFIG_REGISTRY': 'https://registry.npmjs.org'})
try:
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, text=True, errors='replace', timeout=600)
    output, code = result.stdout, result.returncode
except subprocess.TimeoutExpired as error:
    output = (error.stdout or b'').decode(errors='replace') if isinstance(error.stdout, bytes) else (error.stdout or '')
    output += '\nQA runner stopped command after 600 seconds.\n'
    code = 124
except OSError as error:
    output, code = str(error), 127
end = now()
artifact = ROOT / 'artifacts' / f'{group}-{label}.txt'
command_text = redact(shlex.join(command))
artifact.write_text(f'Start: {start}\nEnd: {end}\nCommand: {command_text}\nExit: {code}\n\n' + redact(output))
entry = f'\n### {start} — {label}\n\nCommand: `{command_text}`\n\nEnd: {end}. Exit: {code}. Evidence: [output](artifacts/{artifact.name}).\n'
with (ROOT / f'{group.upper()}-LOG.md').open('a') as file:
    file.write(entry)
with (ROOT / 'artifacts' / f'{group}-commands.jsonl').open('a') as file:
    file.write(json.dumps({'start':start,'end':end,'command':command_text,'exit':code,'artifact':artifact.name}) + '\n')
print(f'{start} → {end} | {group}/{label} | exit {code} | {artifact.relative_to(ROOT)}')
print(redact(output))
raise SystemExit(code)
