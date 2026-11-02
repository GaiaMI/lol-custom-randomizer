// Smoke test of dist/index.html in a headless browser.
// Setup once:  npm install playwright  &&  npx playwright install chromium
// Run (from the project root):  node scripts/test.js
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const file = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'fr-FR' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(file);
  await page.waitForTimeout(500);
  const fail = msg => { console.error('ÉCHEC :', msg); process.exitCode = 1; };

  const info = await page.evaluate(() => ({
    champs: CH.length,
    icons: Object.keys(ICON).length,
    minCounters: Math.min(...CH.flatMap(c => c.r.map(l => losesTo(c.n, l).length))),
  }));
  console.log('champions', info.champs, '| icônes', info.icons, '| min counters par poste', info.minCounters);
  if (info.icons !== info.champs) fail('il manque des icônes');
  if (info.minCounters < 4) fail('un champion a moins de 4 counters sur un de ses postes');

  // every champion can be drawn
  const seen = await page.evaluate(() => { const s = new Set(); for (let k = 0; k < 30000; k++) s.add(pick(pool()).n); return s.size; });
  if (seen !== info.champs) fail(`seulement ${seen} champions tirés sur ${info.champs}`);

  // full 5v5 draw without animation
  await page.selectOption('#speed', '0');
  for (let k = 0; k < 10; k++) {
    await page.evaluate(() => { const c = document.querySelector('#picker:not([hidden]) .pk-card:not([disabled])'); (c || document.querySelector('#drawNext')).click(); });
    await page.waitForFunction(() => !busy);
    await page.waitForTimeout(100);
  }
  const filled = await page.evaluate(() => [...T.blue, ...T.red].filter(s => s.champ).length);
  if (filled !== 10) fail(`${filled} champions tirés sur 10`);

  // separated players are never on the same team
  const sepOk = await page.evaluate(() => { sep = [[0, 1], [2, 3]]; for (let k = 0; k < 200; k++) { const o = balancedOrder(false); const b = new Set(o.slice(0, 5)); if (b.has(0) === b.has(1) || b.has(2) === b.has(3)) return false; } return true; });
  if (!sepOk) fail('une paire séparée s’est retrouvée dans la même équipe');

  // build links survive an encode/decode round trip
  const rt = await page.evaluate(() => { let bad = 0; for (let k = 0; k < 300; k++) { const c = pick(CH), r = pick(c.r), b = genBuild(c.n, r); if (JSON.stringify(decodeBuild(encodeBuild(b, 'x')).b) !== JSON.stringify(b)) bad++; } return bad; });
  if (rt) fail(rt + ' liens de build mal relus');

  // a forced type holds through draws, rerolls, the counter picker, swaps and shuffles
  const fc = await page.evaluate(async () => {
    const bad = [];
    const check = (label, ok) => { if (!ok) bad.push(label); };
    const wipe = () => { [...T.blue, ...T.red].forEach(s => { s.champ = null; s.locked = false; }); pk = null; };
    const slot = T.blue[3], pi = slot.pi;   // ADC bleu
    for (const v of ['cls|Tank', 'cls|Support', 'dmg|AP', 'range|Melee', 'diff|3', 'role|top']) {
      forced = { [pi]: [v] };
      for (let k = 0; k < 40; k++) { wipe(); drawSlot('blue', 3); check('tirage ' + v, slot.champ && fcFits(BY[slot.champ], pi)); }
    }
    // a forced role replaces the lane: an ADC forced top gets many top champions, not the few playing both
    forced = { [pi]: ['role|top'] };
    const tops = new Set(); for (let k = 0; k < 300; k++) { wipe(); drawSlot('blue', 3); tops.add(slot.champ); }
    check('poste imposé', tops.size > 30 && [...tops].every(n => BY[n].r.includes('top')));
    // several choices: any value within a category, every category at once
    forced = { [pi]: ['cls|Tank', 'cls|Mage', 'role|top'] };
    const mix = new Set(); for (let k = 0; k < 300; k++) { wipe(); drawSlot('blue', 3); mix.add(slot.champ); }
    check('choix multiples', [...mix].every(n => BY[n].r.includes('top') && BY[n].c.some(x => x === 'Tank' || x === 'Mage')));
    check('les deux classes tombent', [...mix].some(n => BY[n].c.includes('Tank')) && [...mix].some(n => BY[n].c.includes('Mage')));
    check('libellé', fcText(pi) === 'Tank ou Mage, Top');
    // lane fallback: no tank plays ADC, the player still gets a tank
    forced = { [pi]: ['cls|Tank'] }; wipe(); drawSlot('blue', 3);
    check('repli hors poste', BY[slot.champ].c.includes('Tank'));
    // forcing beats global filters and the pool
    const saved = F.cls; F.cls = ['Mage']; wipe(); drawSlot('blue', 3); F.cls = saved;
    check('passe avant les filtres', BY[slot.champ].c.includes('Tank'));
    // counter options only list the forced type
    wipe(); T.red[3].champ = 'Jinx';
    check('options de counter', options('blue', 3, 'counter').every(o => BY[o.n].c.includes('Tank')));
    // the type follows the player: a misfit drawn on the destination slot is dropped
    wipe(); T.blue[0].champ = 'Jinx'; T.red[0].champ = 'Malphite';
    const dest = T.blue[0].pi; swapPlayers(pi, dest);
    check('champion rendu après échange', T.blue[0].pi === pi && T.blue[0].champ === null);
    swapPlayers(pi, dest); await new Promise(r => setTimeout(r, 500));
    // discreet mode: no badge, the reel decoys are not narrowed to the type
    forced = { [pi]: ['cls|Tank'] }; wipe(); render5();
    check('badge visible', document.querySelector('#blueSlots').textContent.includes('Imposé : Tank'));
    $('#oForceHide').checked = true; render5();
    check('badge masqué', !document.querySelector('#blueSlots').textContent.includes('Imposé'));
    check('leurres normaux', drawSlot('blue', 3).some(n => !BY[n].c.includes('Tank')));
    check('champion quand même forcé', BY[slot.champ].c.includes('Tank'));
    $('#oForceHide').checked = false; forced = {}; wipe(); render5();
    return bad;
  });
  if (fc.length) fail('type imposé : ' + [...new Set(fc)].join(', '));

  // the chips toggle choices, refuse an impossible mix, and an old saved value still loads
  await page.locator('summary.sep-h').click({ position: { x: 8, y: 8 } });
  await page.selectOption('#fcP', '0');
  await page.click('#fcT .chip[data-v="role|top"]');
  await page.click('#fcT .chip[data-v="cls|Tank"]');
  await page.click('#fcT .chip[data-v="cls|Mage"]');
  await page.click('#fcT .chip[data-v="cls|Mage"]');
  const chips = await page.evaluate(() => [JSON.stringify(forced[0]), $('#fcList').textContent]);
  if (chips[0] !== '["role|top","cls|Tank"]') fail('choix par pastilles : ' + chips[0]);
  await page.click('#fcT .chip[data-v="range|Ranged"]');
  await page.click('#fcT .chip[data-v="diff|1"]');
  await page.click('#fcT .chip[data-v="dmg|Hybrid"]');
  const refused = await page.evaluate(() => CH.some(c => fcFits(c, 0)));
  if (!refused) fail('un mélange impossible a été accepté');
  await page.evaluate(() => localStorage.setItem('rr_forced', '{"2":"cls|Tank"}'));
  await page.reload();
  const old = await page.evaluate(() => JSON.stringify(forced[2]) + fcText(2));
  if (old !== '["cls|Tank"]Tank') fail('ancienne sauvegarde mal relue : ' + old);

  // settings survive a reload and stay private: a second visitor starts clean and changes nothing here
  await page.fill('#players [data-i="0"]', 'Mehdi');
  await page.selectOption('#oPool', 'any');
  await page.selectOption('#speed', '700');
  await page.check('#sound');
  await page.reload();
  const mine = () => page.evaluate(() => [players[0], $('#oPool').value, $('#speed').value, $('#sound').checked, Object.keys(forced).length].join());
  const before = await mine();
  if (before !== 'Mehdi,any,700,true,1') fail('réglages perdus au rechargement : ' + before);
  const other = await browser.newContext();
  const guest = await other.newPage();
  await guest.goto(file);
  const clean = await guest.evaluate(() => [players[0], $('#oPool').value, $('#speed').value, $('#sound').checked, Object.keys(forced).length].join());
  if (clean !== ',role,1600,false,0') fail('un visiteur voit les réglages d’un autre : ' + clean);
  await guest.fill('#players [data-i="0"]', 'Invité');
  await guest.selectOption('#oPool', 'main');
  await other.close();
  await page.reload();
  if (await mine() !== before) fail('un visiteur a modifié les réglages d’un autre');

  // a forced lane holds through both shuffles, drags and reloads
  await page.locator('summary.sep-h').click({ position: { x: 8, y: 8 } });
  const setLane = async (pi, l) => { await page.selectOption('#fcP', String(pi)); await page.click(`#fcL .chip[data-l="${l}"]`); };
  await setLane(4, 'top');
  await setLane(7, 'top');
  await setLane(2, 'bottom');
  await setLane(9, 'top');   // third player on top: refused
  const lanesOk = await page.evaluate(() => {
    const bad = [];
    const seated = o => Object.entries(lanes).every(([p, l]) => o.indexOf(+p) % 5 === laneI(l));
    const opposed = o => (o.indexOf(4) < 5) !== (o.indexOf(7) < 5);
    if (lanes[9]) bad.push('troisième joueur accepté');
    if (!seated([...T.blue, ...T.red].map(s => s.pi))) bad.push('placement immédiat');
    if (!opposed([...T.blue, ...T.red].map(s => s.pi))) bad.push('même poste, même équipe');
    for (let k = 0; k < 300; k++) {
      const o = balancedOrder(false);
      if (!seated(o)) bad.push('mélange des équipes');
      if (!opposed(o)) bad.push('deux joueurs du même poste dans une équipe');
      if (new Set(o).size !== 10) bad.push('joueur perdu');
      assign(o);
      if (!seated(balancedOrder(true))) bad.push('mélange des postes');
    }
    $('#oDuel').checked = true; ranks = ranks.map(() => 'gold-2');
    for (let k = 0; k < 20; k++) if (!seated(balancedOrder(false))) bad.push('face à face');
    $('#oDuel').checked = false; ranks = ranks.map(() => '');
    const [, i] = slotOfPi(2), other_ = [...T.blue, ...T.red].find(s => !lanes[s.pi] && T.blue.indexOf(s) !== i && T.red.indexOf(s) !== i).pi;
    swapPlayers(2, other_);
    if (slotOfPi(2)[1] !== i) bad.push('glissé hors de son poste');
    return bad;
  });
  if (lanesOk.length) fail('poste imposé : ' + [...new Set(lanesOk)].join(', '));
  await page.reload();
  const kept = await page.evaluate(() => Object.entries(lanes).every(([p, l]) => slotOfPi(+p)[1] === laneI(l)) && Object.keys(lanes).length === 3);
  if (!kept) fail('poste imposé perdu au rechargement');

  // the language button: no French left in English, the draw survives, and French comes back intact
  await page.evaluate(() => { players[0] = ''; localStorage.removeItem('rr_lanes'); localStorage.removeItem('rr_forced'); });
  await page.reload();
  await page.selectOption('#speed', '0');
  await page.check('#oBuild');
  await page.click('#drawRest');
  await page.waitForFunction(() => !busy);
  const frBefore = await page.locator('.teams').innerText();
  await page.click('#lang [data-l="en"]');
  const FRENCH = /[éèêàçùîôœ«»]|\b(le|la|les|des|du|une|un|et|ou|pour|joueur|joueurs|équipe|poste|tirer|tirage|proies?)\b/i;
  const leftovers = [];
  const scan = async where => {
    const t = await page.evaluate(() => {
      const out = [document.body.innerText];
      document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(e => ['aria-label', 'placeholder', 'title'].forEach(a => { if (e.getAttribute(a)) out.push(e.getAttribute(a)); }));
      document.querySelectorAll('option').forEach(o => out.push(o.textContent));
      return out.join('\n');
    });
    t.split('\n').forEach(l => { if (FRENCH.test(l)) leftovers.push(where + ' : ' + l.trim().slice(0, 90)); });
  };
  await page.locator('summary.sep-h').click({ position: { x: 8, y: 8 } });
  await page.evaluate(() => { sep = [[0, 1]]; lanes = { 0: 'top' }; forced = { 0: ['cls|Tank', 'cls|Mage'] }; renderSep(); render5(); renderBoard(); });
  await scan('5v5');
  await page.click('.act.build >> nth=0');
  await scan('build');
  const buildTxt = await page.evaluate(() => buildText($('#bm')._b, 'x'));
  await page.click('#bmClose');
  await page.evaluate(() => { const s = T.blue[1]; T.red[1].champ = 'Jinx'; s.champ = null; s.locked = false; pk = { t: 'blue', i: 1, mode: 'target', manual: true }; renderPicker(); });
  await scan('choix de counter');
  await page.click('[data-tab="single"]');
  await page.click('#rollOne');
  await page.waitForFunction(() => !busy);
  await scan('un champion');
  await page.click('[data-tab="counter"]');
  await page.evaluate(() => setCounterChamp('Jinx'));
  await page.click('#cRollTarget');
  await page.waitForFunction(() => !busy);
  await scan('counters');
  await page.click('[data-tab="pool"]');
  await scan('pool');
  if (leftovers.length) fail('français restant en anglais :\n  ' + [...new Set(leftovers)].join('\n  '));
  if (/[éèêàç]/.test(buildTxt)) fail('build en français : ' + buildTxt);
  const enState = await page.evaluate(() => [document.documentElement.lang, pct(52.34), label('Wukong'), rankL('gold-2'), JSON.parse(localStorage.getItem('rr_lang'))].join());
  if (enState !== 'en,52.3%,Wukong,Gold II,en') fail('état anglais : ' + enState);
  await page.reload();
  if (await page.evaluate(() => LANG) !== 'en') fail('la langue n’est pas gardée');
  await page.click('#lang [data-l="fr"]');
  const frState = await page.evaluate(() => [document.documentElement.lang, pct(52.34), label('Wukong'), $('#rollOne').textContent].join());
  if (frState !== 'fr,52,3 %,Wukong,Tirer un champion') fail('état français : ' + frState);
  if (!frBefore) fail('tirage vide');

  // flex: five players, five roles, five champions, no opposing team
  await page.click('[data-tab="flex"]');
  await page.evaluate(() => { players[0] = 'Mehdi'; renderPlayers(); });
  const flexUi = await page.evaluate(() => ({
    inputs: document.querySelectorAll('#players input').length,
    red: getComputedStyle(document.querySelector('.team.red')).display,
    counter: getComputedStyle(document.querySelector('.act[data-a=counter]')).display,
    shuffle: getComputedStyle($('#shuffleTeams')).display,
    fc: $('#fcP').options.length,
  }));
  if (flexUi.inputs !== 5 || flexUi.red !== 'none' || flexUi.counter !== 'none' || flexUi.shuffle !== 'none' || flexUi.fc !== 5) fail('interface flex : ' + JSON.stringify(flexUi));
  await page.click('#shuffleRoles');
  await page.waitForFunction(() => !busy);
  await page.click('#drawRest');
  await page.waitForFunction(() => !busy);
  const flexDraw = await page.evaluate(() => ({ blue: new Set(T.blue.map(s => s.champ).filter(Boolean)).size, red: T.red.filter(s => s.champ).length, next: nextSlot(), picker: $('#picker').hidden, players: new Set(T.blue.map(s => s.pi)).size }));
  if (flexDraw.blue !== 5 || flexDraw.red || flexDraw.next || !flexDraw.picker || flexDraw.players !== 5) fail('tirage flex : ' + JSON.stringify(flexDraw));
  await page.evaluate(() => { navigator.clipboard.writeText = t => { window.copied = t; return Promise.resolve(); }; });
  await page.click('#copyTeam');
  const flexCopy = await page.evaluate(() => window.copied);
  if (flexCopy.split('\n').length !== 5 || /Équipe|rouge/i.test(flexCopy)) fail('copie flex : ' + flexCopy);
  // a forced role and type hold in flex, and one role cannot go to two of the five
  await page.locator('summary.sep-h').click({ position: { x: 8, y: 8 } });
  const [p0, p1] = await page.evaluate(() => T.blue.slice(0, 2).map(s => String(s.pi)));
  await page.selectOption('#fcP', p0);
  await page.click('#fcL .chip[data-l="support"]');
  await page.selectOption('#fcP', p1);
  await page.click('#fcL .chip[data-l="support"]');
  const flexLanes = await page.evaluate(([a, b]) => {
    const ok = [];
    if (lanes[b]) ok.push('deux joueurs sur le même poste');
    forced[a] = ['cls|Tank'];
    for (let k = 0; k < 50; k++) {
      const o = balancedOrder(true); assign(o);
      if (slotOfPi(+a)[0] !== 'blue' || slotOfPi(+a)[1] !== laneI('support')) ok.push('poste perdu au mélange');
      const blue = T.blue.findIndex(s => s.pi === +a); T.blue[blue].champ = null; drawSlot('blue', blue);
      if (!BY[T.blue[blue].champ].c.includes('Tank')) ok.push('type perdu');
    }
    return ok;
  }, [p0, p1]);
  if (flexLanes.length) fail('flex imposé : ' + [...new Set(flexLanes)].join(', '));
  await page.evaluate(() => { lanes = {}; forced = {}; localStorage.removeItem('rr_lanes'); localStorage.removeItem('rr_forced'); renderSep(); render5(); });
  // flex survives a reload, is fully translated, and leaving it gives back the ten players
  await page.reload();
  const kept2 = await page.evaluate(() => [FLEX, document.body.classList.contains('flex'), $('[data-tab="flex"]').getAttribute('aria-selected'), $('#tab-team').hidden].join());
  if (kept2 !== 'true,true,true,false') fail('flex perdu au rechargement : ' + kept2);
  await page.click('#lang [data-l="en"]');
  await page.locator('summary.sep-h').click({ position: { x: 8, y: 8 } });
  await page.selectOption('#speed', '0');
  await page.click('#drawNext');
  await page.waitForFunction(() => !busy);
  leftovers.length = 0;
  await scan('flex');
  if (leftovers.length) fail('français restant en flex :\n  ' + [...new Set(leftovers)].join('\n  '));
  await page.click('#lang [data-l="fr"]');
  await page.click('[data-tab="team"]');
  const back = await page.evaluate(() => [document.querySelectorAll('#players input').length, getComputedStyle(document.querySelector('.team.red')).display !== 'none', T.blue.filter(s => s.champ).length].join());
  if (back !== '10,true,0') fail('retour au 5v5 : ' + back);

  // search and sharing tags
  await page.reload();
  const statics = await page.evaluate(() => ({
    unused: Object.keys(STATIC_FR).filter(k => !STATIC.some(s => s[2].trim() === k)),
    faq: document.querySelectorAll('#faq details').length,
    h2: [...document.querySelectorAll('h2')].filter(h => /Player \d|Joueur \d/.test(h.textContent)).length,
  }));
  if (statics.unused.length) fail('textes jamais utilisés : ' + statics.unused.join(' | '));
  if (statics.faq < 8 || statics.h2) fail('FAQ ou titres : ' + JSON.stringify(statics));
  // help bubbles open, link to their FAQ entry and close
  await page.click('[data-tab="team"]');
  await page.click('.tip[data-tip="ranks"]');
  const tipText = await page.locator('#tipBox').innerText();
  if (!/facultatifs/.test(tipText)) fail('bulle : ' + tipText);
  await page.click('#tipBox a');
  const tipLink = await page.evaluate(() => [$('#tipBox').hidden, $('#faq-ranks').open].join());
  if (tipLink !== 'true,true') fail('lien de la bulle : ' + tipLink);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('summary.sep-h').click({ position: { x: 8, y: 8 } });
  await page.click('summary .tip');
  const inSummary = await page.evaluate(() => [$('#tipBox').hidden, document.querySelector('details.sep').open].join());
  if (inSummary !== 'false,true') fail('bulle dans le titre repliable : ' + inSummary);
  await page.keyboard.press('Escape');
  if (!await page.evaluate(() => $('#tipBox').hidden)) fail('Échap ne ferme pas la bulle');
  const seo = await page.evaluate(() => ({
    title: document.title.length,
    desc: document.querySelector('meta[name=description]').content.length,
    canonical: document.querySelector('link[rel=canonical]').href,
    h1: document.querySelectorAll('h1').length,
    ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type'],
    icon: !!document.querySelector('link[rel=icon]'),
  }));
  if (seo.title > 60 || seo.desc > 160 || seo.h1 !== 1 || seo.ld !== 'WebApplication' || !seo.icon || !seo.canonical.endsWith('/lol-custom-randomizer/')) fail('SEO : ' + JSON.stringify(seo));

  // one champion: a random build for the drawn champion, with reroll and a link
  await page.click('[data-tab="single"]');
  await page.evaluate(() => { cur = null; });
  await page.click('#oneBuild');
  if (!await page.evaluate(() => $('#bm').hidden)) fail('build ouvert sans champion');
  await page.selectOption('#speed', '0');
  await page.click('#rollOne');
  await page.waitForFunction(() => !busy);
  await page.click('#oneBuild');
  const one = await page.evaluate(() => { const a = $('#bm')._b; $('#bmReroll').click(); const b = $('#bm')._b; return { fits: a.c === cur.n && cur.r.includes(a.role) && b.c === cur.n, reroll: !$('#bmReroll').hidden, changed: JSON.stringify(a) !== JSON.stringify(b), open: !$('#bm').hidden, link: decodeBuild(encodeBuild(b, '')).b.c === cur.n }; });
  if (!one.fits || !one.reroll || !one.changed || !one.open || !one.link) fail('build du champion seul : ' + JSON.stringify(one));
  await page.click('#bmClose');

  // copying build links in flex: nothing to copy is reported, a refused clipboard falls back
  await page.click('[data-tab="flex"]');
  await page.check('#oBuild');
  await page.evaluate(() => { [...T.blue, ...T.red].forEach(s => { s.champ = null; }); window.copied = null; navigator.clipboard.writeText = t => { window.copied = t; return Promise.resolve(); }; });
  await page.click('#copyBuilds');
  const empty = await page.evaluate(() => [window.copied, $('#toast').textContent].join('|'));
  if (empty !== '|Tire d\u2019abord les champions'.replace('\u2019', "'")) fail('copie sans champion : ' + empty);
  await page.click('#drawRest');
  await page.waitForFunction(() => !busy);
  await page.click('#copyBuilds');
  await page.waitForTimeout(50);
  const flexLinks = await page.evaluate(() => window.copied || '');
  if ((flexLinks.match(/#build-/g) || []).length !== 5) fail('liens flex : ' + flexLinks);
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('refusé')); window.__ex = 0; document.execCommand = c => { window.__ex++; return c === 'copy'; }; });
  await page.click('#copyBuilds');
  await page.waitForTimeout(50);
  const fb = await page.evaluate(() => [window.__ex, $('#toast').textContent].join('|'));
  if (fb !== '1|Liens des builds copiés') fail('solution de secours : ' + fb);
  await page.click('.act.build >> nth=0');
  await page.click('#bmLink');
  await page.waitForTimeout(50);
  if (!/Lien du build copié/.test(await page.evaluate(() => $('#toast').textContent))) fail('copie du lien depuis le build');
  await page.click('#bmClose');
  await page.click('[data-tab="team"]');

  if (errors.length) fail('erreurs JavaScript : ' + errors.join(' | '));
  console.log(process.exitCode ? 'Des tests ont échoué.' : 'Tous les tests passent.');
  await browser.close();
})();
