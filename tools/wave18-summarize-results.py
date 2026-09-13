"""Summarise the k6 --summary-export files produced by run-scenarios.sh.

Reads tests/performance/results/w18-<scenario>.json and prints one row per
scenario. Kept as a committed tool so the numbers quoted in the roadmap row are
reproducible rather than copied by hand.

Note on the export shape: k6 v2 writes each metric as a FLAT dict
({'avg','min','med','max','p(90)','p(95)','count','rate',...}), NOT nested under
a 'values' key. The median is 'med' and 'p(50)' is absent. The per-metric
'thresholds' dict maps "expr" -> bool where **true means the threshold was
CROSSED** (i.e. failed) — that is why the last column below is derived from
k6's own judgement rather than recomputed here.
"""
import json, glob, os, sys

ORDER = ['load', 'peak', 'stress', 'spike', 'soak']


def get(m, k, p):
    x = m.get(k)
    return x.get(p) if isinstance(x, dict) else None


def f2(x, u=''):
    return ('%.1f%s' % (x, u)) if isinstance(x, (int, float)) else 'n/a'


def crossed(metrics):
    """Names of metrics whose thresholds were crossed (True = failed)."""
    bad = []
    for name, body in metrics.items():
        if not isinstance(body, dict):
            continue
        th = body.get('thresholds')
        if isinstance(th, dict) and any(v is True for v in th.values()):
            bad.append(name)
    return sorted(bad)


def main(out):
    files = {os.path.basename(f).replace('w18-', '').replace('.json', ''): f
             for f in glob.glob(os.path.join(out, 'w18-*.json'))}
    hdr = ('  %-7s %9s %9s %9s %9s %10s %8s %10s'
           % ('سناریو', 'rps', 'med', 'p90', 'p95', 'http_fail',
              'writes', 'write_err'))
    print(hdr)
    print('  ' + '-' * (len(hdr) - 2))
    bad_scen = []
    for name in ORDER:
        f = files.get(name)
        if not f:
            print('  %-7s  (اجرا نشد)' % name)
            continue
        m = json.load(open(f)).get('metrics', {})
        rps = get(m, 'http_reqs', 'rate')
        med = get(m, 'http_req_duration', 'med')
        p90 = get(m, 'http_req_duration', 'p(90)')
        p95 = get(m, 'http_req_duration', 'p(95)')
        fail = get(m, 'http_req_failed', 'rate')
        wr = get(m, 'writes_total', 'count')
        we = get(m, 'write_errors', 'rate')
        s95 = get(m, 'sync_duration', 'p(95)') or get(m, 'sync_duration', 'med')
        bad = crossed(m)
        if bad:
            bad_scen.append((name, bad))
        print('  %-7s %9s %9s %9s %9s %9s %8s %9s   sync_med=%s%s' % (
            name, f2(rps), f2(med, 'ms'), f2(p90, 'ms'), f2(p95, 'ms'),
            f2((fail or 0) * 100, '%'),
            int(wr) if isinstance(wr, (int, float)) else 'n/a',
            f2((we or 0) * 100, '%'), f2(s95, 'ms'),
            '   ⚠ آستانه رد شده: ' + ', '.join(bad) if bad else '   ✓ همهٔ آستانه‌ها'))
    print()
    hard = [(n, b) for n, b in bad_scen if any('failed' in x or 'error' in x for x in b)]
    if hard:
        print('  ⛔ خطای سخت (HTTP/نوشتن) در: ' + ', '.join(n for n, _ in hard))
    else:
        print('  ✓ هیچ خطای HTTP یا خطای نوشتنی در هیچ سناریویی')
    if bad_scen:
        print('  ⚠ رد شدن SLO تاخیر در: ' + ', '.join(n for n, _ in bad_scen))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'tests/performance/results')
