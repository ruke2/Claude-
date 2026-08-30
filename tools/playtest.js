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

  let shotFY = false, gameOver = false;
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
      // 敵対的買収の防衛モーダルは閉じるボタンを持たない（必ず選ばせる）
      const def = await page.$('[data-def]');
      if (def) { await def.click(); await page.waitForTimeout(20); continue; }
      // 終局モーダル
      if (await page.$('[data-act="reset"]')) { gameOver = true; break; }
      const c = await page.$('[data-close]'); if (c) await c.click(); else break;
      await page.waitForTimeout(20);
    }
    if (gameOver) break;
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

  // 乱数プレイが終局していたら、以降のUI検証のために新しい会社で仕切り直す
  if (gameOver) {
    await page.evaluate(() => { UI.closeModal(); ENGINE.newGame('検証商事'); UI.render(); });
    await page.waitForTimeout(60);
    console.log('note: 乱数プレイが終局したため、UI検証用に再生成しました');
  }

  // 事業タブ（企業ユニバース）の検証: 資金を積んで売却意向を立てる
  await page.evaluate(() => {
    ENGINE.S.stage = 2; ENGINE.S.cash = 6000;
    const open_ = ENGINE.universeList().filter(t => t.owner == null).sort((a, b) => a.netAssets - b.netAssets);
    open_.slice(0, 3).forEach(t => { t.forSale = true; t.reason = '後継者不在'; t.saleLeft = 10; t.rivals = 1; });
    UI.render();
  });
  await page.click('#tabs button[data-tab="biz"]');
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'biz.png') });

  // 買収まで通す
  const target = await page.evaluate(() => {
    const t = ENGINE.universeList().filter(x => x.forSale && x.owner == null)
      .sort((a, b) => a.netAssets - b.netAssets)[0];
    return t ? t.id : null;
  });
  if (target) {
    await page.click('[data-co="' + target + '"]');
    await page.waitForTimeout(60);
    const dd = await page.$('[data-dd]'); if (dd) await dd.click();
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'co.png') });
    // 成約するまで数回試す（出向まで検証したいため）
    for (let k = 0; k < 8; k++) {
      const buy = await page.$('[data-buy]:not([disabled])');
      if (!buy) break;
      await buy.click(); await page.waitForTimeout(50);
      const c = await page.$('[data-close]'); if (c) await c.click();
      const done = await page.evaluate(id => ENGINE.S.assets.some(a => a.id === id), target);
      if (done) break;
      await page.evaluate(id => { const t = ENGINE.findTarget(id); if (t) { t.cool = 0; t.forSale = true; } }, target);
      await page.click('[data-co="' + target + '"]');
      await page.waitForTimeout(40);
    }
  }
  // 傘下タブ・出向
  await page.evaluate(() => { UI.setBizSub('own'); });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'owned.png') });
  const pst = await page.$('[data-post]');
  if (pst) {
    await pst.click(); await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'post.png') });
    const sec = await page.$('[data-second]');
    if (sec) await sec.click();
    const c = await page.$('[data-close]'); if (c) await c.click();
  }
  await page.evaluate(() => { UI.setBizSub('world'); });

  // 定型商談課の設定
  await page.click('#tabs button[data-tab="market"]');
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'market.png') });
  const acfg = await page.$('[data-act="autocfg"]');
  if (acfg) {
    await acfg.click(); await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'auto.png') });
    await page.click('[data-autolim="2"]'); await page.waitForTimeout(40);
    const c = await page.$('[data-close]'); if (c) await c.click();
  }

  // セーブ / ロード
  const sv = await page.$('[data-act="slots"]');
  await page.click('#tabs button[data-tab="admin"]');
  await page.waitForTimeout(60);
  await page.evaluate(() => { UI.slotsModal(false); });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'save.png') });
  await page.click('[data-svsave="1"]');
  await page.waitForTimeout(40);
  const c2 = await page.$('[data-close]'); if (c2) await c2.click();
  const slotOK = await page.evaluate(() => !ENGINE.slotInfo('1').empty);
  console.log('slot save:', slotOK ? 'ok' : 'FAILED');

  // 人事タブ
  await page.click('#tabs button[data-tab="admin"]');
  await page.click('[data-sub="hr"]');
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'hr.png') });
  const pc = await page.$('[data-person]');
  if (pc) { await pc.click(); await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'person.png') });
    await page.click('[data-close]'); }
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'hr-pay.png'), fullPage: false });
  await page.evaluate(() => { document.querySelector('#view').scrollTop = 380; });
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'pay.png') });
  await page.click('[data-sub="fin"]');

  for (const t of ['dash', 'market', 'active', 'assets', 'biz', 'admin', 'rank']) {
    await page.click('#tabs button[data-tab="' + t + '"]');
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(__dirname, '..', '.shots', t + '.png') });
  }
  await page.click('#tabs button[data-tab="rank"]');
  await page.evaluate(() => { document.querySelector('#view').scrollTop = 99999; });
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(__dirname, '..', '.shots', 'chart.png') });
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
