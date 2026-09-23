#!/usr/bin/env python3
"""Publish a versioned bundle with expected owner and byte-for-byte readback.
Local/mock execution is only a tool-contract test, never off-site DR evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid


def main():
    file, uri, owner = sys.argv[1:]
    m = re.fullmatch(r's3://([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:/([A-Za-z0-9_./-]*))?', uri)
    if not m or not re.fullmatch(r'[0-9]{12}', owner):
        raise ValueError('invalid bucket/prefix or expected account owner')
    bucket, prefix = m.groups()
    key = (prefix or '').strip('/') + '/' + uuid.uuid4().hex + '.tar.gz'
    key = key.lstrip('/')
    common = ['--bucket', bucket, '--key', key, '--expected-bucket-owner', owner]
    timeout = int(os.environ.get('BACKUP_S3_TIMEOUT', '180'))
    if timeout < 1 or timeout > 180:
        raise ValueError('invalid timeout')
    def sha256(path):
        h = hashlib.sha256()
        with Path(path).open('rb') as f:
            for chunk in iter(lambda: f.read(1024*1024), b''):
                h.update(chunk)
        return h.hexdigest()
    def aws(*args):
        result = subprocess.run(['aws', 's3api', *args], capture_output=True, text=True, timeout=timeout, check=True)
        return json.loads(result.stdout)
    before = sha256(file)
    receipt = aws('put-object', *common, '--body', file)
    version = receipt.get('VersionId')
    if not isinstance(version, str) or not version or version == 'null':
        raise ValueError('versioned object required; upload alone is not accepted')
    with tempfile.TemporaryDirectory(prefix='payesh-s3-readback-') as temp:
        downloaded = Path(temp) / 'bundle'
        result = aws('get-object', *common, '--version-id', version, str(downloaded))
        if result.get('VersionId') != version:
            raise ValueError('readback version mismatch')
        after = sha256(downloaded)
        if before != after:
            raise ValueError('readback SHA256 mismatch')
    print(json.dumps({'bucket': bucket, 'key': key, 'expected_owner': owner,
                      'version_id': version, 'sha256': before, 'readback_verified': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not echo SDK/environment credentials or an arbitrary response body.
        print('S3_BACKUP_FAILED: ' + type(exc).__name__, file=sys.stderr)
        sys.exit(1)
