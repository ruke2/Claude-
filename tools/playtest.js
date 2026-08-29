/* 実ブラウザでのスモークテスト: node tools/playtest.js */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.click('#btn-start');
  await page.click('[data-close]');

  // 商談 → 応札
  await page.click('#tabs button[data-tab="market"]');
  await page.waitForSelector('.deal');
  await page.click('.deal');
  await page.waitForSelector('[data-bid]');
  await page.click('[data-stance="1"]');
  const disabled = await page.$eval('[data-bid]', el => el.disabled);
  if (!disabled) { await page.click('[data-bid]'); await page.click('[data-close]'); }
  else { await page.click('[data-close]'); }

  // 24ヶ月まわす
  for (let i = 0; i < 24; i++) {
    await page.click('#btn-next');
    let guard = 0;
    while (await page.$('#modal-root:not([hidden])') && guard++ < 6) {
      const pay = await page.$('[data-payout="normal"]');
      if (pay) await pay.click();
      else { const c = await page.$('[data-close]'); if (c) await c.click(); else break; }
      await page.waitForTimeout(30);
    }
    // 毎月ランダムに1件応札
    await page.click('#tabs button[data-tab="market"]');
    const deals = await page.$$('.deal');
    if (deals.length) {
      await deals[Math.floor(Math.random() * deals.length)].click();
      const b = await page.$('[data-bid]:not([disabled])');
      if (b) await b.click();
      const c = await page.$('[data-close]'); if (c) await c.click();
    }
  }

  // 全タブを描画
  for (const t of ['dash', 'market', 'active', 'assets', 'admin', 'rank']) {
    await page.click('#tabs button[data-tab="' + t + '"]');
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', t + '.png') });
  }

  const st = await page.evaluate(() => ({
    turn: ENGINE.S.turn, eq: ENGINE.equity(), cash: ENGINE.S.cash,
    stage: ENGINE.stage().name, active: ENGINE.S.active.length, assets: ENGINE.S.assets.length,
    profit: ENGINE.S.lastProfit, log: ENGINE.S.log.length,
  }));
  console.log('state:', JSON.stringify(st));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
