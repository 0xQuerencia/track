import Link from "next/link";
import {Page,Panel} from "@/components/track/page";
import {LockInTimer} from "./timer";
export const dynamic="force-dynamic";
export default function LockInPage(){
  return <Page kicker="Focus / Lock-In" title="Lock In" lede="Choose an intention. Protect your time. Your session survives refreshes and device switches.">
    <Panel title="Personal session" description="This is a private timer, not yet a multiplayer room."><LockInTimer/></Panel>
    <Panel title="Your focus records"><Link className="tk-button" href="/focus">Open focus history and legacy timer</Link></Panel>
  </Page>;
}
