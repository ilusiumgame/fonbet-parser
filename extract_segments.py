import gzip
import json
import os
import urllib.request

MAPPING_FILE = 'segment_mappings.json'
LISTBASE_URL = 'https://line-lb54-w.bk6bba-resources.com/ma/events/listBase?lang=ru&scopeMarket=1600'

# Fetch listBase from API
print("Fetching listBase from API...")
req = urllib.request.Request(LISTBASE_URL, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'})
with urllib.request.urlopen(req, timeout=30) as response:
    raw = response.read()
    if response.info().get('Content-Encoding') == 'gzip':
        raw = gzip.decompress(raw)
    data = json.loads(raw.decode('utf-8'))
print("listBase fetched successfully")

# Load existing mappings
existing = {}
if os.path.exists(MAPPING_FILE):
    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        existing = json.load(f)
    print(f"Loaded {len(existing)} existing segments")

# Extract segments
new_segments = {str(item['id']): item['name'] for item in data.get('sports', []) if item.get('kind') == 'segment'}

# Merge (new overwrites existing if same key)
merged = {**existing, **new_segments}
added = len(merged) - len(existing)

if added == 0:
    print("No new segments found. Nothing to update.")
    exit(0)

with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)

print(f"Added {added} new segments. Total: {len(merged)}")
