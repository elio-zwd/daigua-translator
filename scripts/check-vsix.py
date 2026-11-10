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
        for name in ('extension', 'bing', 'pack-validation', 'knowledge-loader', 'knowledge-index', 'daigua-translate', 'symbol-matcher', 'pronunciation', 'identifier-words', 'offline-dictionary', 'query-result', 'result-renderer', 'webviews'):
            assert f'extension/out/{name}.js' in files, f'missing runtime module: {name}'
        assert 'extension/node_modules/bing-translate-api/src/index.js' in files, 'missing Bing transport'
        assert not any(p.startswith('extension/test/') for p in files), 'test code should not ship'
        assert not any(p.startswith('extension/node_modules/@vscode/vsce/') for p in files), 'build dependency should not ship'
        manifest = json.loads(archive.read('extension/package.json'))
        assert 'translates' not in manifest['contributes']
        assert 'extension/resources/technical-terms.json' in files
        groups = manifest['contributes']['configuration']
        properties = {key: value for group in groups for key, value in group['properties'].items()}
        technical_paths = properties['daiguaTranslate.technicalLibraryPaths']
        assert technical_paths['type'] == 'array' and technical_paths['items']['type'] == 'string'
        assert technical_paths['default'] == [] and technical_paths['scope'] == 'window'
        assert properties['daiguaTranslate.debugMode']['default'] is False
        commands = {item['command'] for item in manifest['contributes']['commands']}
        assert {'daiguaTranslate.openDetails', 'daiguaTranslate.openSettings'} <= commands
        terms = json.loads(archive.read('extension/resources/technical-terms.json'))['entries']
        assert any(t['token'] == 'board_init' and t.get('summary_zh') for t in terms)
        assert not any(p.endswith('ecdict.csv') or '/dictionary-index/' in p for p in files)
        assert 'extendTranslate' not in archive.read('extension/out/extension.js').decode('utf-8')
        print(f"[OK] VSIX {manifest['version']}: runtime, Bing dependency and exclusions verified")
    print(f'[OK] {target.stat().st_size} bytes; SHA-256 {hashlib.sha256(target.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
