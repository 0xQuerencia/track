import { Panel } from "@/components/track/page";
import { isoDate, monthStart, todayStr } from "@/lib/dates";

/** Downloads transactions in a date range as CSV. A plain GET form, so it works without scripts. */
export function ExportTab({ from, to }: { from?: string; to?: string }) {
  const start = from && isoDate(from) ? from : monthStart();
  const end = to && isoDate(to) ? to : todayStr();
  return (
    <Panel
      title="Export transactions"
      description="Download every income and expense in a date range as a CSV file for a spreadsheet, with project names included."
    >
      <form action="/api/money/export" method="get" className="tk-form money-export-form">
        <div className="tk-form-grid">
          <label className="tk-field">
            <span>From</span>
            <input name="from" type="date" defaultValue={start} required />
          </label>
          <label className="tk-field">
            <span>To</span>
            <input name="to" type="date" defaultValue={end} required />
          </label>
        </div>
        <div className="tk-form-actions">
          <button type="submit" className="tk-button tk-primary">
            Download CSV
          </button>
        </div>
      </form>
      <p className="money-hint">
        Bank accounts are not connected, so the file holds only what you have entered here.
      </p>
    </Panel>
  );
}
