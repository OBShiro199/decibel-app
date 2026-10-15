#!/usr/bin/env python3
"""Load leads from Supabase (search_export.leads, read-only) into Typesense.

Streams the view with COPY and imports in batches into a new collection
leads_<timestamp>, then points the alias `leads` at it and drops the previous
collection, so a reload never interrupts search. Runs on the search server:

    python3 load-leads.py                    # everything (run overnight)
    python3 load-leads.py --limit 20000      # a sample
    python3 load-leads.py --max-rate 2000    # cap rows per second (gentler on Supabase)
    python3 load-leads.py --in-place         # add new leads / refresh existing ones in the live collection
    python3 load-leads.py --ids-file ids.txt # just these leads (one contact_id per line), in place; no full read

Needs /opt/typesense/.env (TYPESENSE_API_KEY) and /opt/typesense/reader.env (PG*).
Phone numbers and emails never reach this server: the view only has yes/no flags
and the mobile dialling code. Exact-match values (country, industry, seniority…) are
stored as crc32 numbers (fields ending _h), about a sixth of the memory of text;
the lead-search function hashes filter values the same way.
"""
import argparse, csv, datetime, io, json, os, re, subprocess, sys, time, urllib.request, zlib

TS = os.environ.get('TYPESENSE_LOCAL', 'http://127.0.0.1:8108')
HERE = os.path.dirname(os.path.abspath(__file__))
COLS = ['contact_id', 'full_name', 'current_title', 'company', 'company_domain', 'website', 'seniority', 'department',
        'company_industry', 'main_industry', 'size', 'employees', 'revenue', 'founded', 'hq_country', 'country', 'location',
        'has_mobile', 'mobile_prefix', 'has_email', 'email_status', 'has_personal_email', 'has_linkedin', 'open_to_work',
        'is_hiring', 'role_start', 'funding', 'smart_tags', 'skills', 'languages', 'tech']
csv.field_size_limit(sys.maxsize)


def env_file(path):
    out = {}
    for line in open(path):
        if '=' in line and not line.startswith('#'):
            k, v = line.rstrip('\n').split('=', 1)
            out[k] = v
    return out


KEY = env_file('/opt/typesense/.env')['TYPESENSE_API_KEY']


