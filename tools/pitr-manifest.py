#!/usr/bin/env python3
"""Capture/compare an approved, complete five-table DR dataset; not an E4 certificate.
Capture at the desired recovery point with writers quiesced. Keep this manifest
outside the backup failure domain and verify its provenance before use.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

TABLES = ('users', 'schools', 'classes', 'grades', 'attendance')


def snapshot():
    os.environ.setdefault('PGCONNECT_TIMEOUT', '5')
    os.environ.setdefault('PGOPTIONS', '-c statement_timeout=120000')
    sql = ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;",
           "SELECT json_build_object('kind','meta','database',current_database(),"
           "'system_id',system_identifier::text,'data_directory',current_setting('data_directory'),"
           "'in_recovery',pg_is_in_recovery()) FROM pg_control_system();"]
    for table in TABLES:
        sql += [f"SELECT json_build_object('kind','schema','table','{table}','columns',"
                "json_agg(json_build_array(attname,format_type(atttypid,atttypmod)) ORDER BY attnum)) "
                f"FROM pg_attribute WHERE attrelid='public.{table}'::regclass AND attnum>0 AND NOT attisdropped;",
                f"SELECT json_build_object('kind','row','table','{table}','data',to_jsonb(t)) FROM public.{table} t ORDER BY id;"]
    sql += ['COMMIT;']
    result = {'version': 1, 'tables': {t: {'count': 0} for t in TABLES}}
    hashes = {t: hashlib.sha256() for t in TABLES}
    # Separate temporary stderr prevents deadlock; stream rows instead of string_agg.
    with tempfile.TemporaryFile(mode='w+') as err:
        proc = subprocess.Popen(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', '\n'.join(sql)],
                                stdout=subprocess.PIPE, stderr=err, text=True)
        try:
            for line in proc.stdout:
                obj = json.loads(line)
                if obj['kind'] == 'meta':
                    result['identity'] = {k: v for k, v in obj.items() if k != 'kind'}
                elif obj['kind'] == 'schema':
                    result['tables'][obj['table']]['columns'] = obj['columns']
                else:
                    table = obj['table']
                    hashes[table].update(json.dumps(obj['data'], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode() + b'\n')
                    result['tables'][table]['count'] += 1
            if proc.wait() != 0:
                err.seek(0)
                raise RuntimeError('snapshot query failed: ' + err.read()[-2000:])
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    if 'identity' not in result or result['identity']['in_recovery']:
        raise RuntimeError('missing identity or target is still in recovery')
    for table in TABLES:
        if not result['tables'][table].get('columns'):
            raise RuntimeError('missing schema for ' + table)
        result['tables'][table]['sha256'] = hashes[table].hexdigest()
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--capture')
    g.add_argument('--verify')
    p.add_argument('--expect-data-dir')
    args = p.parse_args()
    if args.verify and not args.expect_data_dir:
        p.error('--expect-data-dir is required for verification')
    current = snapshot()
    if args.capture:
        dest = Path(args.capture)
        # Never silently replace an approved expected dataset.
        with dest.open('x') as f:
            json.dump(current, f, indent=2)
        print('MANIFEST_CAPTURED (expected dataset, not backup/restorability proof)')
        return
    expected = json.loads(Path(args.verify).read_text())
    if expected.get('version') != 1 or set(expected.get('tables', {})) != set(TABLES):
        raise RuntimeError('invalid expected manifest')
    ci, ei = current['identity'], expected['identity']
    if Path(ci['data_directory']).resolve() != Path(args.expect_data_dir).resolve():
        raise RuntimeError('wrong restore data_directory')
    if Path(ci['data_directory']).resolve() == Path(ei['data_directory']).resolve():
        raise RuntimeError('refusing source instance as restore target')
    for field in ('database', 'system_id'):
        if ci[field] != ei[field]:
            raise RuntimeError('wrong restore ' + field)
    if current['tables'] != expected['tables']:
        raise RuntimeError('restored schema/count/full-table checksum mismatch')
    print('PITR_VERIFY: PASS identity + complete expected dataset (not E4)')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('PITR_VERIFY: FAIL: ' + str(exc), file=sys.stderr)
        sys.exit(1)
