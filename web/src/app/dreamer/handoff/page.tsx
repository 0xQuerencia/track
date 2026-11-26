import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {Page,Panel} from "@/components/track/page";
import {getDb} from "@/lib/db";
import {getJob} from "@/lib/dreamer/jobs";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {EmailComposer} from "./email-composer";
export const dynamic="force-dynamic";
export default async function HandoffPage({searchParams}:{searchParams:Promise<{job?:string}>}){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!await verifySessionToken(token))redirect("/login");
 const {job}=await searchParams;
 const mission=job&&/^[a-zA-Z0-9_-]{1,80}$/.test(job)?getJob(getDb(),job):null;
 const report=mission?.state==="complete"?mission.steps.find(s=>s.agentKey==="chief"&&s.state==="complete")?.outputMd??"": "";
 return <Page kicker="Dreamer / Handoff" title="Prepare an unsent email" lede="Review and edit a draft, then download it for your own mail client. Track does not connect to your mailbox or send anything.">
 <p><Link href="/dreamer/missions">Mission Control</Link> · <Link href="/dreamer/inbox">Approval inbox</Link></p>
 <Panel title="Local draft"><EmailComposer report={report.slice(0,12000)}/></Panel>
 </Page>;
}
