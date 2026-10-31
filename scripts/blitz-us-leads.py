#!/usr/bin/env python3
"""Fill public.us_data_list with US decision makers from BlitzAPI, most senior first, until told to stop or the
month's records run low. Every saved person has a verified work email and a mobile, in data_list's formats.

  python3 scripts/blitz-us-leads.py --max 10000           # stop after 10,000 new leads
  python3 scripts/blitz-us-leads.py                       # run until records_remaining hits the reserve
  python3 scripts/blitz-us-leads.py --reserve 5000        # keep 5,000 records back (default 1,000)
  python3 scripts/blitz-us-leads.py --emails-only         # no mobile lookup: keep everyone with a verified email
  ... --floor 0.3                                         # park a slice when under 30% of a round are kept

Needs BLITZ_API_KEY (or ~/.blitz_api_key), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
Progress is kept in ~/decibel-imports/blitz-us-slices.state.json, so a rerun carries on where it stopped.

How it works:
- Tiers, most senior first: CEOs/founders/owners/presidents, then other C-level (excluding those titles, so no
  one is bought twice), then VP, Director, Manager. US people only, companies with mail (MX) records.
- Blitz stops any one search after 50,000 people, so each tier is cut into non-overlapping slices: one per
  company size band, and a band too big for one search is cut again by industry (534 + Unknown). A company has
  one size and one industry, so slices never overlap. A slice's first page tells its size; a page from a slice
  that has to be split is the only waste (at most 25 records).
- Several pages are gathered, people already in us_data_list are dropped, then everyone is looked up together
  (email first, mobile only with an email, company cached) so the email endpoint, the bottleneck, stays busy.
- The speed follows the plan's limit (GET /account/key-info), so upgrading to Scale needs no change.
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

TOP = ['CEO', 'Chief Executive', 'Founder', 'Co-Founder', 'Cofounder', 'Owner', 'President']
TIERS = [
    ('CEOs and founders', {'job_level': ['C-Team'], 'job_title': {'include': TOP}}),
    ('Other C-level', {'job_level': ['C-Team'], 'job_title': {'exclude': TOP}}),
    ('VP', {'job_level': ['VP']}),
    ('Director', {'job_level': ['Director']}),
    ('Manager', {'job_level': ['Manager']}),
]
BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+']
INDUSTRIES = json.load(open(os.path.join(HERE, 'data', 'blitz-industries.json')))
DEPTH = 50000   # Blitz's ceiling per search
STATE = os.path.expanduser('~/decibel-imports/blitz-us-slices.state.json')
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
    have = set()
    for i in range(0, len(urls), 50):
        q = ','.join('"' + u.replace('"', '') + '"' for u in urls[i:i + 50])
        have |= {r['linkedin_url'] for r in rest('GET', f'us_data_list?select=linkedin_url&linkedin_url=in.({urllib.parse.quote(q)})') or []}
    return have


def search_body(tier, sl, cursor):
    people = {**TIERS[tier][1], 'location': {'country_code': ['US']}}
    company = {'mx': {'provider': {'include': ['any']}}, 'employee_range': [sl['band']]}
    if sl.get('industry'):
        company['industry'] = {'include': [sl['industry']]}
    body = {'people': people, 'company': company, 'max_results': 25}
    if cursor:
        body['cursor'] = cursor
    return body


def label(state):
    if state['tier'] >= len(TIERS):
        return 'done'
    sl = state['slices'][0] if state['slices'] else {}
    return f"{TIERS[state['tier']][0]} · {sl.get('band', '…')}{' · ' + sl['industry'] if sl.get('industry') else ''}"


def next_page(state, stats):
    """the next page of people, moving through slices and tiers, then back through parked slices; None at the end"""
    while True:
        if state.get('mode') == 'parked':
            if not state['slices']:
                if not state.get('parked'):
                    return None
                p = state['parked'].pop(0)
                state['tier'], state['slices'], state['cursor'] = p['tier'], [p['slice']], p['cursor']
            return fetch(state, stats)
        if state['tier'] >= len(TIERS):
            if state.get('parked'):   # every slice skimmed: go back for what was left in each
                state['mode'] = 'parked'
                continue
            return None
        if not state['slices']:
            if state.get('tier_started'):
                state['tier'] += 1
                state['tier_started'] = False
                continue
            state['slices'] = [{'band': b} for b in BANDS]
            state['tier_started'] = True
        page = fetch(state, stats)
        if page is None:   # the slice was split; go round again
            continue
        return page


def fetch(state, stats):
    """one page of the current slice; None when the slice turned out too big and was split by industry"""
    sl = state['slices'][0]
    page = scrape.call('/search/people', search_body(state['tier'], sl, state.get('cursor')))
    total = page.get('total_results') or 0
    if not state.get('cursor'):   # first page of this slice: does it fit in one search?
        if total > DEPTH and not sl.get('industry'):
            state['slices'] = [{'band': sl['band'], 'industry': i} for i in INDUSTRIES] + state['slices'][1:]
            stats['slices split'] = stats.get('slices split', 0) + 1
            return None
        if total > DEPTH:
            stats['slices over 50k'] = stats.get('slices over 50k', 0) + 1
    state['cursor'] = page.get('cursor')
    if not state['cursor'] or not page.get('results'):
        state['slices'].pop(0)
        state['cursor'] = None
        stats['slices done'] = stats.get('slices done', 0) + 1
    return page


def main():
    if not (scrape.KEY and URL and SKEY):
        sys.exit('Needs BLITZ_API_KEY (or ~/.blitz_api_key), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    cap = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else None
    reserve = int(sys.argv[sys.argv.index('--reserve') + 1]) if '--reserve' in sys.argv else 1000
    pages = int(sys.argv[sys.argv.index('--pages') + 1]) if '--pages' in sys.argv else 16
    emails_only = '--emails-only' in sys.argv
    floor = float(sys.argv[sys.argv.index('--floor') + 1]) if '--floor' in sys.argv else 0.3
    scrape.MOBILE[0] = not emails_only
    rps, left = scrape.set_rate()
    print(f'Blitz limit {rps:g} requests/second per endpoint · {left} records left · {"emails only" if emails_only else "email and mobile"}', flush=True)
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    state = json.load(open(STATE)) if os.path.exists(STATE) else {'tier': 0, 'slices': [], 'cursor': None, 'saved': 0, 'stats': {}}
    stats, saved_now, started = state['stats'], 0, time.time()

    # enough lookups in flight to keep every endpoint at its limit (about 2 per request-per-second of limit)
    with ThreadPoolExecutor(max_workers=max(24, int(rps * 2.5))) as pool:
        while True:
            people, left, where = [], None, label(state)
            for _ in range(pages):
                page = next_page(state, stats)
                if page is None:
                    break
                people += [p for p in page.get('results') or [] if p.get('linkedin_url')]
                left = (page.get('fair_usage') or {}).get('records_remaining', left)
                if label(state) != where:   # one slice per round, so its hit rate can be judged
                    break
            if not people and page is None:
                print('every tier and parked slice done')
                break
            have = already_have([shape.li(p['linkedin_url']) for p in people])
            fresh, seen_li = [], set()
            for p in people:
                u = shape.li(p['linkedin_url'])
                if u not in have and u not in seen_li:
                    seen_li.add(u)
                    fresh.append(p)
            stats['already in table'] = stats.get('already in table', 0) + len(people) - len(fresh)

            rows = []
            for row, why in pool.map(scrape.person_row, fresh):
                stats[why] = stats.get(why, 0) + 1
                if row:
                    rows.append(shape.to_row(row))
            seen, unique = set(), []
            for r in rows:
                if (r['mobile_phone'] or emails_only) and r['work_email'] and r['linkedin_url'] not in seen and r['work_email'] not in seen:
                    seen |= {r['linkedin_url'], r['work_email']}
                    unique.append(r)
            if unique:
                try:
                    rest('POST', 'us_data_list', unique)
                except RuntimeError as e:   # one malformed row fails the batch: save the rest one by one
                    if 'HTTP 4' not in str(e):
                        raise
                    kept = []
                    for r in unique:
                        try:
                            rest('POST', 'us_data_list', [r])
                            kept.append(r)
                        except RuntimeError as e1:
                            if 'HTTP 4' not in str(e1):
                                raise
                            stats['rejected by table'] = stats.get('rejected by table', 0) + 1
                            print(f'skipped {r["linkedin_url"]}: {str(e1)[:160]}', flush=True)
                    unique = kept
            state['saved'] += len(unique)
            saved_now += len(unique)
            # skim: when a slice's hit rate falls below the floor, park it (keeping its place) and move on to
            # fresh slices, whose first pages are richer; parked slices are finished after every slice is skimmed
            hit = len(unique) / max(1, len(fresh))
            if state.get('mode') != 'parked' and state.get('cursor') and label(state) == where and len(fresh) >= 100 and hit < floor:
                state.setdefault('parked', []).append({'tier': state['tier'], 'slice': state['slices'][0], 'cursor': state['cursor']})
                state['slices'].pop(0)
                state['cursor'] = None
                stats['slices parked'] = stats.get('slices parked', 0) + 1
            json.dump(state, open(STATE, 'w'))

            rate = saved_now / max(1, time.time() - started) * 3600
            print(f'[{where}] +{len(unique)} ({hit:.0%}) · {saved_now:,} this run, {state["saved"]:,} total · {rate:,.0f}/h · {stats} · records left {left}', flush=True)
            if isinstance(left, int) and left <= reserve:
                print(f'stopping: {left} records left (reserve {reserve})')
                break
            if cap and saved_now >= cap:
                print(f'stopping: reached --max {cap}')
                break
    print(f'done: {saved_now:,} new leads this run, {state["saved"]:,} in total')


if __name__ == '__main__':
    main()
