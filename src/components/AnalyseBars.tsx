export function AnalyseBars({
  counts,
  labels,
  describe,
}: {
  counts: readonly number[];
  // One label per bar; empty strings leave a gap so the axis stays readable.
  labels: readonly string[];
  // One line of text for a bar's tooltip.
  describe: (index: number) => string;
}) {
  const max = Math.max(0, ...counts);
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const lines: number[] = [];
  for (let value = step; value <= top; value += step) lines.push(value);

  return (
    <div className="ana-bars">
      <div className="ana-bars-plot">
        {lines.map((value) => (
          <div key={value} className="ana-bars-grid" style={{ bottom: `${(value / top) * 100}%` }}>
            <span>{value}</span>
          </div>
        ))}
        <div className="ana-bars-cols">
          {counts.map((count, index) => (
            <div key={index} className="ana-bars-col" title={describe(index)}>
              {count > 0 && count === max ? <span className="ana-bars-val">{count}</span> : null}
              <div className="ana-bars-bar" style={{ height: `${(count / top) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="ana-bars-labels">
        {labels.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
    </div>
  );
}
