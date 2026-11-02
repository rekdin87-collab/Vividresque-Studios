# Shardfall — fixed package

The original package had the game's image files stored as UUID-named files in `images/`,
while `main.js` was looking for named files such as `assets/player.webp`. That path/name
mismatch caused the sprites to fail to load.

This package puts every referenced sprite at the exact `assets/<name>.webp` path expected
by the game.

IMPORTANT: run the game through a local/static web server (HTTP/HTTPS), not by double-
clicking index.html as a `file://` URL. Example with Python:

    python -m http.server 8000

Then open:

    http://localhost:8000/

The game can also be deployed to a normal static host with the folder structure intact.
