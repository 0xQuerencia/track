import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {studioSnapshot} from "@/lib/dreamer/studio-commands";
import {Studio} from "./studio";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function StudioPage(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token||!await verifySessionToken(token))redirect("/login");
 return <Page kicker="Dreamer / Studio" title="Your AI workforce" lede="Build private specialist teams with bounded responsibilities. Teams analyze only the objective you explicitly submit. No tool permissions or personal records are granted here.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/studio" aria-current="page">Studio</Link><Link href="/dreamer/schedules">Schedules</Link><Link href="/dreamer/inbox">Inbox</Link></nav>
 <Studio initial={studioSnapshot(getDb())}/>
 </Page>;
}
