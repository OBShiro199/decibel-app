#!/usr/bin/env python3
"""Scrape US CEOs from BlitzAPI into a CSV in Blitz's export layout, ready for scripts/import-blitz.py.

  python3 scripts/scrape-blitz.py out.csv --target 1000

Needs BLITZ_API_KEY in the environment, or the key on one line in ~/.blitz_api_key (never in the repo).
Resumable: progress (cursor and people already tried) is kept in <out>.state.json, so a rerun continues.

For each person found by the search (1 record each), it asks for the verified work email first, and only
when there is one, the US mobile, then the company profile (cached per company). Email and phone lookups
cost a record only when they find something, so nobody without an email ever costs a phone lookup. A person
goes into the CSV only with both an email and a mobile.
"""
import csv
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://api.blitz-api.ai/v2'
SEARCH = {
    'people': {
        'job_title': {'include': ['[CEO]', '[Chief Executive Officer]', '[Founder & CEO]', '[Founder and CEO]', '[Co-Founder & CEO]',
                                  '[Co-Founder and CEO]', '[President & CEO]', '[President and CEO]', '[Owner & CEO]', '[CEO & Founder]']},
        'location': {'country_code': ['US']},
    },
    'company': {'employee_range': ['11-50', '51-200', '201-500']},
}
COLUMNS = ['First Name', 'Last Name', 'Full Name', 'Job Title', 'LinkedIn Headline', 'Mobile Phone', 'Work Email', 'Alternate Email',
           'Email Provider', 'Person LinkedIn URL', 'LinkedIn Connections', 'Person City', 'Person State', 'Person Country',
           'Role Start Date', 'Years in Role', 'Contract Type', 'Work Arrangement', 'Role Description', 'Person Summary', 'Top Skills',
           'Skills Count', 'Certifications', 'Highest Listed School', 'Degree', 'Graduation Year', 'Company Name', 'Company Domain',
           'Company Website', 'Company LinkedIn URL', 'Industry', 'Company Type', 'Employee Range', 'Employees on LinkedIn',
           'Revenue Range', 'Founded Year', 'Company Age (yrs)', 'HQ City', 'HQ State', 'HQ Country', 'Company LinkedIn Followers',
           'Company Specialties', 'Company Description']

KEY = os.environ.get('BLITZ_API_KEY') or (open(os.path.expanduser('~/.blitz_api_key')).read().strip() if os.path.exists(os.path.expanduser('~/.blitz_api_key')) else '')
lock = threading.Lock()
# Blitz limits each endpoint to 10 requests a second, so each endpoint is paced on its own at ~9/s
_last: dict = {}


