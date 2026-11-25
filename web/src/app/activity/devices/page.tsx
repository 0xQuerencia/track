import Link from "next/link";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {Page,Panel} from "@/components/track/page";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {listPulseDevices} from "@/lib/pulse/devices";
import {revokeIntegrationTokenAction} from "@/app/settings/actions";
import {PulsePairingForm} from "./pairing-form";
export const dynamic="force-dynamic";
function timestamp(ms:number|null){return ms===null?"None received":new Date(ms).toISOString();}
export default async function PulseDevicesPage(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token))redirect("/login");
  const devices=listPulseDevices(getDb());
  return <Page kicker="Pulse / Devices" title="Pair a device" lede="Use one activity-only token per collector. Revocation stops future uploads, not past observations.">
    <Panel title="Pair a collector"><PulsePairingForm/><p>Configure your collector with the HTTPS origin of this server and the one-time token. Never paste an owner password.</p></Panel>
    <Panel title="Device health" description="Last received is based on stored intervals, not a live presence signal. Paused collection and empty queues do not imply a device is offline.">
      {devices.length===0?<p className="tk-empty">No activity tokens.</p>:<ul className="tk-list">{devices.map(d=><li key={d.id}><div><strong>{d.label}</strong><p>{d.revokedAt?"Revoked":d.intervalCount?"Observed":"No stored observations"}</p><small>Sources: {d.sources.join(", ")||"Unknown"} · {d.intervalCount} intervals</small><p>Last received: {timestamp(d.lastReceivedMs)}</p><p>Last observed: {timestamp(d.lastObservedMs)}</p><small>Token last used: {d.lastUsedAt??"Never"}</small></div>{!d.revokedAt?<form action={revokeIntegrationTokenAction}><input type="hidden" name="id" value={d.id}/><button className="tk-button tk-danger">Revoke</button></form>:null}</li>)}</ul>}
    </Panel>
    <Link href="/activity">Back to activity</Link>
  </Page>;
}
