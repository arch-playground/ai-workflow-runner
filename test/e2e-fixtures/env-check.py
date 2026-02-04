import os
msg = os.environ.get('AI_LAST_MESSAGE', '')
if msg:
    print('true')
else:
    print('AI_LAST_MESSAGE not set')
