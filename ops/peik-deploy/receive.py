#!/usr/bin/python3
"""SSH forced command. Only a fixed deploy invocation or a harmless connection probe."""
import os
import re
import sys

command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if command == 'probe':
    print('PEIK_DEPLOY_READY'); sys.exit(0)
match = re.fullmatch(r'deploy ([0-9a-f]{40})', command)
if not match:
    print('Only probe or deploy <main commit SHA> is allowed', file=sys.stderr)
    sys.exit(64)
os.execv('/usr/bin/sudo', ['sudo', '-n', '/usr/local/bin/peik-deploy', 'receive', match.group(1)])
