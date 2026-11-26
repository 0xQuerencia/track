import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {ActionInbox} from "./action-inbox";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function InboxPage({searchParams}:{searchParams:Promise<{job?:string}>}){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token||!await verifySessionToken(token))redirect("/login");
 const {job}=await searchParams;
 return <Page kicker="Dreamer / Action review" title="Inbox & approvals" lede="Review exact local record proposals. No record is created until you approve it individually.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/studio">Studio</Link><Link href="/dreamer/schedules">Schedules</Link><Link href="/dreamer/inbox" aria-current="page">Inbox</Link></nav>
 <ActionInbox initialJob={typeof job==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(job)?job:""}/>
 </Page>;
}
