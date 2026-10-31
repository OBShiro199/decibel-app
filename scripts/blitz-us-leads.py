#!/usr/bin/env python3
"""Fill public.us_data_list with US decision makers from BlitzAPI, most senior first, until the month's
records run low. Every saved person has a verified work email and a mobile, in data_list's own formats.

  python3 scripts/blitz-us-leads.py                       # runs until records_remaining hits the reserve
  python3 scripts/blitz-us-leads.py --max 10000           # stop after 10,000 new leads
  python3 scripts/blitz-us-leads.py --reserve 5000        # keep 5,000 records back (default 1,000)

Needs BLITZ_API_KEY (or ~/.blitz_api_key), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
Progress is kept in ~/decibel-imports/blitz-us-leads.state.json, so a rerun carries on where it stopped.

Order: Blitz job levels C-Team (founders, owners, CEOs and other chiefs), then VP, Director, Manager; US
people at companies of any size, like data_list. For each page of 25 people (1 record each), anyone already
in us_data_list is skipped before any lookup; then the email (charged only when found), the mobile (only
for people with an email) and the company (cached). Complete people are inserted after every page.
"""
import importlib.util
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


scrape = load('scrape_blitz', 'scrape-blitz.py')   # Blitz calls and the per-person lookups
shape = load('import_blitz', 'import-blitz.py')    # Blitz row -> data_list columns

TIERS = ['C-Team', 'VP', 'Director', 'Manager']
STATE = os.path.expanduser('~/decibel-imports/blitz-us-leads.state.json')
URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SKEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
HDR = {'apikey': SKEY, 'authorization': f'Bearer {SKEY}', 'content-type': 'application/json'}


def rest(method, path, body=None):
    req = urllib.request.Request(f'{URL}/rest/v1/{path}', method=method, headers={**HDR, 'prefer': 'return=minimal'},
                                 data=json.dumps(body).encode() if body is not None else None)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            if e.code >= 500 and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f'{method} {path[:60]} HTTP {e.code}: {e.read()[:200]!r}')


def already_have(urls):
    """LinkedIn URLs (as stored) already in us_data_list"""
    if not urls:
        return set()
    q = ','.join('"' + u.replace('"', '') + '"' for u in urls)
    rows = rest('GET', f'us_data_list?select=linkedin_url&linkedin_url=in.({urllib.parse.quote(q)})') or []
    return {r['linkedin_url'] for r in rows}


def main():
    if not (scrape.KEY and URL and SKEY):
        sys.exit('Needs BLITZ_API_KEY (or ~/.blitz_api_key), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    cap = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else None
    reserve = int(sys.argv[sys.argv.index('--reserve') + 1]) if '--reserve' in sys.argv else 1000
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    state = json.load(open(STATE)) if os.path.exists(STATE) else {'tier': 0, 'cursor': None, 'saved': 0, 'stats': {}}
    stats, saved_now, started = state['stats'], 0, time.time()

    with ThreadPoolExecutor(max_workers=12) as pool:
        while state['tier'] < len(TIERS):
            level = TIERS[state['tier']]
            body = {'people': {'job_level': [level], 'location': {'country_code': ['US']}}, 'max_results': 25}
            if state['cursor']:
                body['cursor'] = state['cursor']
            page = scrape.call('/search/people', body)
            people = [p for p in page.get('results') or [] if p.get('linkedin_url')]
            have = already_have([shape.li(p['linkedin_url']) for p in people])
            fresh = [p for p in people if shape.li(p['linkedin_url']) not in have]
            stats['already in table'] = stats.get('already in table', 0) + len(people) - len(fresh)

            rows = []
            for row, why in pool.map(scrape.person_row, fresh):
                stats[why] = stats.get(why, 0) + 1
                if row:
                    rows.append(shape.to_row(row))
            # the same person twice in one page, or the same email twice, is inserted once
            seen, unique = set(), []
            for r in rows:
                k = (r['linkedin_url'], r['work_email'])
                if r['mobile_phone'] and r['work_email'] and k not in seen:
                    seen.add(k)
                    unique.append(r)
            if unique:
                rest('POST', 'us_data_list', unique)
            state['saved'] += len(unique)
            saved_now += len(unique)

            state['cursor'] = page.get('cursor')
            if not state['cursor']:
                state['tier'] += 1
            json.dump(state, open(STATE, 'w'))

            left = (page.get('fair_usage') or {}).get('records_remaining')
            rate = saved_now / max(1, time.time() - started) * 3600
            print(f'[{level}] +{len(unique)} · {saved_now} this run, {state["saved"]} total · {rate:,.0f}/h · {stats} · records left {left}', flush=True)
            if isinstance(left, int) and left <= reserve:
                print(f'stopping: {left} records left (reserve {reserve})')
                break
            if cap and saved_now >= cap:
                print(f'stopping: reached --max {cap}')
                break
    print(f'done: {saved_now} new leads this run, {state["saved"]} in total')


if __name__ == '__main__':
    main()
