export function DashboardChart({ data, currency }: { data: Array<{ label: string; value: number }>; currency?: string }) {
  const maximum = Math.max(...data.map((item) => Math.abs(item.value)), 1);
  const format = (value: number) => { try { return new Intl.NumberFormat(undefined, currency ? { style: "currency", currency } : {}).format(value); } catch { return String(value); } };
  return <div className="dashboard-chart">
    <div className="dashboard-chart__plot" aria-hidden="true">{data.map((item) => <div className="dashboard-chart__row" key={item.label}><span>{item.label}</span><div><i data-negative={item.value < 0} style={{ width: `${Math.abs(item.value) / maximum * 100}%` }} /></div><strong>{format(item.value)}</strong></div>)}</div>
    <table className="visually-hidden"><caption>Chart data</caption><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>{data.map((item) => <tr key={item.label}><th>{item.label}</th><td>{item.value}</td></tr>)}</tbody></table>
  </div>;
}
