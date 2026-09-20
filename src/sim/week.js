// ============================================================
//  時間進行 — 1ターン = 1週
// ============================================================
import { RNG } from '../core/rng.js';
import { blankPL } from '../core/state.js';
import { syncCalendar, isQuarterEnd, WEEKS_PER_QUARTER } from '../core/time.js';
import { stepMarket, rollShocks, rollWeather } from './market.js';
import { generateListings, generatePublic, resolveListing, acquireForPlayer, acquireForRival } from './land.js';
import { stepProjects } from './project.js';
import { stepInventory, stepAssets } from './sales.js';
import { stepMA, generateTargets } from './ma.js';
import { stepHR } from './hr.js';
import { stepBrands } from './brands.js';
import { stepCulture } from './culture.js';
import { stepRecruit } from './recruit.js';
import { stepRivalsWeekly, stepRivalsQuarter, ranking } from './rivals.js';
import { weeklyCosts, closeQuarter, kpis } from './finance.js';
import { DISTRICTS } from '../data/city.js';
import { stepTier } from './company.js';
import { stepPlan } from './midplan.js';
import { stepAwards } from './awards.js';
import { rollDisaster, stepRails } from './cityevents.js';
import { stepRating, decayIr, questionsFor } from './ir.js';
import { stepPostings } from './talent.js';
import { stepPopulation } from './population.js';
import { stepUnion } from './union.js';
import { meetingDue, agendaOf } from './meeting.js';
import { stepAgenda, pending } from './agenda.js';
import { stepJV } from './jv.js';
import { stepStanding } from './trading.js';
import { stepAssembly } from './assembly.js';

