import {unionIntervals,type TimeWindow} from "./intervals";
import {CATEGORIES,type Category} from "./classification";
export type CategorizedInterval=TimeWindow&{category:Category};
/** Only assigns segments where all observed categories agree. Conflicts remain mixed. */
export function categoryTime(intervals:readonly CategorizedInterval[],window:TimeWindow){
  if(!Number.isSafeInteger(window.startMs)||!Number.isSafeInteger(window.endMs)||window.endMs<=window.startMs)throw new RangeError("Invalid window");
  const events:{at:number;category:Category;delta:number}[]=[];
  for(const c of CATEGORIES){
    for(const i of unionIntervals(intervals.filter(i=>i.category===c),window)){
      events.push({at:i.startMs,category:c,delta:1},{at:i.endMs,category:c,delta:-1});
    }
  }
  events.sort((a,b)=>a.at-b.at);
  const active=new Set<Category>(),totals:Record<Category|"Mixed"|"Unknown",number>={Study:0,Coding:0,Media:0,Social:0,Games:0,Other:0,Mixed:0,Unknown:0};
  let cursor=window.startMs;
  for(const e of events){
    const category=active.size===0?"Unknown":active.size===1?[...active][0]:"Mixed";
    totals[category]+=e.at-cursor;cursor=e.at;
    if(e.delta===1)active.add(e.category);else active.delete(e.category);
  }
  totals.Unknown+=window.endMs-cursor;
  return totals;
}
