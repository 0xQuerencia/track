import { BarsChart, PALETTE } from "@/components/track/charts";
import { Panel } from "@/components/track/page";
import { addMonthsToMonth, formatMoney, fromPaise } from "@/lib/money/format";
import { monthlySeries } from "@/lib/money/queries";
import { MonthNav, type MoneyTab } from "./tab-nav";

const MONTHS_SHOWN = 12;

/** Money in and out for the twelve months ending with the chosen month. */
export function TimelineTab({ month, tab }: { month: string; tab: MoneyTab }) {
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => addMonthsToMonth(month, i - (MONTHS_SHOWN - 1)));
  const series = monthlySeries(months);
  const chartData = series.map((point) => ({
    name: point.month.slice(5),
    income: fromPaise(point.incomePaise),
    expense: fromPaise(point.expensePaise),
  }));
  const hasAny = series.some((point) => point.incomePaise > 0 || point.expensePaise > 0);

  return (
    <>
      <MonthNav
        tab={tab}
        month={month}
        previous={addMonthsToMonth(month, -1)}
        next={addMonthsToMonth(month, 1)}
      />
      <Panel title="Money in and out, 12 months" description="Income and spending per month, from transactions.">
        <BarsChart
          data={chartData}
          series={[
            { key: "income", color: PALETTE[0] },
            { key: "expense", color: PALETTE[5] },
          ]}
          emptyNote="Add transactions to see the timeline."
        />
      </Panel>
      <Panel title="By month">
        {hasAny ? (
          <div className="tk-table-wrap">
            <table className="tk-table money-timeline-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" data-align="end">In</th>
                  <th scope="col" data-align="end">Out</th>
                  <th scope="col" data-align="end">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((point) => {
                  const net = point.incomePaise - point.expensePaise;
                  return (
                    <tr key={point.month}>
                      <th scope="row">{point.month}</th>
                      <td data-align="end">{formatMoney(point.incomePaise, { paise: true })}</td>
                      <td data-align="end">{formatMoney(point.expensePaise, { paise: true })}</td>
                      <td data-align="end" className={net < 0 ? "money-negative" : undefined}>
                        {formatMoney(net, { paise: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tk-empty">No transactions in these twelve months.</p>
        )}
      </Panel>
    </>
  );
}
