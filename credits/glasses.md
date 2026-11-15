# Editorial promo credits

The film's look (fast hard cuts between grid-based magazine layouts, giant
condensed headlines, corner micro-labels) was inspired by a reel the user
shared on 2026-10-26 (<https://x.com/47thegreat_/status/2113666833270092256>).
None of its footage, photos or copy is used here; every layout, line of copy
and photo in this film is new.

## Photos

`assets/photos/*.png` were generated on 2026-10-26 with the Codex imagegen
skill (built-in `image_gen` tool). The prompts are in
`assets/photos/PROMPTS.md`. They depict no real people.

## Music

- `../assets/music/bach-prelude-c-minor-bwv847-ishizaka.flac`: J. S. Bach, Prelude No. 2 in C minor, BWV 847 (The Well-Tempered Clavier, Book 1), performed by Kimiko Ishizaka. From the Open Well-Tempered Clavier project (<https://welltemperedclavier.org/>), released to the public domain (CC0). File source: Wikimedia Commons, 24-bit / 96 kHz FLAC, 1:47 (<https://commons.wikimedia.org/wiki/File:Kimiko_Ishizaka_-_Bach-_Well-Tempered_Clavier,_Book_1_-_03_Prelude_No._2_in_C_minor,_BWV_847.flac>). Downloaded 2026-10-26 after the user picked it from four previews.
- Credit where convenient: "Music: J. S. Bach, Prelude in C minor BWV 847, performed by Kimiko Ishizaka (Open Well-Tempered Clavier)".
- `score.py` cuts the 14-second edit (`../out/editorial-music.wav`): bars 1-4 joined on bar 5's downbeat to the closing flourish and final C major chord.

## App imagery

- `assets/app-ui.png`: the Glasses web prototype at iPhone 15 size, captured
  by `node render.mjs ui`.
- `assets/app-icon.png`: copied from `design/app-icon/app-icon.png` (see
  `ios-native/README.md` for the icon's own credits).

## Fonts

All under the SIL Open Font License 1.1 (licence texts beside each font in
`assets/fonts/`), downloaded from the Google Fonts repository
(<https://github.com/google/fonts>):

- Anton (Vernon Adams): condensed English headlines
- Archivo (Omnibus-Type): labels, body copy, condensed control names
- Instrument Serif (Instrument): serif headlines
- Space Mono (Colophon Foundry): the mono grid
- Noto Sans SC and Noto Serif SC (Google): Chinese text


---

# Promo film assets

Both files were downloaded with the user's approval on 2026-10-12 for the 30-second Glasses film (`promo/film.html`).

## Photograph

- `photo/magnolia-darren-richardson.jpg`: "Pink and white flowers against a blue sky" by Darren Richardson (@campfire_guy) on Unsplash, <https://unsplash.com/photos/pink-and-white-flowers-against-a-blue-sky-MyI0ZVjcHmw>. Original 5616 × 3744 JPEG, unedited.
- `photo/magnolia-3840.jpg`: the same photo downscaled to 3840 px with Lanczos for the stage texture. The film applies a gentle grade at render time; the file itself is not graded.
- License: [Unsplash License](https://unsplash.com/license), free for commercial use with no attribution required. Credit the photographer where convenient.

## Music

- `music/bach-prelude-c-bwv846-ishizaka.flac`: J. S. Bach, Prelude No. 1 in C major, BWV 846 (The Well-Tempered Clavier, Book 1), performed by Kimiko Ishizaka on a Bösendorfer 280 at Teldex Studio, Berlin. From the Open Well-Tempered Clavier project (<https://welltemperedclavier.org/>). File source: Wikimedia Commons, 24-bit / 96 kHz FLAC, 2:43.
- License: the project released the recording to the public domain (CC0). Wikimedia Commons lists the file as CC BY 3.0, so credit the performer: "Music: J. S. Bach, Prelude in C major BWV 846, performed by Kimiko Ishizaka (Open Well-Tempered Clavier)".
- `../score.py` cuts the 31.4-second soundtrack (`out/film-music.wav`) from this recording. It keeps bars 1–4 and joins them to the coda (bars 33–35) on a bar line, so the cut ends on Bach's own cadence.
