"""Verify the packaged runtime without installing or executing the extension."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def main():
    target = Path(sys.argv[1])
    with zipfile.ZipFile(target) as archive:
        files = archive.namelist()
        for name in ('extension', 'bing', 'pack-validation', 'knowledge-loader', 'daigua-translate', 'symbol-matcher'):
            assert f'extension/out/{name}.js' in files, f'missing runtime module: {name}'
        assert 'extension/node_modules/bing-translate-api/src/index.js' in files, 'missing Bing transport'
        assert not any(p.startswith('extension/test/') for p in files), 'test code should not ship'
        assert not any(p.startswith('extension/node_modules/@vscode/vsce/') for p in files), 'build dependency should not ship'
        manifest = json.loads(archive.read('extension/package.json'))
        assert manifest['contributes']['translates'][0]['translate'] == 'daigua'
        print(f"[OK] VSIX {manifest['version']}: runtime, Bing dependency and exclusions verified")
    print(f'[OK] {target.stat().st_size} bytes; SHA-256 {hashlib.sha256(target.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
