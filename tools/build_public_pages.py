# -*- coding: utf-8 -*-
"""Build the song and musician pages for colabroom.com.

The app renders to a canvas, so a crawler visiting app.colabroom.com sees a
blank document with a script tag. Nothing in the product is indexable and no
work on the app will change that. Everything that can ever be found has to be
real HTML on colabroom.com — and the only content worth having there is what
the users make.

    SUPABASE_PROJECT_REF   project ref (already a repo secret)
    SUPABASE_ANON_KEY      the anon key — *not* the service role key
    SITE_DIR               a checkout of colabroom-site to write into

**The anon key on purpose.** `public_songs` and `public_musicians` are the
only two functions granted to `anon`, and they encode every privacy decision
in SQL where it is reviewed (see migration 0096). Running this with the
service role key would give the generator the power to publish anything and
move the gate from the database into this file, which is the wrong place for
it — a mistake here would be one careless line away from indexing somebody's
private song.

Writes nothing it cannot justify: a run that returns no rows removes the pages
that no longer have rows and leaves everything else alone. Early on it will
emit very few pages, and that is the expected shape — this is infrastructure
that pays off as the app grows, not a traffic switch.
"""
import html
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

ORIGIN = 'https://colabroom.com'
APP = 'https://app.colabroom.com'


def env(name):
    value = os.environ.get(name, '').strip()
    if not value:
        sys.exit('%s is not set' % name)
    return value


def rpc(ref, key, fn, payload):
    url = 'https://%s.supabase.co/rest/v1/rpc/%s' % (ref, fn)
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', 'replace')[:400]
        sys.exit('%s failed: %s %s' % (fn, error.code, body))


def slug(text, unique):
    """A readable, stable URL.

    The uuid tail is not decoration: two people will write a song called
    Home, and a slug that collides silently overwrites one of them with the
    other. Eight characters is enough to never collide and short enough that
    the title still reads.
    """
    plain = unicodedata.normalize('NFKD', text or '')
    plain = plain.encode('ascii', 'ignore').decode('ascii').lower()
    plain = re.sub(r'[^a-z0-9]+', '-', plain).strip('-')[:60]
    return '%s-%s' % (plain or 'untitled', unique[:8])


def e(text):
    return html.escape(str(text or ''), quote=True)