def call(path: str, body: dict) -> dict:
    """POST with a shared ~8 requests/second pace and retries on 429/5xx (those cost no records)"""
    for attempt in range(6):
        with lock:
            slot = max(time.time(), _last.get(path, 0.0) + 0.11)
            _last[path] = slot
        if slot > time.time():
            time.sleep(slot - time.time())
        req = urllib.request.Request(f'{API}{path}', data=json.dumps(body).encode(), method='POST',
                                     headers={'x-api-key': KEY, 'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {'found': False}
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f'{path} HTTP {e.code}: {e.read()[:200]!r}')
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    raise RuntimeError(f'{path} kept failing')


companies: dict = {}


def company(url: str) -> dict:
    if not url:
        return {}
    with lock:
        if url in companies:
            return companies[url]
    c = (call('/enrichment/company', {'company_linkedin_url': url}) or {}).get('company') or {}
    with lock:
        companies[url] = c
    return c


def person_row(p: dict):
    li = p.get('linkedin_url')
    if not li:
        return None, 'no linkedin'
    em = call('/enrichment/email', {'person_linkedin_url': li})
    if not em.get('found') or not em.get('email'):
        return None, 'no email'
    job = next((x for x in p.get('experiences') or [] if x.get('job_is_current')), (p.get('experiences') or [{}])[0])
    # the email at the company we list them under, when Blitz has one (its main pick can be a side business)
    dom = (job.get('company_domain') or '').lower().removeprefix('www.')
    emails = [em['email']] + [a.get('email') for a in em.get('all_emails') or [] if a.get('email')]
    email = next((e for e in emails if dom and e.lower().split('@')[-1].endswith(dom)), em['email'])
    ph = call('/enrichment/phone', {'person_linkedin_url': li})
    if not ph.get('found') or not ph.get('phone'):
        return None, 'no mobile'
    c = company(job.get('company_linkedin_url'))
    hq = c.get('hq') or {}
    loc = p.get('location') or {}
    edu = (p.get('education') or [{}])[0]
    others = [e for e in emails if e != email]
    founded = c.get('founded_year')
    return {
        'First Name': p.get('first_name'), 'Last Name': p.get('last_name'), 'Full Name': p.get('full_name'),
        'Job Title': job.get('job_title'), 'LinkedIn Headline': p.get('headline'), 'Mobile Phone': ph.get('phone'),
        'Work Email': email, 'Alternate Email': others[0] if others else '', 'Email Provider': '',
        'Person LinkedIn URL': li, 'LinkedIn Connections': p.get('connections_count'),
        'Person City': loc.get('city'), 'Person State': loc.get('state_code'), 'Person Country': loc.get('country_code'),
        'Role Start Date': job.get('job_start_date'), 'Years in Role': '', 'Contract Type': job.get('job_contract_type'),
        'Work Arrangement': job.get('job_work_arrangement'), 'Role Description': (job.get('job_description') or '')[:2000],
        'Person Summary': (p.get('about_me') or '')[:4000], 'Top Skills': '; '.join((p.get('skills') or [])[:8]),
        'Skills Count': len(p.get('skills') or []), 'Certifications': '; '.join(x.get('name', '') for x in p.get('certifications') or []),
        'Highest Listed School': edu.get('school_name'), 'Degree': edu.get('degree'), 'Graduation Year': (edu.get('end_date') or '')[:4],
        'Company Name': c.get('name') or job.get('company_name'), 'Company Domain': c.get('domain') or job.get('company_domain'),
        'Company Website': c.get('website'), 'Company LinkedIn URL': job.get('company_linkedin_url'), 'Industry': c.get('industry'),
        'Company Type': c.get('type'), 'Employee Range': c.get('size'), 'Employees on LinkedIn': c.get('employees_on_linkedin'),
        'Revenue Range': c.get('revenue_range'), 'Founded Year': founded, 'Company Age (yrs)': '',
        'HQ City': hq.get('city'), 'HQ State': hq.get('state'), 'HQ Country': hq.get('country_name') or hq.get('country_code'),
        'Company LinkedIn Followers': c.get('followers'), 'Company Specialties': '; '.join(c.get('specialties') or []),
        'Company Description': (c.get('about') or '')[:4000],
    }, 'ok'


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or not KEY:
        sys.exit(__doc__ if not args else 'Set BLITZ_API_KEY, or put the key in ~/.blitz_api_key')
    out = args[0]
    target = int(sys.argv[sys.argv.index('--target') + 1]) if '--target' in sys.argv else 1000
    state_path = out + '.state.json'
    state = json.load(open(state_path)) if os.path.exists(state_path) else {'cursor': None, 'tried': [], 'stats': {}}
    tried = set(state['tried'])
    # count rows with the CSV reader: bios and descriptions contain line breaks, so lines overcount
    have = sum(1 for _ in csv.DictReader(open(out, encoding='utf-8'))) if os.path.exists(out) else 0
    f = open(out, 'a', newline='', encoding='utf-8')
    w = csv.DictWriter(f, fieldnames=COLUMNS)
    if not os.path.getsize(out):
        w.writeheader()
    stats = state['stats']
    print(f'starting with {have} saved, target {target}')
    with ThreadPoolExecutor(max_workers=4) as pool:
        while have < target:
            page = call('/search/people', {**SEARCH, 'max_results': 25, **({'cursor': state['cursor']} if state['cursor'] else {})})
            people = [p for p in page.get('results') or [] if p.get('linkedin_url') not in tried]
            for p, (row, why) in zip(people, pool.map(person_row, people)):
                tried.add(p.get('linkedin_url'))
                stats[why] = stats.get(why, 0) + 1
                if row:  # keep every complete lead already paid for, even past the target
                    w.writerow(row)
                    have += 1
            f.flush()
            state.update(cursor=page.get('cursor'), tried=sorted(tried), stats=stats)
            json.dump(state, open(state_path, 'w'))
            left = (page.get('fair_usage') or {}).get('records_remaining')
            print(f'{have}/{target} saved · tried {len(tried)} · {stats} · records left {left}', flush=True)
            if not page.get('cursor'):
                print('search exhausted')
                break
    f.close()
    print(f'done: {have} rows in {out}')


if __name__ == '__main__':
    main()
