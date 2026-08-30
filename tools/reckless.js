/* 無謀な経営者でどうなるか（破綻可能性の確認） */
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');const store={};
const sb={window:{},console,localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}},Math,Date,JSON,Object,Array,String,Number,isNaN,parseFloat};
sb.globalThis=sb;vm.createContext(sb);
['js/data.js','js/engine.js'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sb,{filename:f}));
const E=sb.window.ENGINE,D=sb.window.GAME;
const RUNS=+(process.argv[2]||40),M=+(process.argv[3]||120);
let over=0,stages={},reasons={};
for(let r=0;r<RUNS;r++){
  E.newGame('無謀商事');const S=E.S;
  for(let m=0;m<M&&!S.over&&!S.cleared;m++){
    // 常に強気(4)で最大規模の案件に突っ込み、限度いっぱい借り、余剰は全部投資
    let g=0;
    while(S.slots>0&&g++<24){
      const c=S.market.filter(d=>!E.bidCheck(d)).sort((a,b)=>(b.exposure||0)-(a.exposure||0));
      if(!c.length)break;E.bid(c[0].id,4);
    }
    if(E.borrowLimit()>0)E.borrow(E.borrowLimit()*0.9);
    const dv=D.DIVISIONS.map(x=>({id:x.id,c:E.upgradeCost(x.id)})).sort((a,b)=>a.c-b.c);
    if(S.cash>dv[0].c)E.upgrade(dv[0].id);
    const no=D.REGIONS.filter(x=>!E.hasOffice(x.id));
    if(no.length&&S.cash>E.officeCost())E.openOffice(no[0].id);
    const o=E.advance();if(o.tob)E.defendTOB('explain');if(o.fy){if(o.fy.needVote)E.ceoVote();if(o.fy.needEval)E.evaluatePlan(o.fy);if(o.fy.needPlan)E.formulatePlan({profit:2,roe:2,invest:2},['resource','partner']);const mp={};D.DIVISIONS.forEach(x=>mp[x.id]=S.cash*0.09);E.allocateBudget(mp);E.payout({ratio:0.9,buyback:0});}
  }
  if(S.over)over++;reasons[S.overReason||'?']=(reasons[S.overReason||'?']||0)+1;
  const n=D.STAGES[S.stage].name;stages[n]=(stages[n]||0)+1;
}
console.log('無謀プレイ: 敗北率',(over/RUNS*100).toFixed(0)+'%','敗因',reasons,'到達',stages);
