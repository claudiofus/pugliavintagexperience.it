"""Combine the verified GitHub Pages backup and the new build."""
from argparse import ArgumentParser
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re

PRODUCTION_COMMIT = 'c439ca1a01962f3e8fa1cc18c2befdff4f4b927f'
OLD_PREFIX = 'pugliavintagexperience.it-main/'
NEW_PREFIX = 'Puglia_Vintage_Experience/'
TAG = re.compile(rb'<script\b[^>]*>.*?</script\s*>', re.I | re.S)
GOOGLE_TAG = re.compile(rb'googletagmanager\.com/(?:gtag|gtm)|\bgtag\s*\(')
PRIVACY_FOOTER = (
    '<section class="pve-legacy-privacy"><details><summary>Privacy e cookie</summary>'
    '<p>Puglia Vintage Experience salva la scelta sui cookie per 180 giorni. Con il tuo consenso Google Analytics '
    'misura le visite e Google Ads misura le campagne. Puoi cambiare o revocare la scelta dalle preferenze qui sotto. '
    'Per informazioni sui tuoi dati chiama <a href="tel:+393663031469">+39 366 303 1469</a>.</p></details></section>'
).encode('utf-8')


def migrate_old_page(source):
    # These script tags in the public export contain only the old Google setup.
    clean = TAG.sub(lambda tag: b'' if GOOGLE_TAG.search(tag.group()) else tag.group(), source)
    clean = re.sub(rb'\s+onclick="gtag\([^"]*"', b'', clean, flags=re.I)
    head = (
        b'<link rel="stylesheet" href="/privacy.css">'
        b'<script defer src="/site-routes.js"></script><script defer src="/privacy.js"></script>'
    )
    clean, head_count = re.subn(rb'</head\s*>', head + b'</head>', clean, count=1, flags=re.I)
    clean, body_count = re.subn(rb'</body\s*>', PRIVACY_FOOTER + b'</body>', clean, count=1, flags=re.I)
    if head_count != 1 or body_count != 1 or GOOGLE_TAG.search(clean):
        raise ValueError('Could not replace old measurement safely')
    return clean


def package(previous, build, output):
    guide = Path(__file__).with_name('PUBBLICAZIONE.md')
    if not guide.is_file():
        guide = Path(__file__).resolve().parent.parent / guide.name
    with ZipFile(previous) as old, ZipFile(build) as new:
        if old.comment.decode('ascii') != PRODUCTION_COMMIT or old.testzip():
            raise ValueError('Backup does not match the verified production commit')
        if new.testzip():
            raise ValueError('Invalid new site package')
        names = set(new.namelist())
        with ZipFile(output, 'w', ZIP_DEFLATED) as ready:
            ready.comment = ('Base GitHub Pages ' + PRODUCTION_COMMIT).encode('ascii')
            for entry in old.infolist():
                if entry.is_dir() or not entry.filename.startswith(OLD_PREFIX):
                    continue
                path = entry.filename.removeprefix(OLD_PREFIX)
                name = NEW_PREFIX + path
                if name in names:
                    continue
                source = old.read(entry)
                if path.endswith('.html') and GOOGLE_TAG.search(source):
                    source = migrate_old_page(source)
                ready.writestr(name, source)
            for name in new.namelist():
                ready.writestr(name, new.read(name))
            ready.writestr(NEW_PREFIX + '.nojekyll', b'')
            ready.write(Path(__file__), NEW_PREFIX + 'prepare_github.py')
            ready.write(guide, 'PUBBLICAZIONE.md')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('previous', type=Path)
    parser.add_argument('build', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.resolve() in (args.previous.resolve(), args.build.resolve()):
        parser.error('Choose an output path distinct from both input archives')
    package(args.previous, args.build, args.output)
