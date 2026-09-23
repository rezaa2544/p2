#!/usr/bin/env python3
"""Fail-closed copy of a stable multipart AOF generation (no repair/truncation)."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    source, dest = map(Path, sys.argv[1:])
    manifest = source / 'appendonly.aof.manifest'
    if manifest.is_symlink():
        raise ValueError('symlink manifest')
    before = manifest.read_bytes()
    names = []
    for line in before.decode().splitlines():
        words = line.split()
        if len(words) < 6 or len(words) % 2 or words[0] != 'file' or words[2] != 'seq' or words[4] != 'type':
            raise ValueError('invalid AOF manifest')
        for key, value in zip(words[6::2], words[7::2]):
            if key not in ('startoffset', 'endoffset') or not value.isdigit():
                raise ValueError('unknown/invalid AOF manifest extension')
        name = words[1]
        if Path(name).name != name or name in ('.', '..') or not words[3].isdigit() or words[5] not in ('b', 'i', 'h'):
            raise ValueError('unsafe manifest reference')
        if words[5] != 'h':
            names.append(name)
    if not names or len(names) != len(set(names)):
        raise ValueError('missing/duplicate AOF references')
    dest.mkdir()
    for name in names:
        path = source / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('missing/unsafe AOF member')
        shutil.copyfile(path, dest / name)
    # History references are not replayed; preserve the original manifest for
    # the tool parser rather than constructing a purportedly valid manifest.
    (dest / manifest.name).write_bytes(before)
    if manifest.read_bytes() != before:
        raise ValueError('AOF generation changed; retry backup')
    subprocess.run(['redis-check-aof', str(dest / manifest.name)], check=True)
    # The complete copied generation is a prefix snapshot, not a promise of
    # containing writes acknowledged after copy began. Restore/readback required.


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('AOF_SNAPSHOT_FAILED: ' + str(exc), file=sys.stderr)
        sys.exit(1)
