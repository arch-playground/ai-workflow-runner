import os
import json

message = os.environ.get("AI_LAST_MESSAGE", "")

if not message.strip():
    print("No output received from AI")
else:
    try:
        data = json.loads(message)
        missing = [f for f in ("name", "description", "language") if f not in data]
        if missing:
            print(f"Missing required fields: {', '.join(missing)}")
        else:
            print("true")
    except json.JSONDecodeError as e:
        print(f"Output is not valid JSON: {e}")
