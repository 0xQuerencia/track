import Link from "next/link";
import { Panel } from "@/components/track/page";
import { DeleteButton } from "@/components/track/row-controls";
import { shortDay } from "@/lib/dates";
import { serviceState } from "@/lib/devices/status";
import { listServices } from "@/lib/devices/queries";
import { ServiceActions } from "./service-actions";
import { ServiceForm } from "./service-form";
import { StatusBadge } from "./status-badge";

/**
 * Services with their honest status, optionally for one device. Up and Down
 * appear only after a check or a manual choice; otherwise Unknown.
 */
export function ServicesPanel({
  deviceId,
  devices,
  projects,
}: {
  deviceId?: number;
  devices: { id: number; name: string }[];
  projects: { id: number; name: string }[];
}) {
  const now = new Date();
  const services = listServices(deviceId);
  return (
    <Panel
      title="Services"
      description="A service is Up or Down only after a check or a manual choice in the last 24 hours. Checks make one request to the URL and store the outcome."
    >
      <details className="tk-add" open={services.length === 0}>
        <summary>Add service</summary>
        <ServiceForm devices={devices} projects={projects} defaultDeviceId={deviceId} />
      </details>
      {services.length === 0 ? (
        <p className="tk-empty">No services yet.</p>
      ) : (
        <div className="tk-table-wrap">
          <table className="tk-table dev-services-table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Kind</th>
                {deviceId === undefined ? <th scope="col">Device</th> : null}
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
                <th scope="col" aria-label="Delete" />
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const state = serviceState(
                  {
                    status: service.status,
                    status_source: service.status_source,
                    last_checked_at: service.last_checked_at,
                  },
                  now,
                );
                const url = typeof service.url === "string" && service.url !== "" ? service.url : null;
                return (
                  <tr key={service.id} id={`services-${service.id}`}>
                    <td>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {service.name}
                        </a>
                      ) : (
                        service.name
                      )}
                    </td>
                    <td>{service.kind ?? "—"}</td>
                    {deviceId === undefined ? (
                      <td>
                        {service.device_id !== null && service.device_name ? (
                          <Link href={`/devices/${service.device_id}`}>{service.device_name}</Link>
                        ) : (
                          "Unassigned"
                        )}
                      </td>
                    ) : null}
                    <td>
                      {service.project_id !== null && service.project_name ? (
                        <Link href={`/projects#projects-${service.project_id}`}>{service.project_name}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <StatusBadge state={state.state} label={state.label} detail={state.detail} />
                      {state.checkedAt ? <small className="dev-muted"> {shortDay(state.checkedAt.slice(0, 10))}</small> : null}
                    </td>
                    <td>
                      <ServiceActions serviceId={service.id} hasUrl={url !== null} />
                    </td>
                    <td data-align="end">
                      <DeleteButton entityKey="services" id={service.id} label={`service ${service.name}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
