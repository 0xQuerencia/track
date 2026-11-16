import "@/styles/devices.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, Page, SplitPanels } from "@/components/track/page";
import { DeleteButton, InlineField } from "@/components/track/row-controls";
import { RelatedLinks } from "@/components/track/related-links";
import { shortDay, todayStr } from "@/lib/dates";
import { getEntity } from "@/lib/entities";
import { deviceConnectivity } from "@/lib/devices/status";
import { deviceOptions, getDevice, listMaintenance, projectOptions } from "@/lib/devices/queries";
import { listLinks } from "@/lib/links";
import { ConnectivityControl } from "../_components/connectivity-control";
import { MaintenanceForm } from "../_components/maintenance-form";
import { ServicesPanel } from "../_components/services-panel";
import { StatusBadge } from "../_components/status-badge";
import { StorageBar } from "../_components/storage-bar";

export const dynamic = "force-dynamic";

const DEVICE_ID = /^\d{1,12}$/;

/** One device: its verified connection, storage, services, maintenance log, and linked projects. */
export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!DEVICE_ID.test(raw)) notFound();
  const id = Number(raw);
  const device = getDevice(id);
  if (!device) notFound();

  const now = new Date();
  const status = deviceConnectivity(
    { connectivity: device.connectivity, verified_at: device.verified_at, verified_by: device.verified_by },
    now,
  );
  const maintenance = listMaintenance(id);
  const details = [device.kind, device.os, device.location].filter((part) => typeof part === "string" && part !== "");
  const storageField = (name: "storage_total_gb" | "storage_used_gb") => {
    const field = getEntity("devices")?.fields.find((f) => f.name === name);
    return field ? <InlineField entityKey="devices" id={id} field={field} value={device[name] ?? null} /> : null;
  };

  return (
    <Page
      kicker="Devices"
      title={String(device.name)}
      lede={details.length > 0 ? details.join(" · ") : "No details recorded yet."}
    >
      <p>
        <Link href="/devices" className="tk-button tk-ghost">
          ← All devices
        </Link>
      </p>
      <SplitPanels>
        <Panel title="Connection" description="Set by hand. A device shows Online or Offline only from a choice you made or a check in the last 24 hours.">
          <p>
            <StatusBadge state={status.state} label={status.label} detail={status.detail} />
          </p>
          <ConnectivityControl deviceId={id} current={String(device.connectivity ?? "Unknown")} />
          <p className="dev-muted">
            Last seen: {typeof device.last_seen_at === "string" && device.last_seen_at ? shortDay(device.last_seen_at.slice(0, 10)) : "never recorded"}
          </p>
        </Panel>
        <Panel title="Storage" description="Enter the numbers in gigabytes. The bar is computed from them.">
          <StorageBar total={device.storage_total_gb} used={device.storage_used_gb} />
          <div className="dev-storage-edit">
            <label>
              <span>Total (GB)</span>
              {storageField("storage_total_gb")}
            </label>
            <label>
              <span>In use (GB)</span>
              {storageField("storage_used_gb")}
            </label>
          </div>
        </Panel>
      </SplitPanels>
      <ServicesPanel deviceId={id} devices={deviceOptions()} projects={projectOptions()} />
      <Panel title="Maintenance log" description="Dated notes on what was done to this device.">
        <details className="tk-add" open={maintenance.length === 0}>
          <summary>Add entry</summary>
          <MaintenanceForm deviceId={id} today={todayStr()} />
        </details>
        {maintenance.length === 0 ? (
          <p className="tk-empty">No maintenance recorded yet.</p>
        ) : (
          <ul className="tk-list dev-maintenance-list">
            {maintenance.map((entry) => (
              <li key={entry.id} id={`maintenance_logs-${entry.id}`}>
                <span>
                  <strong>{entry.date ? shortDay(String(entry.date)) : "No date"}</strong> {String(entry.note)}
                </span>
                <DeleteButton entityKey="maintenance_logs" id={entry.id} label={`maintenance entry ${entry.id}`} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {device.maintenance_notes || device.notes ? (
        <Panel title="Notes">
          {device.maintenance_notes ? (
            <>
              <h3 className="dev-subhead">Maintenance notes</h3>
              <p className="dev-prewrap">{String(device.maintenance_notes)}</p>
            </>
          ) : null}
          {device.notes ? (
            <>
              <h3 className="dev-subhead">Notes</h3>
              <p className="dev-prewrap">{String(device.notes)}</p>
            </>
          ) : null}
        </Panel>
      ) : null}
      <RelatedLinks type="devices" id={id} links={listLinks("devices", id)} title="Linked projects and records" />
    </Page>
  );
}
