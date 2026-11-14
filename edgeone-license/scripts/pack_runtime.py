#!/usr/bin/env python3
"""Prepare private ZIP without adding JS to the APK."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

MAX_ZIP = 5_500_000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--noname', required=True, type=Path)
    parser.add_argument('--game', required=True, type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--out', type=Path, default=Path('.local'))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    payloads = {'noname.js': args.noname.read_bytes(), 'game.js': args.game.read_bytes()}
    if not 0 < len(payloads['noname.js']) <= 2 * 1024 * 1024 or not 0 < len(payloads['game.js']) <= 16 * 1024 * 1024:
        raise SystemExit('Runtime entry exceeds APK memory parser limits')
    bundle = args.out / 'bundle.zip'
    with ZipFile(bundle, 'w') as archive:
        for name, body in payloads.items():
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            archive.writestr(entry, body, compress_type=ZIP_DEFLATED, compresslevel=9)
    data = bundle.read_bytes()
    if len(data) > MAX_ZIP:
        raise SystemExit(f'Compressed runtime {len(data)} bytes exceeds Cloud Functions budget {MAX_ZIP}')
    digest = hashlib.sha256(data).hexdigest()
    manifest = {'versionName': args.version, 'size': len(data), 'sha256': digest,
                'file': 'runtime/bundles/' + digest + '.zip'}
    for name, prefix in [('noname.js', 'noname'), ('game.js', 'game')]:
        manifest[prefix + 'Size'] = len(payloads[name])
        manifest[prefix + 'Sha256'] = hashlib.sha256(payloads[name]).hexdigest()
    (args.out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {bundle} ({len(data)} bytes). Do not commit generated ZIP.')


if __name__ == '__main__':
    main()
