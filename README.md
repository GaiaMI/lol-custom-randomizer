# lol-custom-randomizer

**Live site: https://gaiami.github.io/lol-custom-randomizer/**

A website for League of Legends custom games with friends. It draws teams, roles and champions, and optionally a build and runes. It can also suggest a counter to the opposing champion, or set up a five-player Flex stack. The site is available in English and French.

The site is a static page with no server and no database. `dist/index.html` holds the page, and `dist/data.js` holds all the data, icons included.

## Run the site locally

The ready-to-use site is in `dist/`:

- **Windows**: double-click `dist/Lancer (Windows).bat`. The site opens at http://localhost:8080. There is nothing to install, it uses PowerShell, which comes with Windows. Close the black window to stop it.
- **Mac**: `dist/Lancer (Mac).command`. The first time, right-click it and choose "Open".
- **Linux**: `dist/lancer-linux.sh`.
- **Without a server**: double-click `dist/index.html`. Everything works, except that build links then point to the file.

## What the site does

| Tab | Purpose |
|---|---|
| 5v5 draw | Draws champions one by one, role by role. Once the opposing player has a champion, a panel suggests its counters or preys for that role. |
| Flex 5 | The same draw for a single team of five, with no opponent: roles and champions, no counters. It uses the players of the blue team. Switching between 5v5 and Flex starts from an empty draw. |
| One champion | Draws a single champion with the reel, and can draw a random build and runes for it. |
| Counters | For a champion and a role, shows what it loses to and what it beats, and can draw one of them. |
| My pool | Removes champions from the draw. This choice is saved in the browser. |

In "Players and options", you can:

- enter names and ranks;
- shuffle the teams, balanced if ranks are entered, fully random otherwise;
- shuffle the roles;
- drag a player onto another to swap their places;
- choose pairs of players to put on different teams;
- force a role on a player, who keeps it on every shuffle;
- force one or more champion types on a player (champion role, class, damage, range, difficulty), either shown as "Forced" on their line or in discreet mode;
- choose which champions are possible for a role;
- turn on random builds and runes, with a shareable link for each player.

The filters on the right (class, damage, range, difficulty, year, region, ARAM mode) apply to every draw.

## Project layout

```
src/template.html        the page: HTML, CSS and JavaScript (one file)
data/roster.txt          champions and their attributes (see below)
data/counters/*.json     LoLalytics matchups, by champion and role
data/champion_fr.json    official Riot list (Data Dragon), French names
data/idmap.json          roster name -> Riot id and French name
data/names_en.json       English names of items, runes and spells
data/icons.json          champion icons (base64 WebP)
data/builddata.json      items, runes, shards, spells and their icons
scripts/build.py         assembles dist/index.html from src/ and data/
scripts/update_ddragon.py  downloads the latest Riot data
scripts/test.js          automated test in a headless browser
dist/                    the ready-to-serve site, with its launchers, icons and sitemap
docs/COUNTERS.md         where the counters come from and how to update them (in French)
```

`build.py` copies `src/template.html` to `dist/index.html` and writes all the data to `dist/data.js`, with a version number in its address so browsers pick up new data. So these two files are never edited by hand: change `src/template.html` or `data/`, then run the build again.

## Commands

```bash
python scripts/build.py              # rebuilds dist/index.html and dist/data.js (Python 3, nothing to install)
python scripts/update_ddragon.py     # updates champions, icons, items, runes (pip install pillow)
python scripts/update_ddragon.py --en  # reloads only the English names for the current patch
node scripts/test.js                 # checks the site (npm install playwright, then npx playwright install chromium)
```

## Format of data/roster.txt

One line per champion:

```
Name|Roles|Classes|Damage|Range|Difficulty|Year|Region
Yasuo|M,T,B|Fighter|AD|Melee|3|2013|Ionia
```

- **Roles**: `T` top, `J` jungle, `M` mid, `B` ADC, `S` support. The first one is the main role.
- **Classes**: Fighter, Mage, Assassin, Tank, Marksman, Support. Several values are possible, separated by commas.
- **Damage**: AD, AP or Hybrid.
- **Range**: Melee, Ranged or Both.
- **Difficulty**: 1 (easy) to 3 (hard).
- **Region**: the English name of the League of Legends region (Ionia, Demacia…).

The name must be the champion's English name. `update_ddragon.py` links it to the Riot id and the French name.

## Update after a patch

`.github/workflows/update-data.yml` runs every day. When Riot publishes a new patch, it downloads the data, rebuilds the site and runs the tests. If they pass, it publishes the update. If they fail, nothing changes and GitHub reports a failed run. To run it by hand, open the Actions tab, choose "Update Riot data" and click "Run workflow".

