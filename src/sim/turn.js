// ============================================================
//  ターン進行 — 四半期を1つ進める
// ============================================================
import { RNG } from '../core/rng.js';
import { blankPL } from '../core/state.js';
import { stepMarket, rollShocks, rollWeather } from './market.js';
import { generateListings, resolveListing, acquireForPlayer, acquireForRival, LISTING_KINDS } from './land.js';
import { stepProjects } from './project.js';
import { stepInventory, stepAssets } from './sales.js';
import { stepMA, generateTargets } from './ma.js';
import { stepHR } from './hr.js';
import { stepRivals, ranking } from './rivals.js';
import { closeQuarter, ttm, kpis } from './finance.js';
import { DISTRICTS } from '../data/city.js';

export function nextTurn(g) {
  const rng = new RNG(g.rngState ^ (g.turn * 2654435761));
  const news = [];
  const report = { bids: [], news, shocks: [] };

  // 1. 暦を進める
  g.turn++;
  g.quarter++;
  if (g.quarter > 4) { g.quarter = 1; g.year++; }

  // 2. 市況
  const phase = stepMarket(g, rng);
  report.shocks = rollShocks(g, rng);
  for (const s of report.shocks) news.push({ icon: s.icon, type: 'market', text: `【${s.title}】${s.text}` });
  g.weather = rollWeather(g, rng);

  // 3. 入札の締切処理
  for (const l of g.listings.slice()) {
    l.deadline--;
    if (l.deadline > 0) continue;
    const cell = g.cells.find(c => c.id === l.cellId);
    const res = resolveListing(g, l, rng, news);
    if (!res) continue;
    if (!res.winner) {
      // 不調。再募集または取り下げ
      if (rng.chance(0.5)) { l.deadline = rng.int(2, 3); l.askPrice = Math.round(l.askPrice * 0.94); }
      else { if (cell) cell.onSale = null; const i = g.listings.indexOf(l); if (i >= 0) g.listings.splice(i, 1); }
      if (l.bid) report.bids.push({ result: 'fail', listing: l, cell, ...res });
      continue;
    }
    if (res.winner.isPlayer) {
      const fee = acquireForPlayer(g, l, cell, res.winner.amount, news);
      cell.bookValue = res.winner.amount + fee;
      report.bids.push({ result: 'win', listing: l, cell, ...res });
    } else {
      acquireForRival(g, l, cell, res.winner.id, res.winner.amount);
      if (l.bid) {
        report.bids.push({ result: 'lose', listing: l, cell, ...res });
        news.push({
          icon: '❌', type: 'land',
          text: `${DISTRICTS[cell.d].name}の用地は${res.winner.name}が${Math.round(res.winner.amount / 100).toLocaleString()}億円で落札した。`,
        });
      }
    }
  }
  // 4. 新規の売り出し
  generateListings(g, rng, news);

  // 5. 事業
  stepProjects(g, rng, news);
  stepInventory(g, rng, news);
  stepAssets(g, rng, news);
  stepMA(g, rng, news);
  if (g.maTargets.length < 3) g.maTargets.push(...generateTargets(g, rng, 3 - g.maTargets.length));

  // 6. 組織
  stepHR(g, rng, news);

  // 7. 競合
  stepRivals(g, rng, news);

  // 8. 決算
  const pl = closeQuarter(g, rng, news);
  report.pl = pl;
  report.phase = phase;
  report.rank = ranking(g, 'rev').find(x => x.isPlayer);
  report.kpi = kpis(g);
  report.year = g.year; report.quarter = g.quarter;

  // 9. 状態判定
  g.rngState = rng.s;
  if (g.finance.bs.equity <= 0) {
    g.gameOver = { type: 'bankrupt', title: '債務超過', text: '純資産がマイナスとなり、会社は事業の継続が不可能になった。' };
  } else if ((g.crisis || 0) >= 3) {
    g.gameOver = { type: 'default', title: '資金ショート', text: '3四半期連続で資金繰りがつかず、支払不能に陥った。' };
  }
  g.pendingReport = report;
  return report;
}
