import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {listAIPods} from "@/lib/dreamer/studio";
import {MemoryWorkspace} from "./memory-workspace";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function MemoryPage({searchParams}:{searchParams:Promise<{pod?:string;job?:string}>}){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;
 if(!token||!await verifySessionToken(token))redirect("/login");
 const {pod,job}=await searchParams;const pods=listAIPods(getDb()).map(p=>({id:p.id,name:p.name}));
 return <Page kicker="Dreamer / Memory" title="Private knowledge" lede="Store deliberate memory notes for yourself or a single private AI Pod. Nothing is automatically added to a model request.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/studio">Studio</Link><Link href="/dreamer/schedules">Schedules</Link><Link href="/dreamer/inbox">Inbox</Link><Link href="/dreamer/memory" aria-current="page">Memory</Link></nav>
 <MemoryWorkspace pods={pods} initialNamespace={typeof pod==="string"&&pods.some(p=>p.id===pod)?pod:"personal"} sourceJobId={typeof job==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(job)?job:""}/>
 </Page>;
}
