"""Retrieve only the eight referenced games for local use; no third-party corpus is bundled."""
import datetime, hashlib, json, pathlib, time, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
sources = json.loads((ROOT / 'data/sources.json').read_text(encoding='utf-8'))
log_path = ROOT / 'data/fetch-log.json'
previous = {r['file']: r for r in json.loads(log_path.read_text(encoding='utf-8'))} if log_path.exists() else {}
log = []
def retrieve(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'HexStrata-local-study/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()
for record in sources:
    target = ROOT / 'data/raw' / record['file']
    cached = target.exists() and previous.get(record['file'], {}).get('sha256') == record['sha256']
    if cached:
        data = target.read_bytes()
    else:
        data = retrieve(record['url'])
    digest = hashlib.sha256(data).hexdigest()
    if digest != record['sha256']:
        raise RuntimeError('Source changed; review before using: ' + record['url'])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    log.append({'file': record['file'], 'url': record['url'], 'sha256': digest,
                'retrieved': previous[record['file']]['retrieved'] if cached else datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    if record.get('pageURL'):
        page = ROOT / 'data/source-pages' / (record['id'] + '.html')
        if not page.exists():
            page.parent.mkdir(parents=True, exist_ok=True)
            page.write_bytes(retrieve(record['pageURL']))
    print('Verified', record['id'])
    time.sleep(0.25)
(ROOT / 'data/fetch-log.json').write_text(json.dumps(log, indent=2), encoding='utf-8')
print('Run: node scripts/build-records.cjs')