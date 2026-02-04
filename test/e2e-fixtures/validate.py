#!/usr/bin/env python3
import os
import sys

last_message = os.environ.get('AI_LAST_MESSAGE', '')

if not last_message:
    print('No AI response received')
    sys.exit(0)

keywords = ['file', 'directory', 'hello', 'hi', 'test', 'workflow', '.md', '.py', '.js']
if any(keyword.lower() in last_message.lower() for keyword in keywords):
    print('true')
else:
    print(f'Expected keywords but got: {last_message[:200]}...')