def minutes(ms):
    if not ms:
        return None
    total = int(ms) // 1000
    return '%d:%02d' % (total // 60, total % 60)


HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="CoLabRoom">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{origin}/share.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{origin}/share.png">
<meta name="theme-color" content="#06101F">
<link rel="stylesheet" href="{origin}/site.css">
<script type="application/ld+json">{schema}</script>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="{origin}/">CoLabRoom</a>
    <nav class="pages">
      <a href="{origin}/chords.html">Chords</a>
      <a href="{origin}/openmic.html">Open Mic</a>
    </nav>
    <span class="sp"></span>
    <a class="cta quiet" href="{app}/">Sign in</a>
    <a class="cta" href="mailto:beta@colabroom.com?subject=CoLabRoom%20beta">Ask for an invite</a>
  </header>
"""

FOOT = """
  <footer>
    <span class="sp"></span>
    <a href="{origin}/privacy.html">Privacy</a>
    <a href="{origin}/terms.html">Terms</a>
    <a href="{origin}/copyright.html">Copyright</a>
  </footer>
</div>
</body>
</html>
"""


def page(body, **kw):
    kw.setdefault('origin', ORIGIN)
    kw.setdefault('app', APP)
    return HEAD.format(**kw) + body + FOOT.format(origin=ORIGIN)


def song_page(row):
    title = row.get('title') or 'Untitled'
    owner = row.get('owner_name') or 'Somebody'
    players = [p.get('name') for p in (row.get('players') or []) if p.get('name')]
    key = row.get('musical_key')
    length = minutes(row.get('duration_ms'))
    url = '%s/song/%s.html' % (ORIGIN, slug(title, row['id']))

    with_line = ''
    if players:
        named = players[:3]
        rest = len(players) - len(named)
        with_line = ' with ' + ', '.join(named) + (' and %d more' % rest if rest > 0 else '')

    description = '%s by %s%s, made on CoLabRoom.' % (title, owner, with_line)

    schema = json.dumps({
        '@context': 'https://schema.org',
        '@type': 'MusicRecording',
        'name': title,
        'url': url,
        'byArtist': {'@type': 'Person', 'name': owner},
        **({'musicalKey': key} if key else {}),
        **({'contributor': [{'@type': 'Person', 'name': p} for p in players]}
           if players else {}),
    })

    facts = []
    if key:
        facts.append('<li><span>Key</span><b>%s</b></li>' % e(key))
    if length:
        facts.append('<li><span>Length</span><b>%s</b></li>' % e(length))
    if row.get('made_here'):
        facts.append('<li><span>Made here</span><b>More than one '
                     'musician played on this</b></li>')

    body = """
  <article class="page">
    <div class="eyebrow">A song on CoLabRoom</div>
    <h1>{title}</h1>
    <p class="lede">by {owner}{with_line}</p>
    {facts}
    <p class="note">
      Recorded and written in CoLabRoom — the takes, the words and the chords
      in one place. <a href="{app}/">Open the app</a> to hear it, or
      <a href="{origin}/">see what CoLabRoom does</a>.
    </p>
  </article>
""".format(
        title=e(title),
        owner=e(owner),
        with_line=e(with_line),
        facts=('<ul class="facts">%s</ul>' % ''.join(facts)) if facts else '',
        app=APP,
        origin=ORIGIN,
    )

    return url, page(
        body,
        title=e('%s by %s — CoLabRoom' % (title, owner)),
        description=e(description),
        url=url,
        og_type='music.song',
        schema=schema,
    )


def musician_page(row):
    name = row.get('display_name') or 'Somebody'
    plays = [p for p in (row.get('plays') or []) if p]
    sounds = [s for s in (row.get('sounds_like') or []) if s]
    city = row.get('city')
    songs = row.get('songs_on_showcase') or 0
    url = '%s/musician/%s.html' % (ORIGIN, slug(name, row['id']))

    bits = []
    if plays:
        bits.append('Plays ' + ', '.join(plays[:4]))
    if city:
        bits.append('near ' + city)
    if sounds:
        bits.append('sounds like ' + ', '.join(sounds[:3]))
    description = '%s on CoLabRoom. %s.' % (name, '; '.join(bits)) if bits \
        else '%s on CoLabRoom.' % name

    schema = json.dumps({
        '@context': 'https://schema.org',
        '@type': 'Person',
        'name': name,
        'url': url,
        **({'address': {'@type': 'PostalAddress',
                        'addressLocality': city}} if city else {}),
    })

    rows = []
    if plays:
        rows.append('<li><span>Plays</span><b>%s</b></li>'
                    % e(', '.join(plays)))
    if sounds:
        rows.append('<li><span>Sounds like</span><b>%s</b></li>'
                    % e(', '.join(sounds)))
    if city:
        rows.append('<li><span>Near</span><b>%s</b></li>' % e(city))
    if songs:
        rows.append('<li><span>On the showcase</span><b>%d song%s</b></li>'
                    % (songs, '' if songs == 1 else 's'))

    body = """
  <article class="page">
    <div class="eyebrow">A musician on CoLabRoom</div>
    <h1>{name}</h1>
    <ul class="facts">{rows}</ul>
    <p class="note">
      {name} is findable on the CoLabRoom Open Mic — where musicians say what
      a song is missing, and somebody who plays that thing answers.
      <a href="{app}/">Open the app</a> to work with them, or
      <a href="{origin}/openmic.html">see how the Open Mic works</a>.
    </p>
  </article>
""".format(name=e(name), rows=''.join(rows), app=APP, origin=ORIGIN)

    return url, page(
        body,
        title=e('%s — CoLabRoom' % name),
        description=e(description),
        url=url,
        og_type='profile',
        schema=schema,
    )


def write(site, url, markup):
    relative = url[len(ORIGIN) + 1:]
    path = os.path.join(site, *relative.split('/'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    existing = None
    if os.path.exists(path):
        with open(path, encoding='utf-8') as handle:
            existing = handle.read()
    if existing == markup:
        return False
    with open(path, 'w', encoding='utf-8', newline='') as handle:
        handle.write(markup)
    return True


def sweep(site, folder, keep):
    """Delete pages whose row has gone.

    Somebody taking a song off the showcase is withdrawing consent, and a
    generator that only ever adds would leave the page standing. It cannot
    un-cache what Google already took, which is exactly why it must not be
    slower than it has to be.
    """
    directory = os.path.join(site, folder)
    if not os.path.isdir(directory):
        return 0
    gone = 0
    for name in os.listdir(directory):
        if not name.endswith('.html'):
            continue
        if os.path.join(folder, name).replace('\\', '/') in keep:
            continue
        os.remove(os.path.join(directory, name))
        gone += 1
    return gone


def main():
    ref = env('SUPABASE_PROJECT_REF')
    key = env('SUPABASE_ANON_KEY')
    site = env('SITE_DIR')
    if not os.path.isdir(site):
        sys.exit('SITE_DIR %s is not a directory' % site)

    songs = rpc(ref, key, 'public_songs', {'in_limit': 2000, 'in_offset': 0})
    people = rpc(ref, key, 'public_musicians',
                 {'in_limit': 2000, 'in_offset': 0})

    written = 0
    keep_songs, keep_people, urls = set(), set(), []

    for row in songs:
        url, markup = song_page(row)
        relative = url[len(ORIGIN) + 1:]
        keep_songs.add(relative)
        urls.append(url)
        if write(site, url, markup):
            written += 1

    for row in people:
        url, markup = musician_page(row)
        relative = url[len(ORIGIN) + 1:]
        keep_people.add(relative)
        urls.append(url)
        if write(site, url, markup):
            written += 1

    removed = sweep(site, 'song', keep_songs) + \
        sweep(site, 'musician', keep_people)

    # The generated half of the sitemap, kept separate from the hand-written
    # one so a bad run can never take the ten real pages down with it.
    rows = '\n'.join(
        '  <url><loc>%s</loc><changefreq>weekly</changefreq>'
        '<priority>0.6</priority></url>' % u for u in sorted(urls))
    with open(os.path.join(site, 'sitemap-pages.xml'), 'w',
              encoding='utf-8', newline='') as handle:
        handle.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + rows + ('\n' if rows else '') + '</urlset>\n')

    print('songs: %d  musicians: %d  written: %d  removed: %d'
          % (len(songs), len(people), written, removed))
    if not urls:
        print('nothing to publish yet — no song is on the showcase and '
              'nobody discoverable has said what they play')


if __name__ == '__main__':
    main()
