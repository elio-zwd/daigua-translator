"""Check a real source tree against the AI review snapshot."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validator.validate import validate_pack


def main():
    parser = argparse.ArgumentParser(description="核对 05 工程来源快照和知识包")
    parser.add_argument('--src', required=True, help='freertos-learning 根目录')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    root = Path(args.src).resolve()
    review = json.loads((repo / 'knowledge-packs/reviews/05_createtask-review.json').read_text(encoding='utf-8'))
    errors = []
    for file, expected in review['source_sha256'].items():
        try:
            source = (root / file).resolve()
            if not source.is_relative_to(root): raise ValueError('来源越界')
            actual = hashlib.sha256(source.read_bytes()).hexdigest()
            if actual != expected: errors.append(file + ': 源码已变化，需重新提取和复核')
        except (OSError, ValueError) as error:
            errors.append(file + ': ' + str(error))
    valid = validate_pack(repo / 'knowledge-packs/05_createtask-pack.json', root)
    for error in errors: print('[ERROR] ' + error)
    if valid and not errors: print('[OK] 来源文件与制作时的 SHA-256 快照一致；人工语义复核仍待完成')
    return 0 if valid and not errors else 1


if __name__ == '__main__':
    sys.exit(main())
