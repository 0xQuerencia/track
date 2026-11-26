import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {Page} from "@/components/track/page";
import {listAIPods} from "@/lib/dreamer/studio";
import {ResearchWorkspace} from "./research-workspace";
import "@/styles/dreamer.css";
import "@/styles/dreamer-missions.css";
export const dynamic="force-dynamic";
export default async function ResearchPage(){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!await verifySessionToken(token))redirect("/login");
 return <Page kicker="Dreamer / Research" title="Evidence desk" lede="Fetch bounded source snippets and metadata, inspect the original citation, then explicitly save useful evidence to a private memory namespace.">
 <nav className="dreamer-tabs" aria-label="Dreamer navigation"><Link href="/dreamer">Dreamer</Link><Link href="/dreamer/missions">Mission Control</Link><Link href="/dreamer/memory">Memory</Link><Link href="/dreamer/research" aria-current="page">Research</Link></nav>
 <ResearchWorkspace pods={listAIPods(getDb()).map(p=>({id:p.id,name:p.name}))}/>
 </Page>;
}
