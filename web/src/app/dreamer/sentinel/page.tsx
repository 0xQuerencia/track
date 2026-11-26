import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {SentinelWorkspace} from "./sentinel-workspace";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function SentinelPage(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!await verifySessionToken(token))redirect("/login");
 return <Page kicker="Dreamer / Sentinel" title="Watch desk" lede="Opt into bounded GitHub repository sample checks and review actual change receipts. Monitoring requires a separately running worker.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/research">Research</Link><Link href="/dreamer/inbox">Inbox</Link><Link href="/dreamer/sentinel" aria-current="page">Sentinel</Link></nav>
 <SentinelWorkspace/>
 </Page>;
}
