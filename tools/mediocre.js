/* 生き延びるが下手な経営者: 無配・ガバナンス放置・中計は大風呂敷 → 解任/被買収の検証 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');const store={};
const sb={window:{},console,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},Math,Date,JSON,Object,Array,String,Number,isNaN,parseFloat};
sb.globalThis=sb;vm.createContext(sb);
['js/data.js','js/engine.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sb,{filename:f}));
const E=sb.window.ENGINE,D=sb.window.GAME;
const RUNS=+(process.argv[2]||30),M=+(process.argv[3]||180);
let over=0,reasons={},stages={},cleared=0;
for(let r=0;r<RUNS;r++){
  E.newGame('凡庸商事');const S=E.S;
  for(let m=0;m<M&&!S.over&&!S.cleared;m++){
    // 案件はそこそこ真面目に取るが、それ以外は何もしない
    let g=0;
    while(S.slots>0&&g++<20){
      const c=S.market.filter(d=>!E.bidCheck(d)&&d.upfront<S.cash*0.35)
        .sort((a,b)=>E.winScore(b,2)-E.winScore(a,2));
      if(!c.length)break;E.bid(c[0].id,2);
    }
    if(S.cash<E.equity()*0.12&&E.borrowLimit()>0)E.borrow(E.borrowLimit()*0.5);
    const o=E.advance();
    if(o.tob)E.defendTOB('explain');            // 無償の防衛策しか選ばない
    if(o.fy){
      if(o.fy.needEval)E.evaluatePlan(o.fy);
      // 本部にだけ薄く配り、サステナ・内部統制はゼロ
      const mp={};D.DIVISIONS.forEach(x=>{mp[x.id]=E.budgetPool()*0.05});
      E.allocateBudget(mp);
      E.payout({ratio:0,buyback:0});            // 万年無配
      if(o.fy.needVote&&!process.env.NOVOTE)E.ceoVote();
      if(o.fy.needPlan)E.formulatePlan({profit:2,roe:2,invest:2},['resource','partner']);
    }
  }
  if(S.over){over++;reasons[S.overReason||'?']=(reasons[S.overReason||'?']||0)+1;}
  if(S.cleared)cleared++;
  stages[D.STAGES[S.stage].name]=(stages[D.STAGES[S.stage].name]||0)+1;
}
console.log('凡庸プレイ: 敗北率',(over/RUNS*100).toFixed(0)+'%','敗因',reasons,'クリア',cleared,'到達',stages);
