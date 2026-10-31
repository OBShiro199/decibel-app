#!/usr/bin/env python3
"""Import a Blitz people export (CSV) into public.data_list, in data_list's own formats.

  python3 scripts/import-blitz.py blitz.csv                 # dry run: prints the mapping and what would be skipped
  python3 scripts/import-blitz.py blitz.csv --write         # inserts, writes the new contact_ids to <csv>.ids.txt

--write needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in the repo). Rows go in
through PostgREST in batches of 200, a second apart, so the database stays responsive. Afterwards, send the
ids file to the search server and run `python3 load-leads.py --ids-file ids.txt` there (see search/typesense).

Rules:
- every row needs a mobile and a work email, or it is skipped
- duplicates inside the file (same LinkedIn URL or work email) are skipped; there is no check against existing
  data_list rows (no index on linkedin_url/work_email, and a 3.1M-row scan is not allowed in the daytime)
- values are converted to the formats already in data_list (country names, "51 to 200", "$10M to <$50M",
  seniority "c-level", comma-separated skills, "+1 617-320-1138")
- Blitz fields with no data_list column are dropped (connections, certifications, education, specialties...)
"""
import csv
import json
import os
import re
import sys
import time
import urllib.request
import uuid

COUNTRIES = {
    'US': 'United States', 'USA': 'United States', 'GB': 'United Kingdom', 'UK': 'United Kingdom', 'CA': 'Canada',
    'IE': 'Ireland', 'DE': 'Germany', 'FR': 'France', 'NL': 'Netherlands', 'ES': 'Spain', 'IT': 'Italy',
    'AU': 'Australia', 'IN': 'India', 'SE': 'Sweden', 'DK': 'Denmark', 'NO': 'Norway', 'FI': 'Finland',
    'CH': 'Switzerland', 'BE': 'Belgium', 'AT': 'Austria', 'PT': 'Portugal', 'PL': 'Poland', 'IL': 'Israel',
    'SG': 'Singapore', 'AE': 'United Arab Emirates', 'MX': 'Mexico', 'BR': 'Brazil', 'NZ': 'New Zealand',
}
SIZES = {  # Blitz "51-200" -> data_list "51 to 200", with min/max
    '1-10': ('1 to 10', 1, 10), '2-10': ('1 to 10', 2, 10), '11-50': ('11 to 50', 11, 50), '51-200': ('51 to 200', 51, 200),
    '201-500': ('201 to 500', 201, 500), '501-1000': ('501 to 1000', 501, 1000), '1001-5000': ('1001 to 5000', 1001, 5000),
    '5001-10000': ('5001 to 10000', 5001, 10000), '10001+': ('10001+', 10001, None), '10000+': ('10001+', 10001, None),
}


def norm_rev(v: str):
    """'$10M-$50M' -> '$10M to <$50M' (data_list's wording); None when unrecognised"""
    v = v.strip().replace(' ', '')
    if not v:
        return None
    if re.fullmatch(r'\$?1B\+|\$1B\+', v) or v.endswith('B+'):
        return '$1B+'
    if v.startswith('<') or re.fullmatch(r'\$0-\$1M', v):
        return '<$1M'
    m = re.fullmatch(r'(\$[\d.]+[MKB])-(\$[\d.]+[MKB])', v)
    if m:
        hi = m.group(2)
        if hi in ('$1B', '$1000M'):
            return f'{m.group(1)} to <$1B'
        return f'{m.group(1)} to <{hi}'
    return None


def country(v: str):
    v = (v or '').strip()
    return COUNTRIES.get(v.upper(), v) or None


def seniority(title: str):
    t = title.lower()
    if re.search(r'\b(ceo|cfo|coo|cto|cmo|cro|cio|chief|president|founder|co-founder|owner|chair(man|woman|person)?|managing partner|managing director|partner)\b', t):
        return 'c-level'
    if re.search(r'\b(vp|vice president|svp|evp)\b', t):
        return 'vp'
    if re.search(r'\b(director|head of)\b', t):
        return 'director'
    if re.search(r'\bmanager\b', t):
        return 'manager'
    return 'senior'


def phone(v: str):
    """'+16173201138' -> '+1 617-320-1138' for North America; other numbers keep their digits with a space after the code"""
    d = re.sub(r'[^\d+]', '', v or '')
    if not d:
        return None
    if not d.startswith('+'):
        d = '+' + d if len(d) > 10 else '+1' + d
    m = re.fullmatch(r'\+1(\d{3})(\d{3})(\d{4})', d)
    if m:
        return f'+1 {m.group(1)}-{m.group(2)}-{m.group(3)}'
    return d


def bare(url: str):
    u = (url or '').strip().lower()
    u = re.sub(r'^https?://', '', u).split('/')[0]
    return re.sub(r'^www\.', '', u) or None


def li(url: str):
    u = (url or '').strip().rstrip('/')
    return u.replace('http://', 'https://') or None


def clean(v):
    v = (v or '').strip()
    return v or None


