import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {listAIPods} from "@/lib/dreamer/studio";
import {scheduleSnapshot} from "@/lib/dreamer/schedule-commands";
import {Schedules} from "./schedules";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function SchedulePage(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token||!await verifySessionToken(token))redirect("/login");
 const db=getDb();
 return <Page kicker="Dreamer / Recurring work" title="Schedules" lede="Approve a fixed recurring objective and an optional private AI Pod. A running worker is required; no external actions or private source excerpts are sent.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/studio">Studio</Link><Link href="/dreamer/schedules" aria-current="page">Schedules</Link><Link href="/dreamer/inbox">Inbox</Link></nav>
 <Schedules initial={scheduleSnapshot(db)} pods={listAIPods(db).map(p=>({id:p.id,name:p.name,enabled:p.enabled}))}/>
 </Page>;
}
