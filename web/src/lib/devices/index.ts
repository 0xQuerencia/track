import { deviceConnectivity, serviceState, type DeviceConnectivity, type ServiceState } from "./status";
import { listDevices, listServices } from "./queries";

export { deviceConnectivity, serviceState } from "./status";
export type { DeviceConnectivity, ServiceState } from "./status";
export { checkServiceUrl } from "./check";
export type { CheckOutcome } from "./check";

const round1 = (value: number): number => Math.round(value * 10) / 10;

export type DeviceSummary = {
  total: number;
  online: number;
  offline: number;
  /** Devices with no evidence either way. Never counted as online. */
  unknown: number;
  storage: { totalGb: number; usedGb: number; devicesWithStorage: number };
};

/** Counts for the dashboard. Only verified states are counted as Online or Offline. */
export function getDeviceSummary(now: Date = new Date()): DeviceSummary {
  const summary: DeviceSummary = {
    total: 0,
    online: 0,
    offline: 0,
    unknown: 0,
    storage: { totalGb: 0, usedGb: 0, devicesWithStorage: 0 },
  };
  for (const device of listDevices()) {
    summary.total += 1;
    const status: DeviceConnectivity = deviceConnectivity(
      {
        connectivity: device.connectivity,
        verified_at: device.verified_at,
        verified_by: device.verified_by,
      },
      now,
    );
    if (status.state === "Online") summary.online += 1;
    else if (status.state === "Offline") summary.offline += 1;
    else summary.unknown += 1;

    const total = typeof device.storage_total_gb === "number" ? device.storage_total_gb : null;
    const used = typeof device.storage_used_gb === "number" ? device.storage_used_gb : null;
    if (total !== null && used !== null) {
      summary.storage.devicesWithStorage += 1;
      summary.storage.totalGb = round1(summary.storage.totalGb + total);
      summary.storage.usedGb = round1(summary.storage.usedGb + used);
    }
  }
  return summary;
}

export type ServiceStatusItem = ServiceState & {
  id: number;
  name: string;
  url: string | null;
  deviceName: string | null;
  projectName: string | null;
};

export type ServiceStatuses = {
  total: number;
  up: number;
  down: number;
  unknown: number;
  items: ServiceStatusItem[];
};

/** Every service with its honest state. A service with no recent evidence is Unknown. */
export function getServiceStatuses(now: Date = new Date()): ServiceStatuses {
  const items: ServiceStatusItem[] = listServices().map((row) => {
    const state = serviceState(
      {
        status: row.status,
        status_source: row.status_source,
        last_checked_at: row.last_checked_at,
      },
      now,
    );
    return {
      ...state,
      id: row.id,
      name: String(row.name),
      url: typeof row.url === "string" ? row.url : null,
      deviceName: row.device_name,
      projectName: row.project_name,
    };
  });
  return {
    total: items.length,
    up: items.filter((item) => item.state === "Up").length,
    down: items.filter((item) => item.state === "Down").length,
    unknown: items.filter((item) => item.state === "Unknown").length,
    items,
  };
}
