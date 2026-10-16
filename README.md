# Lyrica

Play synced lyrics as animated text inside your Obsidian notes. No audio: a built-in timer drives the lyrics, with the active line highlighted, nearby lines blurred, and smooth auto-scroll.

## Usage

Paste TTML or LRC into a code block with the language `lyrica`:

````
```lyrica
<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <head>
    <metadata>
      <ttm:title>Demo Song</ttm:title>
      <ttm:agent type="person">Demo Artist</ttm:agent>
    </metadata>
  </head>
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">This is the first line</p>
      <p begin="00:00:04.000" end="00:00:08.000">And this is the second</p>
    </div>
  </body>
</tt>
```
````

LRC works too:

````
```lyrica
[ti:Demo Song]
[ar:Demo Artist]
[00:01.00] This is the first line
[00:04.00] And this is the second
```
````

The block becomes a player in reading view and live preview. Use Play/Pause, drag the slider, or tap a line to jump to it.

You can also load a file from your vault:

````
```lyrica
file: demo-song.ttml
```
````

## Insert a block quickly

- **Ribbon icon** (music note) inserts a block at the cursor.
- **Command palette:** "Lyrica: Insert lyrics block". Assign your own hotkey in Settings → Hotkeys.
- If your clipboard contains TTML or LRC, the block is filled with it. Otherwise you get a blank template.

## Notes

- Line-level timing only: the fill across the active line is interpolated over the line's duration.
- No audio playback. Lyrica is a visual timer.
- Works on desktop and mobile.
- Lyrics are copyrighted by their owners. Use files you have the right to use.

## Manual installation

Copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<your vault>/.obsidian/plugins/lyrica/`, then enable the plugin under Community plugins.

## License

MIT
