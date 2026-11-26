import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {Page,Panel,StatGrid} from "@/components/track/page";
import {StatCard} from "@/components/track/stat-card";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {activityAnalytics,activityDay,localDay} from "@/lib/pulse/analytics";
export const dynamic="force-dynamic";
const hours=(n:number)=>Math.round(n/360000)/10;
const minutes=(n:number)=>Math.round(n/60000);
export default async function AnalyticsPage({searchParams}:{searchParams:Promise<{range?:string;day?:string}>}){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!await verifySessionToken(token))redirect("/login");
 const q=await searchParams,zone=process.env.TRACK_TZ??"UTC";
 // Server report uses a single request-time boundary.
 // eslint-disable-next-line react-hooks/purity
 const now=Date.now(),range=q.range==="30"?30:7;
 const db=getDb();
 let report:ReturnType<typeof activityAnalytics>|null=null,detail:ReturnType<typeof activityDay>|null=null;
 try{report=activityAnalytics(db,now,zone,range);}catch{/* A bounded report can require a narrower range. */}
 const selected=q.day??localDay(now,zone);
 try{detail=activityDay(db,selected,now,zone);}catch{/* Invalid dates and oversized windows do not show partial totals. */}
 const fmt=new Intl.DateTimeFormat("en",{timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZoneName:"short"});
 return <Page kicker="Pulse / Analytics" title="Activity history" lede={"Calendar days in "+zone+". Observed time is deduplicated; unobserved time is unknown, not idle or sleep."}>
 <p><Link href="/activity">Activity overview</Link> · <Link href="/activity/analytics?range=7" aria-current={range===7?"page":undefined}>7 days</Link> · <Link href="/activity/analytics?range=30" aria-current={range===30?"page":undefined}>30 days</Link></p>
 {report?<><StatGrid><StatCard label="Observed time" value={hours(report.observedMs)} suffix=" h"/><StatCard label="Total device time (may overlap)" value={hours(report.deviceMs)} suffix=" h"/><StatCard label="Unknown time" value={hours(report.unknownMs)} suffix=" h"/></StatGrid>
 <Panel title="Daily coverage" description="Select a date to see hourly coverage. Current day ends now; the oldest window is clipped to the retention period."><ul className="tk-list">{report.days.slice().reverse().map(d=><li key={d.day}><div style={{flex:1}}><Link href={"/activity/analytics?range="+range+"&day="+d.day}>{d.day}</Link><br/><progress aria-label={"Observed coverage on "+d.day} max={Math.max(1,d.endMs-d.startMs)} value={d.observedMs} style={{width:"100%"}}/><small>{minutes(d.observedMs)} min observed · {minutes(d.unknownMs)} min unknown</small></div></li>)}</ul></Panel></>:<Panel title="Daily coverage"><p>Report unavailable or too many observations for this window. Try a single date below.</p></Panel>}
 <Panel title={"Hourly timeline · "+selected} description="Each row represents at most one elapsed hour. Repeated daylight-saving hours include a timezone label. Conflicting categories remain mixed.">
 <form action="/activity/analytics" method="get" className="tk-stack"><input type="hidden" name="range" value={range}/><label>Date <input type="date" name="day" defaultValue={selected} max={localDay(now,zone)} required/></label><button className="tk-button">View date</button></form>
 {detail?<ul className="tk-list">{detail.bins.map(b=><li key={b.startMs}><div style={{flex:1}}><strong>{fmt.format(b.startMs)} – {fmt.format(b.endMs)}</strong><br/><progress max={b.endMs-b.startMs} value={b.observedMs} aria-label={"Observed minutes "+fmt.format(b.startMs)} style={{width:"100%"}}/><p>{minutes(b.observedMs)} min observed · {minutes(b.unknownMs)} min unknown</p><small>{Object.entries(b.categoryMs).filter(([name,ms])=>name!=="Unknown"&&ms>0).map(([name,ms])=>name+": "+minutes(ms)+"m").join(" · ")||"No categorized observation"}</small></div></li>)}</ul>:<p>No valid retained window for this date, or the report exceeds its interval limit.</p>}
 </Panel></Page>;
}
