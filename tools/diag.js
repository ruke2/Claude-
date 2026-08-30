const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');const store={};
const sb={window:{},console,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},Math,Date,JSON,Object,Array,String,Number,isNaN,parseFloat};
sb.globalThis=sb;vm.createContext(sb);
['js/data.js','js/engine.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sb,{filename:f}));
const E=sb.window.ENGINE,D=sb.window.GAME;
const policy=require('./policy')(E,D);
const N=+(process.argv[2]||36);
E.newGame('診断');const S=E.S;const tot={};
for(let m=0;m<N&&!S.over;m++){
  policy(S);
  const o=E.advance();
  for(const k in S.lastLedger)tot[k]=(tot[k]||0)+S.lastLedger[k];
  if(o.fy){
    const d=(o.fy.revenue-o.fy.cost)-o.fy.profit;
    console.log('  [決算 '+o.fy.fy+'] 取扱高 '+E.money(o.fy.gtv)+' / 収益 '+E.money(o.fy.revenue)+' - 費用 '+E.money(o.fy.cost)+' = '+E.signed(o.fy.revenue-o.fy.cost)+'  純利益 '+E.signed(o.fy.profit)+'  差異 '+d.toFixed(4)+(Math.abs(d)>0.01?'  ★不一致':'  ✓'));
    policy.annual(S,o.fy);}
  const L=S.lastLedger,f=k=>(L[k]>=0?'+':'')+L[k].toFixed(1);
  const gap=(S.mRev-S.mCost)-S.lastProfit;
  if(Math.abs(gap)>0.005)console.log('   ↑ 月次不一致 '+gap.toFixed(3)+' | rev '+S.mRev.toFixed(2)+' cost '+S.mCost.toFixed(2)+' profit '+S.lastProfit.toFixed(2)+' | '+Object.keys(L).map(k=>k+' '+L[k].toFixed(2)).join(' '));
  console.log(`m${String(m).padStart(2)} eq ${E.equity().toFixed(0).padStart(6)} cash ${S.cash.toFixed(0).padStart(6)} debt ${S.debt.toFixed(0).padStart(5)} cr ${S.credit.toFixed(0)} slots${E.slotsMax()} | P/L ${E.signed(S.lastProfit).padStart(8)} capex ${S.lastCapex.toFixed(1).padStart(6)} | tr ${f('trade')} pj ${f('project')} dv ${f('dividend')} rv ${f('reval')} gn ${f('gain')} df ${f('defaults')} sg ${f('sga')} in ${f('interest')} | act ${S.active.length}(${S.active.filter(a=>a.type==='trade').length}t) ast ${S.assets.length} mkt ${S.market.length}`);
}
console.log('--- 累計 ---');for(const k in tot)console.log(' ',k.padEnd(10),E.signed(tot[k]));
console.log('  完了',S.stats.done,'落札',S.stats.won,'失注',S.stats.lost,'lv',D.DIVISIONS.map(d=>S.div[d.id].lv).join(','));
