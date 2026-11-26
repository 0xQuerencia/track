import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {MissionControl} from "./mission-control";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function MissionsPage({searchParams}:{searchParams:Promise<{pod?:string;job?:string}>}){
 const {pod,job}=await searchParams;
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token||!await verifySessionToken(token))redirect("/login");
 return <Page kicker="Dreamer · durable queue" title="Mission Control" lede="Delegate an explicit objective, inspect each specialist's progress, and review the resulting analysis. No external actions are executed.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer?tab=sources">Sources &amp; Privacy</Link><Link href="/dreamer/missions" aria-current="page">Mission Control</Link><Link href="/dreamer/studio">Studio</Link><Link href="/dreamer/schedules">Schedules</Link></nav>
 <MissionControl initialPod={typeof pod==="string"?pod:""} initialJob={typeof job==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(job)?job:null}/>
 </Page>;
}
