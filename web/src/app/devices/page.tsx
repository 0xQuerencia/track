import "@/styles/devices.css";
import Link from "next/link";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { deviceConnectivity } from "@/lib/devices/status";
import { getDeviceSummary, getServiceStatuses } from "@/lib/devices";
import { deviceOptions, listDevices, projectOptions } from "@/lib/devices/queries";
import { ServicesPanel } from "./_components/services-panel";
import { StatusBadge } from "./_components/status-badge";
import { StorageBar } from "./_components/storage-bar";

export const dynamic = "force-dynamic";

/** The inventory: every device with its verified status, then every service. */
export default function DevicesPage() {
  const now = new Date();
  const devices = getDeviceSummary(now);
  const services = getServiceStatuses(now);

  return (
    <Page
      kicker="Devices"
      title="Devices"
      lede="Your machines and the services that run on them. Status is shown only when it was set by hand or checked in the last 24 hours; otherwise it reads Unknown."
    >
      <p className="dev-notice" role="note">
        Track does not store SSH keys, passwords or tokens, and no field here accepts them. Keep those in a password manager.
      </p>
      <StatGrid>
        <StatCard label="Devices" value={devices.total} />
        <StatCard label="Online (verified)" value={devices.online} hint={`${devices.offline} offline (verified)`} />
        <StatCard label="Unknown" value={devices.unknown} hint="No evidence either way" />
        <StatCard
          label="Storage used"
          value={devices.storage.usedGb}
          suffix=" GB"
          hint={devices.storage.devicesWithStorage > 0 ? `of ${devices.storage.totalGb} GB recorded` : "No storage recorded"}
        />
      </StatGrid>
      <StatGrid>
        <StatCard label="Services up" value={services.up} hint="Checked or set in 24 h" />
        <StatCard label="Services down" value={services.down} />
        <StatCard label="Services unknown" value={services.unknown} />
      </StatGrid>
      <EntityPanel
        entityKey="devices"
        title="Inventory"
        description="Add a device here. Connectivity and storage in use are set on each device's own page."
        rows={listDevices()}
        formExclude={["last_seen_at", "connectivity", "verified_at", "verified_by"]}
        columns={[
          {
            name: "name",
            label: "Device",
            render: (row) => <Link href={`/devices/${row.id}`}>{String(row.name)}</Link>,
          },
          { name: "kind" },
          { name: "os", label: "OS" },
          { name: "location" },
          {
            name: "storage_used_gb",
            label: "Storage",
            render: (row) => <StorageBar total={row.storage_total_gb} used={row.storage_used_gb} />,
          },
          {
            name: "connectivity",
            label: "Status",
            render: (row) => {
              const status = deviceConnectivity(
                { connectivity: row.connectivity, verified_at: row.verified_at, verified_by: row.verified_by },
                now,
              );
              return <StatusBadge state={status.state} label={status.label} detail={status.detail} />;
            },
          },
        ]}
      />
      <ServicesPanel devices={deviceOptions()} projects={projectOptions()} />
    </Page>
  );
}
