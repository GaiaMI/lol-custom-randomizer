"""Assemble dist/index.html and dist/data.js from src/template.html and the files in data/.

Usage (from the project root):  python scripts/build.py
Needs only Python 3, no extra package.
"""
import glob
import hashlib
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)

LANE = {'T': 'top', 'J': 'jungle', 'M': 'middle', 'B': 'bottom', 'S': 'support'}
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())


def load_roster():
    champs = []
    for line in open(D('data', 'roster.txt'), encoding='utf-8').read().strip().split('\n'):
        n, r, c, d, rg, df, y, reg = line.split('|')
        champs.append({"n": n, "r": [LANE[x] for x in r.split(',')], "c": c.split(','), "d": d,
                       "rg": rg, "df": int(df), "y": int(y), "reg": reg})
    return champs


def load_counters(names):
    bynorm = {norm(n): n for n in names}
    bynorm.update({'nunu': 'Nunu & Willump', 'renata': 'Renata Glasc', 'monkeyking': 'Wukong', 'mundo': 'Dr. Mundo'})
    counters, patches, missing, unknown = {}, {}, [], set()
    files = sorted(glob.glob(D('data', 'counters', 'counters_*.json'))) + sorted(glob.glob(D('data', 'counters', 'sec_*.json')))
    for f in files:  # later files override earlier ones for the same champion|lane
        for k, v in json.load(open(f, encoding='utf-8')).items():
            kn = bynorm.get(norm(k.split('|')[0]))
            if not kn:
                unknown.add(k)
                continue

            def fix(lst):
                out = []
                for o, w in lst or []:
                    on = bynorm.get(norm(o))
                    if not on:
                        unknown.add(o)
                        continue
                    if on != kn and on not in [x[0] for x in out]:
                        out.append([on, round(float(w), 2)])
                return out

            cb, cc = fix(v.get("counteredBy")), fix(v.get("counters"))
            both = {x[0] for x in cb} & {x[0] for x in cc}
            if both:  # tiny samples can list the same opponent on both sides
                cb = [x for x in cb if x[0] not in both or x[1] < 50]
                cc = [x for x in cc if x[0] not in both or x[1] >= 50]
            lane = v.get("lane") or (k.split('|')[1] if '|' in k else None)
            if not cb and not cc:
                missing.append(f"{kn}|{lane}")
                continue
            counters[f"{kn}|{lane}"] = {"cb": cb, "c": cc}
            patches[v.get("patch")] = patches.get(v.get("patch"), 0) + 1
    return counters, patches, missing, unknown


def main():
    champs = load_roster()
    names = {c["n"] for c in champs}
    counters, patches, missing, unknown = load_counters(names)
    idm = json.load(open(D('data', 'idmap.json'), encoding='utf-8'))
    icons = json.load(open(D('data', 'icons.json'), encoding='utf-8'))
    for c in champs:
        if c["n"] not in idm:
            raise SystemExit(f"{c['n']} manque dans data/idmap.json : lance scripts/update_ddragon.py")
        c["id"], c["fr"] = idm[c["n"]]["id"], idm[c["n"]]["fr"]
        if c["id"] not in icons:
            raise SystemExit(f"Icône manquante pour {c['n']} : lance scripts/update_ddragon.py")
    ddv = json.load(open(D('data', 'champion_fr.json'), encoding='utf-8'))["version"]
    patch = ".".join(["26"] + ddv.split(".")[1:2])  # Data Dragon 16.21.1 -> patch 26.21
    data = {"patch": patch, "ddragon": ddv, "champs": champs, "counters": counters, "icons": icons,
            "build": json.load(open(D('data', 'builddata.json'), encoding='utf-8'))}
    data["build"]["en"] = json.load(open(D('data', 'names_en.json'), encoding='utf-8'))

    covered = {k.split('|')[0] for k in counters}
    print(f"{len(champs)} champions, {len(counters)} combinaisons champion|poste avec counters")
    print("patches des counters :", patches)
    if names - covered:
        print("SANS AUCUN COUNTER :", sorted(names - covered))
    if missing:
        print("entrées vides ignorées :", missing)
    if unknown:
        print("noms inconnus ignorés :", sorted(unknown))

    js = 'const DATA=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    html = open(D('src', 'template.html'), encoding='utf-8').read()
    html = html.replace('__DATA_V__', hashlib.sha1(js.encode('utf-8')).hexdigest()[:10])
    os.makedirs(D('dist'), exist_ok=True)
    open(D('dist', 'data.js'), 'w', encoding='utf-8', newline='\n').write(js)
    open(D('dist', 'index.html'), 'w', encoding='utf-8', newline='\n').write(html)
    print(f"dist/index.html écrit ({len(html) // 1024} Ko), dist/data.js écrit ({len(js) // 1024} Ko)")


if __name__ == '__main__':
    main()
