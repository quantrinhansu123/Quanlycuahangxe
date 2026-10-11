import { ChartArea, BarChart2, LineChart as LineChartIcon } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart,
  Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  formatReportChartValue, reportChartDayWidth,
  type ReportChartUnit, type ReportChartVariant,
} from '../../lib/reportChart';

export type DailyRevenueSeries = { key: string; name: string; color: string };
export type DailyRevenuePoint = { date: string; [key: string]: string | number };

export function ReportChartControls({ chartType, onChartTypeChange, unit, onUnitChange }: {
  chartType: ReportChartVariant;
  onChartTypeChange: (value: ReportChartVariant) => void;
  unit: ReportChartUnit;
  onUnitChange: (value: ReportChartUnit) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Kiểu biểu đồ" className="inline-flex gap-1 rounded-md bg-muted p-1">
        {([
          { value: 'bar', label: 'Cột', icon: BarChart2 },
          { value: 'line', label: 'Đường', icon: LineChartIcon },
          { value: 'area', label: 'Vùng', icon: ChartArea },
        ] as const).map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" aria-label={label} title={label}
            aria-pressed={chartType === value} onClick={() => onChartTypeChange(value)}
            className={`inline-flex h-8 w-9 items-center justify-center rounded text-foreground focus-visible:outline-2 focus-visible:outline-primary ${chartType === value ? 'bg-card shadow-sm' : 'hover:bg-card/60'}`}>
            <Icon size={16} />
          </button>
        ))}
      </div>
      <div role="group" aria-label="Đơn vị tiền" className="inline-flex gap-1 rounded-md bg-muted p-1">
        {([{ value: 'million', label: 'Triệu đồng' }, { value: 'dong', label: 'Đồng' }] as const).map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={unit === value} onClick={() => onUnitChange(value)}
            className={`h-8 whitespace-nowrap rounded px-3 text-[12px] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary ${unit === value ? 'bg-card shadow-sm' : 'hover:bg-card/60'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DailyRevenueChart({ data, series, chartType, unit, label }: {
  data: DailyRevenuePoint[];
  series: DailyRevenueSeries[];
  chartType: ReportChartVariant;
  unit: ReportChartUnit;
  label: string;
}) {
  const formatValue = (value: unknown) => formatReportChartValue(Number(value), unit);
  const labelLength = data.reduce((max, point) =>
    Math.max(max, ...series.map(item => formatValue(point[item.key]).length)), 1);
  const slotWidth = Math.max(32, labelLength * 7) + 16;
  const axisWidth = unit === 'dong' ? Math.max(80, labelLength * 7 + 12) : 52;
  const minWidth = data.length * reportChartDayWidth(labelLength, series.length) + axisWidth + 24;
  const chartProps = { data, margin: { top: 36, right: 24, left: 0, bottom: 8 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="date" interval={0} axisLine={false} tickLine={false} tickMargin={12} height={38}
        padding={chartType === 'bar' ? undefined : { left: (minWidth - axisWidth - 24) / data.length / 2, right: (minWidth - axisWidth - 24) / data.length / 2 }}
        tickFormatter={date => String(date).split('-').slice(1).reverse().join('/')}
        tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
      <YAxis tickCount={4} axisLine={false} tickLine={false} tickFormatter={formatValue} width={axisWidth}
        tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
      <Tooltip cursor={{ fill: 'var(--muted)', stroke: 'var(--border)' }}
        formatter={value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value))}
        labelFormatter={date => String(date).split('-').reverse().join('/')}
        contentStyle={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 6 }}
        itemStyle={{ color: 'var(--foreground)', fontSize: 12 }} />
    </>
  );
  const pointLabels = (item: DailyRevenueSeries, seriesIndex: number) => (
    <LabelList dataKey={item.key} content={({ x, y, value }) => (
      <text x={Number(x) + (seriesIndex - (series.length - 1) / 2) * slotWidth} y={Number(y) - 12}
        textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--foreground)">{formatValue(value)}</text>
    )} />
  );

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-foreground">
        {series.map(item => <span key={item.key} className="inline-flex min-w-0 items-center gap-2">
          <i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-xs" style={{ background: item.color }} />
          {item.name}
        </span>)}
        <span className="ml-auto whitespace-nowrap text-muted-foreground">{unit === 'dong' ? 'Đồng' : 'Triệu đồng'}</span>
      </div>
      <div role="region" aria-label={label} tabIndex={0}
        className="max-w-full overflow-x-auto overscroll-x-contain pb-2 custom-scrollbar focus-visible:outline-2 focus-visible:outline-primary">
        <div style={{ minWidth, height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart {...chartProps} barGap={Math.max(16, slotWidth - 32)} barCategoryGap={series.length > 1 ? slotWidth / 2 : '28%'}>
                {axes}
                {/* Retain zero-value label coordinates without drawing a fake bar. */}
                {series.map(item => <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.color}
                  shape={<Rectangle />} maxBarSize={32} radius={[7, 7, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey={item.key} position="top" offset={10} formatter={formatValue}
                    style={{ fontSize: 12, fontWeight: 500, fill: 'var(--foreground)' }} />
                </Bar>)}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart {...chartProps}>
                {axes}
                {series.map((item, index) => <Line key={item.key} dataKey={item.key} name={item.name} type="monotone"
                  stroke={item.color} strokeWidth={2} dot={data.length === 1 ? { r: 3 } : false} isAnimationActive={false}>
                  {pointLabels(item, index)}
                </Line>)}
              </LineChart>
            ) : (
              <AreaChart {...chartProps}>
                {axes}
                {series.map((item, index) => <Area key={item.key} dataKey={item.key} name={item.name} type="monotone"
                  stroke={item.color} fill={item.color} fillOpacity={0.12} strokeWidth={2}
                  dot={data.length === 1 ? { r: 3 } : false} isAnimationActive={false}>
                  {pointLabels(item, index)}
                </Area>)}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
