# Données de counters

## D'où elles viennent

Toutes les données viennent des pages « Counters » de LoLalytics, sur le patch 26.21 (16.21 dans leur numérotation), en Emerald et plus. Chaque fichier de `data/counters/` couvre une partie des champions :

- `counters_0.json` à `counters_7.json` : le poste principal de chaque champion.
  - `counters_6.json` : 15 champions revérifiés après une première collecte douteuse.
  - `counters_7.json` : Neeko et Sona, complétés.
- `sec_0.json` à `sec_2.json` : les 76 postes secondaires, par exemple Yasuo top ou Brand jungle.

À la compilation, un fichier plus loin dans l'ordre remplace un fichier précédent pour la même combinaison champion + poste. Les fichiers `counters_*` passent avant les `sec_*`.

## Format

Deux formes de clé sont acceptées : `"Nom"` (le champ `lane` donne alors le poste) ou `"Nom|poste"`.

```json
{
  "Yasuo|top": {
    "lane": "top",
    "patch": "16.21",
    "counteredBy": [["Riven", 44.1], ["Garen", 45.0]],
    "counters":    [["Gnar", 57.2], ["Kayle", 55.9]]
  }
}
```

- `lane` : `top`, `jungle`, `middle`, `bottom` ou `support` (noms LoLalytics).
- `counteredBy` : les adversaires contre qui le champion gagne le moins, du plus faible taux au plus fort. Le nombre est **le taux de victoire du champion** contre cet adversaire.
- `counters` : les adversaires qu'il bat le plus, du plus fort taux au plus faible, même convention.
- Les noms d'adversaires sont les noms anglais. Les variantes courantes passent aussi (Nunu, Renata, Wukong, Dr. Mundo).

## Règles de collecte

La collecte a suivi ces règles :

- **Page utilisée :** `https://lolalytics.com/lol/<slug>/counters/?lane=<poste>&patch=16.21`. Le paramètre `vslane` renvoyait parfois le tableau d'un autre poste, il n'a donc pas été utilisé.
- **Vérification :** un résultat n'était gardé que si l'intitulé de la page indiquait bien « <poste> vs <poste> » et le bon patch.
- **Seuil de parties :** 300 parties minimum par matchup pour les postes principaux, 200 pour les postes secondaires. Pour les combinaisons rares, le seuil descend à 100 ou 80.
- **Quantité :** 6 à 8 adversaires de chaque côté.

Les listes contiennent parfois des picks hors méta, comme des mages en ADC ou Zyra en jungle. Ce ne sont pas des erreurs : ce sont de vrais matchups sur ce poste, qui ressortent parce qu'ils ont les écarts les plus forts.

Cinq combinaisons n'ont pas assez de parties : Akshan top, Maokai top, Séraphine ADC et mid, Twitch jungle. Le site reprend pour elles le poste principal du champion et le signale.

## Mettre à jour pour un nouveau patch

LoLalytics n'a pas d'API publique. La méthode qui a servi : visiter chaque page avec les règles ci-dessus, puis écrire les fichiers JSON dans ce format. Les combinaisons sont réparties en paquets d'une trentaine. Consigne suivie pour chaque paquet :

> Pour chaque ligne `Nom|slug|poste` du fichier X, récupère https://lolalytics.com/lol/<slug>/counters/?lane=<poste>&patch=<patch>, vérifie que l'intitulé est « <poste> vs <poste> » sur le bon patch, puis note les 8 adversaires où le champion a le plus faible taux de victoire et les 8 où il a le plus fort (au moins 200 parties). Écris le résultat dans data/counters/sec_N.json au format de docs/COUNTERS.md. N'invente aucun chiffre.

Ensuite :

1. Mets à jour la valeur `patch` et l'URL dans la consigne.
2. Relance `python scripts/build.py`. Le script affiche les patchs trouvés et les noms qu'il ne reconnaît pas.
3. Lance `node scripts/test.js`. Il vérifie qu'il y a au moins 4 counters par champion et par poste.

Le `slug` LoLalytics est l'identifiant Riot en minuscules (voir `data/idmap.json`), sauf pour Wukong : son identifiant Riot est `MonkeyKing`, mais son slug est `wukong`.