def to_row(r: dict) -> dict:
    size = SIZES.get((r.get('Employee Range') or '').replace(' ', ''))
    city, state, ctry = clean(r.get('Person City')), clean(r.get('Person State')), country(r.get('Person Country'))
    founded = clean(r.get('Founded Year'))
    domain = bare(r.get('Company Domain') or r.get('Company Website'))
    emp = clean(r.get('Employees on LinkedIn'))
    alt = clean(r.get('Alternate Email'))
    return {
        'contact_id': str(uuid.uuid4()),
        'first_name': clean(r.get('First Name')),
        'last_name': clean(r.get('Last Name')),
        'full_name': clean(r.get('Full Name')),
        'work_email': (clean(r.get('Work Email')) or '').lower() or None,
        'email_status': None,  # Blitz doesn't say whether it verified the mailbox
        'personal_emails': alt.lower() if alt else None,
        'mobile_phone': phone(r.get('Mobile Phone')),
        'current_title': clean(r.get('Job Title')),
        'department': None,
        'seniority_level': seniority(r.get('Job Title') or ''),
        'role_start_date': clean(r.get('Role Start Date')),
        'current_employer': clean(r.get('Company Name')),
        'current_employer_website': domain,
        'company_website': domain,
        'company_domain': domain,
        'company_name': clean(r.get('Company Name')),
        'current_employer_linkedin_url': li(r.get('Company LinkedIn URL')),
        'company_industry': clean(r.get('Industry')),
        'main_industry': clean(r.get('Industry')),
        'employee_count_range': size[0] if size else None,
        'employee_count_min': size[1] if size else None,
        'employee_count_max': size[2] if size else None,
        'linkedin_employee_count_exact': int(emp) if emp and emp.isdigit() else None,
        'revenue_range': norm_rev(r.get('Revenue Range') or ''),
        'company_founded_year': f'{founded}-01-01T00:00:00Z' if founded and founded.isdigit() else None,
        'company_hq_country': country(r.get('HQ Country')),
        'company_hq_city': clean(r.get('HQ City')),
        'contact_location': ', '.join(x for x in (city, state, ctry) if x) or None,
        'contact_country': ctry,
        'contact_state': state,
        'contact_city': city,
        'linkedin_url': li(r.get('Person LinkedIn URL')),
        'linkedin_headline': clean(r.get('LinkedIn Headline')),
        'about_person': clean(r.get('Person Summary')),
        'skills': ','.join(s.strip() for s in (r.get('Top Skills') or '').split(';') if s.strip()) or None,
        'languages': None,
        'social_media_json': None,
        'smart_tags': None,
        'open_to_work': None,
        'is_hiring': None,
        'company_description': clean(r.get('Company Description')),
        'company_contact_info_json': None,
        'company_tech_stack': None,
        'last_funding_type': None,
        'total_funding_amount': None,
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    if not args:
        sys.exit(__doc__)
    path = args[0]
    with open(path, newline='', encoding='utf-8-sig') as f:
        raw = list(csv.DictReader(f))

    rows, skipped, seen = [], {'no mobile': 0, 'no work email': 0, 'duplicate in file': 0}, set()
    unmapped = {'revenue': set(), 'size': set()}
    for r in raw:
        row = to_row(r)
        if not row['mobile_phone']:
            skipped['no mobile'] += 1
            continue
        if not row['work_email']:
            skipped['no work email'] += 1
            continue
        keys = {k for k in (row['linkedin_url'] and row['linkedin_url'].lower(), row['work_email']) if k}
        if keys & seen:
            skipped['duplicate in file'] += 1
            continue
        seen |= keys
        if (r.get('Revenue Range') or '').strip() and not row['revenue_range']:
            unmapped['revenue'].add(r['Revenue Range'])
        if (r.get('Employee Range') or '').strip() and not row['employee_count_range']:
            unmapped['size'].add(r['Employee Range'])
        rows.append(row)

    print(f'{len(raw)} rows in file · {len(rows)} to import · skipped {skipped}')
    if unmapped['revenue'] or unmapped['size']:
        print('unrecognised values (left empty):', {k: sorted(v) for k, v in unmapped.items() if v})
    if rows:
        print('first row as it will be stored:')
        print(json.dumps({k: v for k, v in rows[0].items() if v is not None}, indent=2, ensure_ascii=False)[:2500])
    if not write:
        print('\ndry run: nothing written. Add --write to insert.')
        return

    url, key = os.environ.get('SUPABASE_URL', '').rstrip('/'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        sys.exit('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --write')
    done = 0
    ids_path = path + '.ids.txt'
    with open(ids_path, 'w') as ids:
        for i in range(0, len(rows), 200):
            batch = rows[i:i + 200]
            req = urllib.request.Request(
                f'{url}/rest/v1/data_list',
                data=json.dumps(batch).encode(),
                method='POST',
                headers={'apikey': key, 'authorization': f'Bearer {key}', 'content-type': 'application/json', 'prefer': 'return=minimal'},
            )
            with urllib.request.urlopen(req, timeout=60) as res:
                if res.status not in (200, 201, 204):
                    sys.exit(f'insert failed at row {i}: HTTP {res.status}')
            ids.writelines(r['contact_id'] + '\n' for r in batch)
            done += len(batch)
            print(f'inserted {done}/{len(rows)}')
            time.sleep(1)
    print(f'done. {done} new contact_ids in {ids_path}')


if __name__ == '__main__':
    main()