Two things stay manual:

1. **New champions**: the run opens an issue. Add the champion to `data/roster.txt`, then run `python scripts/update_ddragon.py` to get its icon. It also needs its own counters, otherwise it only shows up in the counters of other champions.
2. **Counters**: they stay on their own patch until they are collected again (see `docs/COUNTERS.md`). Then update the patch shown in the footer and in the counter panel in `src/template.html`.

## How it works

**Counters.** These are LoLalytics matchups in Emerald and above, between players of the same role, kept separate for each role a champion plays. Data from one side also serves the other: if A wins 56% against B in top, B wins 44% against A in top. For a role where a champion has too few games, the site falls back on its main role and says so.

**Ranks.** Each division counts as one step (Iron IV = 0, Diamond I = 27). Master is 29, Grandmaster 33 and Challenger 39. A player's weight is 1.1 to the power of their step, so it grows by about 10% per division. The shuffle computes the 252 possible splits into two teams of 5, drops those that put a separated pair together, keeps the most balanced ones and picks one at random. With no rank entered, all valid splits have the same chance. These settings are in `rankScore` and the `K` constant in `src/template.html`.

**Languages.** The FR / EN button in the header switches language without reloading the page, so the current draw stays. With no saved choice, the site follows the browser language: French if it starts with `fr`, English otherwise. The page is written in English in `src/template.html`. Its fixed text is translated in `STATIC_FR`, which runs before the data loads so visitors never see the wrong language. Text built in JavaScript carries both languages: `L("français", "english")`.

**Forced role.** The player moves to their role as soon as you click, and both shuffles leave them there. At most two players can share a role, and they are then always on opposite teams. They can only be dragged onto the same role on the other team. This setting doesn't change the champion: that is what "Champion role" does.

**Forced type.** The type belongs to the player, not the line: it follows them when they change team or role, and a drawn champion that no longer fits goes back to the draw (unless it is kept). As with the filters, one match is enough within a category, and every ticked category must match: Tank + Support + Top gives a top champion that is a tank or a support. A mix no champion can satisfy is refused. A "Champion role" replaces the player's role when choosing their champion. The site first searches the normally possible champions, then gives up the role, then the filters and the pool. Counter panels only offer that type. In discreet mode, the reel shows the usual champions and only the result is forced. The setting is in "Players and options", and types stay saved between games until you remove them.

**Random build.** A build includes:
- boots (Cassiopeia has none);
- 5 legendary items, with no duplicates;
- the upgraded support item for a support;
- a pet for a jungler, with Smite forced in their spells;
- valid runes: a keystone, then one rune per row of the primary tree, two runes from two different rows of the secondary tree, and the three shards;
- a skill order.

The "Build suited to the champion" option only keeps items whose Riot tags match the champion's damage type, plus tank items for tanks and support items for supports.

**Build links.** The build is encoded in the URL anchor, for example `#build-Brand-jungle-7x5-1101-…`. It only uses letters, digits and hyphens, and it starts with the address of the page, wherever the site is hosted (`baseURL` function).

## Publishing on GitHub Pages

On every push to `main`, `.github/workflows/pages.yml` runs `scripts/build.py` and publishes `dist/`.

The preview shown when the link is posted (Discord, X…) comes from the `og:` tags in `src/template.html` and from `dist/og.jpg`. They use the full site address, so update them if it changes. Run `node scripts/og_image.js` to regenerate the image and the PNG icons, after editing `dist/favicon.svg` if the logo changes.

Search engines use the title, description, canonical link and JSON-LD block at the top of `src/template.html`, plus `dist/sitemap.xml`. Update its `lastmod` date after a notable change.

## Saved in the browser

Language, names, ranks, separated pairs, forced roles and types, filters, options, suspense, sound, history and pool are kept in `localStorage`. Nothing goes to a server: everyone who opens the link has their own settings in their own browser, and several people can use it at the same time without affecting each other. Settings are lost in private browsing and don't follow you from one device to another.

Each address has its own memory: the live site and http://localhost:8080 don't share their settings.

The current draw (placed teams and drawn champions) is not saved: it disappears when the page reloads, and it is not shared. Use "Copy teams" to send it to the others.

## Data sources

- Champions, icons, items, runes, spells: Riot Games Data Dragon.
- Counters: LoLalytics, patch 26.21 (16.21 in their numbering), Emerald and above.

League of Legends and its content are the property of Riot Games. This project is a fan tool, not affiliated with Riot.
