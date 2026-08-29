/* 実ブラウザでのスモークテスト: node tools/playtest.js [months] */
const { chromium } = require('playwright');
const path = require('path');
const MONTHS = +(process.argv[2] || 40);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.click('#btn-start');
  await page.click('[data-close]');

  let shotFY = false;
  for (let i = 0; i < MONTHS; i++) {
    await page.click('#btn-next');
    let guard = 0;
    while (await page.$('#modal-root:not([hidden])') && guard++ < 20) {
      // 決算ウィザード
      if (await page.$('[data-fy]')) {
        if (!shotFY && await page.$('.seg-t')) {
          await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'fy0.png') });
        }
        if (await page.$('[data-grad]') && !shotFY) {
        const g = await page.$$('[data-grad]:not([disabled])');
        if (g.length > 1) await g[1].click();
        const pr = await page.$$('[data-promo]:not([disabled])');
        if (pr.length) await pr[0].click();
        await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'fy-hr.png') });
      } else if (await page.$('[data-grad]')) {
        const g = await page.$$('[data-grad]:not([disabled])');
        if (g.length > 1) await g[1].click();
      }
      if (await page.$('[data-alloc]')) {
          // 適当に配分してから進む
          const plus = await page.$$('[data-alloc][data-d="1"]:not([disabled])');
          for (let k = 0; k < Math.min(6, plus.length); k++) {
            const b = await page.$('[data-alloc][data-d="1"]:not([disabled])');
            if (b) await b.click();
          }
          if (!shotFY) { await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'fy2.png') }); }
        }
        // 中計策定: カードを2枚選ぶ
        const cards = await page.$$('[data-card]');
        if (cards.length) {
          const sel = await page.$$('[data-card][style]');
          for (let k = sel.length; k < 2 && k < cards.length; k++) {
            const cc = await page.$$('[data-card]');
            await cc[k].click();
            await page.waitForTimeout(15);
          }
          await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'plan.png') });
        }
        const fin = await page.$('[data-fy="finish"]:not([disabled])');
        if (fin) {
          if (!shotFY) { await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'fy3.png') }); shotFY = true; }
          await fin.click();
        } else {
          await page.click('[data-fy="next"]');
        }
        await page.waitForTimeout(20);
        continue;
      }
      const c = await page.$('[data-close]'); if (c) await c.click(); else break;
      await page.waitForTimeout(20);
    }
    // 毎月ランダムに応札
    await page.click('#tabs button[data-tab="market"]');
    const deals = await page.$$('.deal');
    if (deals.length) {
      await deals[Math.floor(Math.random() * deals.length)].click();
      const b = await page.$('[data-bid]:not([disabled])');
      if (b) await b.click();
      const c = await page.$('[data-close]'); if (c) await c.click();
    }
  }

  // 人事タブ
  await page.click('#tabs button[data-tab="admin"]');
  await page.click('[data-sub="hr"]');
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'hr.png') });
  const pc = await page.$('[data-person]');
  if (pc) { await pc.click(); await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'person.png') });
    await page.click('[data-close]'); }
  await page.click('[data-sub="fin"]');

  for (const t of ['dash', 'market', 'active', 'assets', 'admin', 'rank']) {
    await page.click('#tabs button[data-tab="' + t + '"]');
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', t + '.png') });
  }
  const st = await page.evaluate(() => ({
    turn: ENGINE.S.turn, eq: Math.round(ENGINE.equity()), cash: Math.round(ENGINE.S.cash),
    stage: ENGINE.stage().name, pbr: +ENGINE.S.pbr.toFixed(2), price: Math.round(ENGINE.sharePrice()),
    roe: +(ENGINE.S.roeTTM * 100).toFixed(1), trust: Math.round(ENGINE.S.trust),
    rating: ENGINE.rating().label, fyCount: ENGINE.S.fyHistory.length,
  }));
  console.log('state:', JSON.stringify(st));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
