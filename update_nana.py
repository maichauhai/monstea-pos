import json
import os
import sys
f = open('/home/nana/.openclaw/openclaw.json','r')
c = json.load(f)
f.close()

api_key = os.environ.get('NANA_API_KEY')
if not api_key:
    sys.exit('Set NANA_API_KEY before running this script.')

c['models']['providers']['9router-2'] = {
    'baseUrl': 'http://localhost:3000/v1',
    'api': 'openai-completions',
    'apiKey': api_key,
    'models': [{
        'id': 'Nana-Smart',
        'name': 'Nana-Smart',
        'api': 'openai-completions',
        'reasoning': False,
        'input': ['text'],
        'cost': {'input':0,'output':0,'cacheRead':0,'cacheWrite':0},
        'contextWindow': 200000,
        'maxTokens': 4096
    }]
}

c['agents']['defaults']['model']['primary'] = '9router-2/Nana-Smart'
c['agents']['defaults']['models']['9router-2/Nana-Smart'] = {}
c['agents']['list'] = [{'id':'main','model':'9router-2/Nana-Smart'}]

f = open('/home/nana/.openclaw/openclaw.json','w')
json.dump(c, f, indent=2)
f.close()
print('Done - Nana now uses 9router-2/Nana-Smart like Long Nhi')
