# Embedding Shardfall

Shardfall is **not a standalone `index.html` file**. Its artwork/audio load from `assets/`, and its buttons/game logic load from `main.js` and `multiplayer.js`. Pasting the contents of `index.html` into a site editor, or uploading only that file, will therefore leave missing art and inactive buttons.

The simplest option is to embed the hosted game page in an iframe. Use the public game URL below as the iframe `src`; do not paste the game page's source into your website editor.

## Full-page embed

```html
<iframe
  src="https://vividresquestudio.com"
  title="Shardfall"
  style="display:block;width:100%;height:100vh;height:100dvh;border:0"
  allow="autoplay; fullscreen"
  allowfullscreen>
</iframe>
```

For a game embedded in a section of a page, use a 16:9 frame instead:

```html
<iframe
  src="https://vividresquestudio.com"
  title="Shardfall"
  style="display:block;width:100%;aspect-ratio:16/9;border:0"
  allow="autoplay; fullscreen"
  allowfullscreen>
</iframe>
```

The game page now fills the iframe's available viewport and scales its canvas to fit while preserving the game's 16:9 proportions. The parent page controls the iframe's size; the full-page snippet gives it the full viewport height.

## If you are self-hosting the game files

Keep the project structure intact and upload the complete game folder to an HTTPS-capable static host:

```text
shardfall/
  index.html
  main.js
  multiplayer.js
  rosebud-game-defaults.css
  rosebud-game-defaults.js
  assets/
    (all game images, audio, and other assets)
```

Open the hosted `index.html` directly first. The host must serve `.js` files as JavaScript and allow browser ES modules; uploading JavaScript into a page-editor field is not the same as hosting those files. Keep the folder structure above intact, then visit the actual hosted `.../index.html` URL. The game now loads its optional co-op library only when co-op is opened, so a blocked co-op CDN should not stop the regular menu/game buttons.

If the direct game URL works but the iframe does not, your website builder may block external iframes; use its HTML/iframe embed element and make sure it does not add a restrictive `sandbox` that blocks scripts. If you pasted the page markup or JavaScript directly into a rich-text/code block, switch to an iframe embed instead. The game uses JavaScript modules and needs to be served over HTTP/HTTPS, not opened as a local `file://` page. If it still fails on a static host, check the browser console and network panel for a failed `main.js`, `multiplayer.js`, or `assets/...` request; `main.js` must return successfully, and asset paths must remain under the same game folder.