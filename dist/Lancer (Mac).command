#!/bin/bash
cd "$(dirname "$0")"
PORT=8080
echo "Rift Randomizer tourne sur http://localhost:$PORT (ferme cette fenetre pour arreter)"
(sleep 1; open "http://localhost:$PORT") &
python3 -m http.server $PORT --bind 127.0.0.1
