# The fonts

Three families, six files, served from this domain instead of Google's.

| File | Family | Subset | Bytes |
| --- | --- | --- | --- |
| `archivo-latin.woff2` | Archivo | latin | 34,928 |
| `archivo-latin-ext.woff2` | Archivo | latin-ext | 32,608 |
| `newsreader-latin.woff2` | Newsreader | latin | 132,000 |
| `newsreader-latin-ext.woff2` | Newsreader | latin-ext | 86,608 |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | latin | 21,832 |
| `jetbrains-mono-latin-ext.woff2` | JetBrains Mono | latin-ext | 7,528 |

Each is one variable file covering every weight the site asks of that
family, exactly as Google's API serves it. They were fetched on
20 September 2026 from the `css2` URLs written at the top of
`../fonts.css`, which also says how to refresh them.

An English page downloads the three `latin` files — 188,760 bytes — and
never touches `latin-ext` unless a character needs it. The vietnamese,
greek and cyrillic subsets Google also offers are not here at all.

## Licence

All three are under the **SIL Open Font License, Version 1.1**, which
permits redistribution — including from a web server — provided the
copyright notice and licence travel with the files. They do:

- Archivo — `OFL-Archivo.txt` — © 2020 The Archivo Project Authors
- Newsreader — `OFL-Newsreader.txt` — © 2020 The Newsreader Project Authors
- JetBrains Mono — `OFL-JetBrainsMono.txt` — © 2020 The JetBrains Mono Project Authors

The files are unmodified, so the Reserved Font Name clause is not
engaged. If one is ever subset or instanced by hand, it has to be
renamed before it is published.
