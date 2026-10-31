#!/usr/bin/env python3
"""Import a Blitz people export (CSV) into public.us_data_list (migration 0045), in data_list's own formats.

  python3 scripts/import-blitz.py blitz.csv                 # dry run: prints the mapping and what would be skipped
  python3 scripts/import-blitz.py blitz.csv --write         # inserts, writes the new contact_ids to <csv>.ids.txt
  ... --table data_list                                     # into data_list instead (not checked for existing rows)

--write needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never in the repo). Rows go in
through PostgREST in batches of 200, a second apart, so the database stays responsive. us_data_list is not
searched by the app yet, so there is no search-server step; for data_list, send the ids file to the search
server and run `python3 load-leads.py --ids-file ids.txt` there (see search/typesense).

Rules:
- every row needs a mobile and a work email, or it is skipped
- duplicates inside the file (same LinkedIn URL or work email) are skipped, and so are people already in
  us_data_list (looked up by its linkedin_url and work_email indexes; data_list has no such index)
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
import urllib.parse
import urllib.request
import uuid

COUNTRIES = {
    'US': 'United States', 'USA': 'United States', 'GB': 'United Kingdom', 'UK': 'United Kingdom', 'CA': 'Canada',
    'IE': 'Ireland', 'DE': 'Germany', 'FR': 'France', 'NL': 'Netherlands', 'ES': 'Spain', 'IT': 'Italy',
    'AU': 'Australia', 'IN': 'India', 'SE': 'Sweden', 'DK': 'Denmark', 'NO': 'Norway', 'FI': 'Finland',
    'CH': 'Switzerland', 'BE': 'Belgium', 'AT': 'Austria', 'PT': 'Portugal', 'PL': 'Poland', 'IL': 'Israel',
    'SG': 'Singapore', 'AE': 'United Arab Emirates', 'MX': 'Mexico', 'BR': 'Brazil', 'NZ': 'New Zealand',
    'AR': 'Argentina', 'BD': 'Bangladesh', 'HK': 'Hong Kong', 'JM': 'Jamaica', 'LK': 'Sri Lanka', 'LU': 'Luxembourg',
    'MY': 'Malaysia', 'NG': 'Nigeria', 'NI': 'Nicaragua', 'PK': 'Pakistan', 'RO': 'Romania', 'ZA': 'South Africa',
    'PH': 'Philippines', 'CN': 'China', 'JP': 'Japan', 'KR': 'South Korea', 'TW': 'Taiwan', 'TH': 'Thailand',
    'VN': 'Vietnam', 'ID': 'Indonesia', 'TR': 'Turkey', 'GR': 'Greece', 'CZ': 'Czech Republic', 'HU': 'Hungary',
    'UA': 'Ukraine', 'EG': 'Egypt', 'KE': 'Kenya', 'SA': 'Saudi Arabia', 'QA': 'Qatar', 'CL': 'Chile', 'CO': 'Colombia',
    'PE': 'Peru', 'CR': 'Costa Rica', 'PR': 'Puerto Rico', 'DO': 'Dominican Republic', 'BM': 'Bermuda', 'KY': 'Cayman Islands',
}
# country calling codes the phone formatter recognises; longer codes are matched first
CALLING = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
           '51', '52', '54', '55', '56', '57', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92',
           '94', '234', '254', '351', '352', '353', '358', '852', '880', '886', '966', '971', '972', '974']

# post-nominals stripped from names (data_list names rarely carry them)
CREDENTIALS = (r'(?:MBA|EMBA|PhD|Ph\.D\.?|MD|M\.D\.?|DO|JD|J\.D\.?|CPA|CFA|CFP®?|CAIA|PE|P\.E\.?|PMP|SHRM-?\w*|SPHR|PHR|CSP|'
               r'SIOR|CCIM|BCBA|LBA|MSED|MPH|MS|MA|BS|B\.S\.?|BA|CIP|CLC|CRC|CISSP|CISA|CISM|Esq\.?|RN|LCSW|PsyD|EdD|'
               r'Ed\.D\.?|PharmD|MSc|BSc|MEng|BEng|DPT|DNP|DrPH|LLM|LL\.M\.?|MSN|BSN|DDS|DMD|FACHE|CAE|CRE|ACC|PCC|MCC|CPCU|CLU|ChFC|AIF|CEPA|II|III|IV|Jr\.?|Sr\.?)')

DEPARTMENTS = [  # data_list's department names, picked from the title
    (r'\b(cfo|finance|financial|accounting|controller|treasur\w*)\b', 'Finance & Accounting'),
    (r'\b(cto|cio|ciso|technology|technical|engineering|it|information|data|software)\b', 'Information Technology & Engineering'),
    (r'\b(cmo|marketing|brand|product)\b', 'Marketing & Product Management'),
    (r'\b(cro|sales|revenue|business development|commercial)\b', 'Sales & Business Development'),
    (r'\b(coo|operations|operating|supply chain|logistics)\b', 'Operations & Supply Chain'),
    (r'\b(chro|people|human resources|hr|talent)\b', 'Human Resources'),
    (r'\b(legal|counsel|compliance|clo)\b', 'Legal & Compliance'),
    (r'\b(creative|design)\b', 'Design & Creative Services'),
    (r'\b(customer|client|support|success)\b', 'Customer Service & Support'),
]
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
    """as data_list (GetLeads) classes titles: chiefs, presidents, founders and owners are c-level; partners,
    managing directors and chairs without one of those words are director"""
    t = title.lower()
    if re.search(r'\b(ceo|cfo|coo|cto|cmo|cro|cio|cpo|chief|president|founder|co-founder|cofounder|owner)\b', t) \
            and not re.search(r'\bvice president\b', t):
        return 'c-level'
    if re.search(r'\b(vp|vice president|svp|evp)\b', t):
        return 'vp'
    if re.search(r'\b(director|head of|partner|chair(man|woman|person)?|principal)\b', t):
        return 'director'
    if re.search(r'\bmanager\b', t):
        return 'manager'
    return 'senior'


def phone(v: str):
    """data_list's formats: '+16173201138' -> '+1 617-320-1138', '+447808234444' -> '+44 7808 234444', other
    countries '+351918918993' -> '+351 918 918 993' (the code, then groups of three)"""
    d = re.sub(r'[^\d+]', '', str(v or ''))
    if not d:
        return None
    if not d.startswith('+'):
        d = '+' + d if len(d) > 10 else '+1' + d
    m = re.fullmatch(r'\+1(\d{3})(\d{3})(\d{4})', d)
    if m:
        return f'+1 {m.group(1)}-{m.group(2)}-{m.group(3)}'
    m = re.fullmatch(r'\+44(\d{4})(\d{6})', d)
    if m:
        return f'+44 {m.group(1)} {m.group(2)}'
    digits = d[1:]
    cc = next((c for c in sorted(CALLING, key=len, reverse=True) if digits.startswith(c)), None)
    if not cc:
        return d
    rest = digits[len(cc):]
    groups = [rest[i:i + 3] for i in range(0, len(rest), 3)]
    if len(groups) > 1 and len(groups[-1]) < 3:
        tail = groups.pop()
        groups[-1] += tail
    return f'+{cc} ' + ' '.join(groups)


def clean_name(v):
    """'Dr. Eric A. Hughes, MD, PhD' -> 'Eric A. Hughes'; 'James A. (Jim) Westropp' -> 'James A. Westropp';
    'Professor Ari Zoldan - Public and Investor Relations Expert' -> 'Ari Zoldan'"""
    n = clean(v)
    if not n:
        return None
    n = re.split(r'\s+[-–—|]\s+|\s*\|\s*', n)[0]                      # taglines after " - " or " | "
    n = re.sub(r'\s*\([^)]*\)', '', n)                                  # nicknames in brackets
    n = re.sub(r'^(?:Dr\.?|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?|Miss|Rev\.?)\s+', '', n, flags=re.I)
    n = re.sub(r'\s+(?:President|CEO|Founder|Owner)(?:\s*/\s*\w+)*\s*$', '', n)   # "Guy Pierce President/CEO"
    def credential(seg):
        # 'PharmD', 'RVT', 'CIO/CTO', 'MSc, MBA FASA', 'RBLP-T': short tokens, mostly capitals
        toks = seg.split()
        return bool(toks) and all(len(t) <= 10 and sum(ch.isupper() for ch in t) >= max(1, len(re.sub(r'[^A-Za-z]', '', t)) // 2)
                                  for t in toks)
    parts = [p.strip() for p in n.split(',')]
    keep = [parts[0]] + [p for p in parts[1:] if p and not re.fullmatch(rf'(?:{CREDENTIALS}[\s.]*)+', p) and not credential(p)]
    if len(keep) < len(parts):                                          # 'Julie Cardoso RDCS, RVT' -> drop 'RDCS' too
        keep[0] = re.sub(r'(?:\s+[A-Z][A-Z.\-]{1,9})+$', '', keep[0])
    n = ', '.join(keep)
    n = re.sub(rf'(?:\s+{CREDENTIALS})+\s*$', '', n)                   # trailing "Joe Hillyer MBA"
    n = re.sub(r'\s{2,}', ' ', n).strip(' ,')
    return n or clean(v)


def department(title, level):
    t = (title or '').lower()
    for pattern, name in DEPARTMENTS:
        if re.search(pattern, t):
            return name
    # general leadership roles: data_list files most of them under Consulting & Strategy
    return 'Consulting & Strategy' if level in ('c-level', 'director') else None


def bare(url: str):
    u = (url or '').strip().lower()
    u = re.sub(r'^https?://', '', u).split('/')[0]
    return re.sub(r'^www\.', '', u) or None


def li(url: str):
    u = (url or '').strip().rstrip('/')
    return u.replace('http://', 'https://') or None


def clean(v):
    v = ('' if v is None else str(v)).strip()  # numbers arrive as ints when rows come straight from the API
    return v or None


def start_date(v):
    """Blitz role start dates, kept only when the year is plausible ('19-01-01T00:00:00Z' has a two-digit year)"""
    v = clean(v)
    m = re.match(r'(\d{4})-(\d{2})(?:-(\d{2}))?', v or '')
    if not m or not 1950 <= int(m[1]) <= time.gmtime().tm_year + 1 or not 1 <= int(m[2]) <= 12:
        return None
    return v


def to_row(r: dict) -> dict:
    size = SIZES.get((r.get('Employee Range') or '').replace(' ', ''))
    city, state, ctry = clean(r.get('Person City')), clean(r.get('Person State')), country(r.get('Person Country'))
    founded = clean(r.get('Founded Year'))
    domain = bare(r.get('Company Domain') or r.get('Company Website'))
    emp = clean(r.get('Employees on LinkedIn'))
    alt = clean(r.get('Alternate Email'))
    return {
        'contact_id': str(uuid.uuid4()),
        'first_name': clean_name(r.get('First Name')),
        'last_name': clean_name(r.get('Last Name')),
        'full_name': clean_name(r.get('Full Name')),
        'work_email': (clean(r.get('Work Email')) or '').lower() or None,
        'email_status': 'VALID',  # Blitz SMTP-verifies every email it returns (docs: guide/concepts/quality)
        'personal_emails': alt.lower() if alt else None,
        'mobile_phone': phone(r.get('Mobile Phone')),
        'current_title': clean(r.get('Job Title')),
        'department': department(r.get('Job Title'), seniority(r.get('Job Title') or '')),
        'seniority_level': seniority(r.get('Job Title') or ''),
        'role_start_date': start_date(r.get('Role Start Date')),
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
        'company_founded_year': f'{founded}-01-01T00:00:00Z' if founded and founded.isdigit() and 1600 <= int(founded) <= time.gmtime().tm_year else None,
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
    table = sys.argv[sys.argv.index('--table') + 1] if '--table' in sys.argv else 'us_data_list'
    if table not in ('us_data_list', 'data_list'):
        sys.exit('--table must be us_data_list or data_list')
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
    hdr = {'apikey': key, 'authorization': f'Bearer {key}', 'content-type': 'application/json'}
    if table == 'us_data_list':
        # people already in the table, by LinkedIn URL or work email (both indexed), 100 at a time
        existing = set()
        for col in ('linkedin_url', 'work_email'):
            vals = [r[col] for r in rows if r[col]]
            for i in range(0, len(vals), 100):
                q = ','.join('"' + v.replace('"', '') + '"' for v in vals[i:i + 100])
                req = urllib.request.Request(f'{url}/rest/v1/{table}?select={col}&{col}=in.({urllib.parse.quote(q)})', headers=hdr)
                with urllib.request.urlopen(req, timeout=60) as res:
                    existing |= {(col, x[col]) for x in json.loads(res.read())}
        before = len(rows)
        rows = [r for r in rows if ('linkedin_url', r['linkedin_url']) not in existing and ('work_email', r['work_email']) not in existing]
        print(f'{before - len(rows)} already in {table}, {len(rows)} new')
    done = 0
    ids_path = path + '.ids.txt'
    with open(ids_path, 'w') as ids:
        for i in range(0, len(rows), 200):
            batch = rows[i:i + 200]
            req = urllib.request.Request(
                f'{url}/rest/v1/{table}',
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