def ts(method, path, body=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(TS + path, data=data, method=method, headers={'X-TYPESENSE-API-KEY': KEY, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read().decode()


def doc(row):
    r = dict(zip(COLS, row))
    t = lambda k: r[k] or None
    b = lambda k: r[k] == 't'
    i = lambda k: int(r[k]) if r[k] else None
    d = {'id': r['contact_id'], 'cid': r['contact_id']}
    for k in ('full_name', 'current_title', 'company', 'company_domain', 'website', 'location', 'seniority', 'department',
              'main_industry', 'company_industry', 'size', 'revenue', 'country', 'hq_country', 'email_status', 'funding',
              'smart_tags', 'skills', 'languages', 'tech'):
        if t(k):
            d[k] = r[k]
    for k in ('employees', 'founded'):
        if i(k) is not None:
            d[k] = i(k)
    if r['role_start']:
        # days since 1970-01-01, for tenure filters
        d['role_start'] = (datetime.date.fromisoformat(r['role_start']) - datetime.date(1970, 1, 1)).days
    for k in ('has_mobile', 'has_email', 'has_personal_email', 'has_linkedin', 'open_to_work', 'is_hiring'):
        d[k] = b(k)
    d['has_funding'] = bool(r['funding'])
    d['has_website'] = bool((r['website'] or '').strip() or (r['company_domain'] or '').strip())
    p = r['mobile_prefix'] or ''
    if p.startswith('+') and len(p) > 1:
        # every leading part of the dialling code, so "+44" matches exactly
        d['mobile_codes'] = [p[:n] for n in range(2, len(p) + 1)]
    return d


def h(v):
    """Exact-match values are stored as numbers (much less memory than text): crc32 of the value."""
    return zlib.crc32(v.encode()) & 0x7fffffff


def compact(d, fields):
    for name, typ in fields.items():
        if name == 'rank':
            d['rank'] = h(d['id'])
        elif name.endswith('_h') and name[:-2] in d:
            v = d[name[:-2]]
            d[name] = [h(x) for x in v] if typ.endswith('[]') else h(v)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--batch', type=int, default=5000)
    ap.add_argument('--max-rate', type=int, default=0, help='rows per second, 0 = no cap')
    ap.add_argument('--schema', default=os.path.join(HERE, 'leads-schema.json'))
    ap.add_argument('--alias', default='leads', help='alias to point at the new collection')
    ap.add_argument('--max-memory-gb', type=float, default=6.0, help='stop (and keep the current collection) above this')
    ap.add_argument('--in-place', action='store_true', help='upsert into the collection behind the alias instead of building a new one (new leads are added, existing ones refreshed; memory stays flat)')
    ap.add_argument('--ids-file', help='load only these contact_ids (one per line), in place, looked up 1,000 at a time by index instead of reading the whole table')
    a = ap.parse_args()
    ids = None
    if a.ids_file:
        a.in_place = True
        uuid = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
        ids = list(dict.fromkeys(l.strip() for l in open(a.ids_file) if uuid.match(l.strip())))
        print(f'{len(ids):,} contact ids to load', flush=True)
        if not ids:
            sys.exit('no contact ids in the file')

    schema = json.load(open(a.schema))
    keep = {f['name'] for f in schema['fields']}
    types = {f['name']: f['type'] for f in schema['fields']}
    if a.in_place:
        name = json.loads(ts('GET', f'/aliases/{a.alias}'))['collection_name']
        before = json.loads(ts('GET', f'/collections/{name}'))['num_documents']
        print(f'updating {name} in place ({before:,} leads now)', flush=True)
    else:
        name = a.alias + '_' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
        schema['name'] = name
        ts('POST', '/collections', schema)
        print(f'created {name}', flush=True)

    base = f"select {', '.join(COLS)} from search_export.leads"
    if ids is None:
        sqls = [base + (f' limit {a.limit}' if a.limit else '')]
    else:
        # ids are checked as uuids above, so they are safe to inline
        sqls = [base + " where contact_id in (" + ', '.join(f"'{x}'" for x in ids[i:i + 1000]) + ")" for i in range(0, len(ids), 1000)]
    pg = None

    def rows():
        nonlocal pg
        for sql in sqls:
            pg = subprocess.Popen(['psql', '-X', '-q', '-c', f'\\copy ({sql}) to stdout with csv'], stdout=subprocess.PIPE,
                                  env={**os.environ, **env_file('/opt/typesense/reader.env')})
            yield from csv.reader(io.TextIOWrapper(pg.stdout, encoding='utf-8', newline=''))
            if pg.wait() != 0:
                return

    reader = rows()
    batch, n, failed, t0 = [], 0, 0, time.time()

    def flush():
        nonlocal failed
        if not batch:
            return
        res = ts('POST', f'/collections/{name}/documents/import?action=upsert&batch_size={a.batch}', raw='\n'.join(json.dumps(x) for x in batch).encode())
        bad = [l for l in res.splitlines() if '"success":false' in l]
        failed += len(bad)
        if bad and failed <= 5:
            print('import error:', bad[0][:300], flush=True)
        batch.clear()

    for row in reader:
        batch.append({k: v for k, v in compact(doc(row), types).items() if k == 'id' or k in keep})
        n += 1
        if len(batch) >= a.batch:
            flush()
            if n % 100000 < a.batch:
                mem = int(json.loads(ts('GET', '/metrics.json'))['typesense_memory_active_bytes'])
                if mem > a.max_memory_gb * 1024 ** 3:
                    print(f'stopping: Typesense is using {mem / 1024 ** 3:.1f} GB (limit {a.max_memory_gb} GB); keeping the current collection', flush=True)
                    pg.kill()
                    if not a.in_place:
                        ts('DELETE', f'/collections/{name}')
                    sys.exit(2)
            if n % 50000 < a.batch:
                print(f'{n:,} rows, {n / (time.time() - t0):,.0f}/s, {failed} failed', flush=True)
        if a.max_rate:
            ahead = n / a.max_rate - (time.time() - t0)
            if ahead > 0:
                time.sleep(ahead)
    flush()
    if pg.wait() != 0:
        print('psql failed; keeping the current collection', flush=True)
        if not a.in_place:
            ts('DELETE', f'/collections/{name}')
        sys.exit(1)

    stats = json.loads(ts('GET', f'/collections/{name}'))
    print(f'loaded {n:,} rows into {name} ({stats["num_documents"]:,} unique leads, {failed} failed) in {time.time() - t0:,.0f}s', flush=True)
    if a.in_place:
        print(f'{stats["num_documents"] - before:,} new leads added', flush=True)
        return
    try:
        old = json.loads(ts('GET', f'/aliases/{a.alias}'))['collection_name']
    except Exception:
        old = None
    ts('PUT', f'/aliases/{a.alias}', {'collection_name': name})
    print(f'alias {a.alias} -> {name}', flush=True)
    if old and old != name:
        ts('DELETE', f'/collections/{old}')
        print(f'dropped {old}', flush=True)


if __name__ == '__main__':
    main()