/** 1週進める */
export function nextWeek(g) {
  const rng = new RNG((g.rngState ^ (g.week * 2654435761)) >>> 0);
  const news = [];
  const rep = { news, bids: [], shocks: [], completed: [], quarterEnd: false, pl: null, week: 0 };

  // 1. 暦を進める
  g.week++;
  syncCalendar(g);
  rep.week = g.week;

  // 2. 市況
  const phase = stepMarket(g, rng);
  rep.phase = phase;
  rep.shocks = rollShocks(g, rng);
  for (const s of rep.shocks) news.push({ icon: s.icon, type: 'market', major: true, text: `【${s.title}】${s.text}` });
  g.weather = rollWeather(g, rng);
  // 災害と、鉄道の整備計画
  rep.disaster = rollDisaster(g, rng, news);
  stepRails(g, rng, news);
  decayIr(g);
  // 人口（四半期に1回だけ動く）
  stepPopulation(g, rng, news);

  // 3. 入札の締切処理
  for (const l of g.listings.slice()) {
    l.deadline--;
    if (l.deadline > 0) continue;
    const cell = g.cells.find(c => c.id === l.cellId);
    const res = resolveListing(g, l, rng, news);
    if (!res) continue;
    if (!res.winner) {
      if (rng.chance(0.5)) { l.deadline = rng.int(4, 9); l.askPrice = Math.round(l.askPrice * 0.94); }
      else { if (cell) cell.onSale = null; const i = g.listings.indexOf(l); if (i >= 0) g.listings.splice(i, 1); }
      if (l.bid) rep.bids.push({ result: 'fail', listing: l, cell, ...res });
      continue;
    }
    if (res.winner.isPlayer) {
      const fee = acquireForPlayer(g, l, cell, res.winner.amount, news);
      cell.bookValue = res.winner.amount + fee;
      rep.bids.push({ result: 'win', listing: l, cell, ...res });
    } else {
      acquireForRival(g, l, cell, res.winner.id, res.winner.amount);
      if (l.bid) {
        rep.bids.push({ result: 'lose', listing: l, cell, ...res });
        news.push({
          icon: '❌', type: 'land', major: true,
          text: `${DISTRICTS[cell.d].name}の用地は${res.winner.name}が${Math.round(res.winner.amount / 100).toLocaleString()}億円で落札した。`,
        });
      }
    }
  }
  // 4. 新規の売り出し
  generateListings(g, rng, news);
  generatePublic(g, rng, news);
  // 競合からの共同事業の打診
  stepJV(g, rng, news);
  // 稼働中のビルの売り物件（一棟買い）
  stepStanding(g, rng, news);
  // 種地の取得（用地の集約）
  stepAssembly(g, rng, news);

  // 5. 事業
  const before = g.assets.length + g.inventory.length;
  stepProjects(g, rng, news);
  if (g.assets.length + g.inventory.length > before) rep.completed.push(true);
  stepInventory(g, rng, news);
  stepAssets(g, rng, news);
  stepMA(g, rng, news);
  if (g.maTargets.length < 3) g.maTargets.push(...generateTargets(g, rng, 3 - g.maTargets.length));

  // 6. 組織
  stepHR(g, rng, news);
  stepPostings(g, news);
  // 労働組合（結成・春季交渉の要求・期限切れのゼロ回答）
  rep.unionRound = stepUnion(g, rng, news);
  // 年間の決裁事項（人事・賞与・総会…）。
  // 議題を立て、期限を過ぎたものは既定の内容で片づける
  rep.agenda = stepAgenda(g, news);
  rep.pendingAgenda = pending(g).length;
  stepRecruit(g, rng, news);
  stepBrands(g, rng, news);
  stepCulture(g, rng, news);

  // 7. 競合
  stepRivalsWeekly(g, rng, news);

  // 8. 週次の費用と資金繰り
  weeklyCosts(g, news);

  // 9. 四半期末なら決算
  g.quarterNews = (g.quarterNews || []).concat(news);
  if (isQuarterEnd(g)) {
    stepRivalsQuarter(g, rng, news);
    rep.pl = closeQuarter(g, rng, news);
    // 決算が締まったところで、売上規模に応じた解禁を見る
    const before = (g.unlocked || []).length;
    stepTier(g, news);
    rep.unlocked = (g.unlocked || []).slice(before);
    // 中期経営計画の期限が来ていれば成否を確定させる
    rep.planDone = stepPlan(g, news);
    // 表彰の審査、格付けレポート、決算説明会の設問
    rep.awards = stepAwards(g, rng, news);
    rep.rating = stepRating(g, news);
    rep.briefing = g.company.listed ? questionsFor(g) : null;
    rep.quarterEnd = true;
    rep.rank = ranking(g, 'rev').find(x => x.isPlayer);
    rep.kpi = kpis(g);
    rep.quarterNews = g.quarterNews;
    g.quarterNews = [];
  }

  // 10. 状態判定
  g.rngState = rng.s;
  if (g.finance.bs && g.finance.bs.equity <= 0) {
    g.gameOver = { type: 'bankrupt', title: '債務超過', text: '純資産がマイナスとなり、会社は事業の継続が不可能になった。' };
  } else if ((g.crisis || 0) >= 4) {
    g.gameOver = { type: 'default', title: '資金ショート', text: '4四半期続けて借入枠を超過したまま資金繰りがつかず、支払不能に陥った。' };
  }

  // 11. 自動進行を止めるべきか
  rep.interrupt = rep.quarterEnd || !!g.gameOver
    || rep.bids.length > 0 || rep.shocks.length > 0 || rep.completed.length > 0
    || !!rep.unionRound || (rep.agenda && rep.agenda.raised.length > 0)
    || news.some(n => n.major);
  rep.majorNews = news.filter(n => n.major);
  g.pendingReport = rep;
  return rep;
}

/** まとめて進める。割り込みがあればそこで止まる */
export function advanceWeeks(g, weeks, onWeek) {
  const reports = [];
  for (let i = 0; i < weeks; i++) {
    const r = nextWeek(g);
    reports.push(r);
    if (onWeek) onWeek(r);
    if (r.interrupt) break;
  }
  return reports;
}

/** 四半期末まで進める */
export function advanceToQuarterEnd(g, onWeek) {
  const remain = WEEKS_PER_QUARTER - g.weekOfQuarter;
  return advanceWeeks(g, Math.max(1, remain), onWeek);
}
