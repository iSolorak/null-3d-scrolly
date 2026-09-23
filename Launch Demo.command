#!/bin/bash
# Double-click (or run) to launch the NULLSHELL demo site locally.
# Keep this window open while recording. Press Ctrl+C (or close it) to stop.

cd "$(dirname "$0")" || exit 1
PORT=8099
NAME="NULLSHELL"

# free the port if something is already listening
(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null || fuser -n tcp $PORT 2>/dev/null) | xargs -r kill -9 2>/dev/null

URL="http://localhost:$PORT"
echo ""
echo "  $NAME — local server"
echo "  Open in your browser:  $URL"
echo "  Keep this window open while recording. Ctrl+C to stop."
echo ""
( sleep 1 && { command -v xdg-open >/dev/null && xdg-open "$URL" || open "$URL"; } >/dev/null 2>&1 ) &
python3 -m http.server $PORT
