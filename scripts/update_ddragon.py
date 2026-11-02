"""Download the latest official Riot data (Data Dragon) and regenerate:
  data/champion_fr.json   official champion list (French names)
  data/idmap.json         roster name -> Riot id + French name
  data/icons.json         champion icons (96 px WebP, base64)
  data/builddata.json     items, boots, support and jungle items, runes, shards and summoner spells + icons

Source: Riot's official Data Dragon CDN. Run daily by .github/workflows/update-data.yml.
Needs Python 3 and Pillow:  pip install pillow
Usage (from the project root):  python scripts/update_ddragon.py
Then run:  python scripts/build.py
"""
import base64
import io
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow manque : pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)
CDN = "https://ddragon.leagueoflegends.com/cdn"
VER = None  # set by main()
norm = lambda s: re.sub(r'[^a-z]', '', s.lower())


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def get_json(path):
    return json.loads(get(f"{CDN}/{VER}/data/fr_FR/{path}").decode('utf-8'))


def webp_b64(png_bytes, size):
    im = Image.open(io.BytesIO(png_bytes)).convert('RGBA').resize((size, size), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=82)
    return base64.b64encode(b.getvalue()).decode()


def fetch_icons(pairs, size):
    """pairs: list of (key, url) -> {key: base64 webp}"""
    def one(p):
        k, u = p
        try:
            return k, webp_b64(get(u), size)
        except Exception as e:
            print("  icône introuvable :", k, u, e)
            return k, None
    with ThreadPoolExecutor(12) as ex:
        return {k: v for k, v in ex.map(one, pairs) if v}


def fetch_en_names(version):
    """English names of the items, runes and spells in builddata.json, for the English version of the site."""
    base = f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US"
    grab = lambda f: json.loads(get(f"{base}/{f}").decode('utf-8'))
    bd = json.load(open(D('data', 'builddata.json'), encoding='utf-8'))
    ids = {*bd['items'], *bd['boots'], *bd['sup'], *bd['jg']}
    runes = {}
    for t in grab("runesReforged.json"):
        runes[t['id']] = t['name']
        for s in t['slots']:
            for x in s['runes']:
                runes[x['id']] = x['name']
    names = {"items": {k: v['name'] for k, v in grab("item.json")['data'].items() if k in ids}, "runes": runes,
             "spells": {v['id']: v['name'] for v in grab("summoner.json")['data'].values() if v['id'] in bd['spells']}}
    json.dump(names, open(D('data', 'names_en.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"  noms anglais {version} : {len(names['items'])} objets sur {len(ids)}, {len(runes)} runes, {len(names['spells'])} sorts")


def main():
    global VER
    VER = json.loads(get("https://ddragon.leagueoflegends.com/api/versions.json").decode('utf-8'))[0]
    print("Liste des champions…")
    champ = get_json("champion.json")
    json.dump(champ, open(D('data', 'champion_fr.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print("  version Data Dragon :", champ['version'], "-", len(champ['data']), "champions")

    roster = [l.split('|')[0] for l in open(D('data', 'roster.txt'), encoding='utf-8').read().strip().split('\n')]
    ids = {norm(v['name']): k for k, v in champ['data'].items()}
    ids.update({norm(k): k for k in champ['data']})
    idmap = {}
    for r in roster:
        k = ids.get(norm(r)) or ids.get(norm(r).replace('willump', ''))
        if not k:
            print("  ATTENTION : pas trouvé chez Riot :", r)
            continue
        idmap[r] = {"id": k, "fr": champ['data'][k]['name']}
    json.dump(idmap, open(D('data', 'idmap.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    new = sorted(set(champ['data']) - {v['id'] for v in idmap.values()})
    if new:
        print("  NOUVEAUX CHAMPIONS à ajouter dans data/roster.txt :", new)

    print("Icônes des champions…")
    pairs = [(v['id'], f"{CDN}/{VER}/img/champion/{champ['data'][v['id']]['image']['full']}") for v in idmap.values()]
    icons = fetch_icons(pairs, 96)
    json.dump(icons, open(D('data', 'icons.json'), 'w'))
    print("  ", len(icons), "icônes")

    print("Objets, runes et sorts…")
    it = get_json("item.json")['data']

    def legendary(k, v):
        if int(k) >= 10000:  # ARAM / Arena variants
            return False
        if not v['maps'].get('11') or not v['gold']['purchasable'] or v.get('into') \
                or v.get('requiredChampion') or v.get('requiredAlly'):
            return False
        t = v.get('tags', [])
        return v['gold']['total'] >= 2000 and 'Consumable' not in t and 'Trinket' not in t

    items = {k: {"n": v['name'], "t": v.get('tags', []), "g": v['gold']['total']} for k, v in it.items() if legendary(k, v)}
    boots = {k: {"n": v['name']} for k, v in it.items()
             if 'Boots' in v.get('tags', []) and v['maps'].get('11') and v['gold']['purchasable'] and v.get('depth') == 2 and int(k) < 10000}
    # support quest upgrades (what the support item turns into) and jungle pets
    sup_base = it.get('3867', {}).get('into', [])
    sup = {k: {"n": it[k]['name']} for k in sup_base if k in it}
    jg = {k: {"n": it[k]['name']} for k in ['1101', '1102', '1103'] if k in it}
    runes = get_json("runesReforged.json")
    trees = [{"id": t['id'], "n": t['name'], "ic": t['icon'],
              "rows": [[{"id": x['id'], "n": x['name'], "ic": x['icon']} for x in s['runes']] for s in t['slots']]} for t in runes]
    sp = get_json("summoner.json")['data']
    spells = {v['id']: {"n": v['name']} for v in sp.values() if 'CLASSIC' in v['modes']}

    pairs = [(f"i_{k}", f"{CDN}/{VER}/img/item/{k}.png") for k in list(items) + list(boots) + list(sup) + list(jg)]
    for t in trees:
        pairs.append((f"r_{t['id']}", f"{CDN}/img/{t['ic']}"))
        pairs += [(f"r_{x['id']}", f"{CDN}/img/{x['ic']}") for row in t['rows'] for x in row]
    pairs += [(f"s_{s}", f"{CDN}/{VER}/img/spell/{s}.png") for s in spells]
    for f in ['StatModsAdaptiveForceIcon', 'StatModsAttackSpeedIcon', 'StatModsCDRScalingIcon', 'StatModsMovementSpeedIcon',
              'StatModsHealthScalingIcon', 'StatModsHealthPlusIcon', 'StatModsTenacityIcon']:
        pairs.append((f"m_{f}", f"{CDN}/img/perk-images/StatMods/{f}.png"))
    bicons = fetch_icons(pairs, 64)
    json.dump({"items": items, "boots": boots, "sup": sup, "jg": jg, "trees": trees, "spells": spells, "icons": bicons},
              open(D('data', 'builddata.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"  {len(items)} légendaires, {len(boots)} bottes, {len(sup)} objets de support, {len(jg)} familiers, "
          f"{len(trees)} arbres de runes, {len(spells)} sorts, {len(bicons)} icônes")
    fetch_en_names(champ['version'])
    print("Terminé. Lance maintenant : python scripts/build.py")


if __name__ == '__main__':
    if '--en' in sys.argv:  # English names only, for the patch already in data/
        fetch_en_names(json.load(open(D('data', 'champion_fr.json'), encoding='utf-8'))['version'])
    else:
        main()
