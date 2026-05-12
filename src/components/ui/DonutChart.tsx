import React from 'react';

interface DonutChartProps {
  data: {
    label: string;
    value: number;
    color: string;
  }[];
  totalLabel?: string;
  className?: string;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, totalLabel = 'Tổng số', className }) => {
  const total = data.reduce((acc, item) => acc + item.value, 0);
  const size = 120;
  const strokeWidth = 14;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        
        {/* Data segments */}
        {data.map((item, index) => {
          if (total === 0) return null;
          const percentage = (item.value / total) * 100;
          const strokeDasharray = `${(percentage * circumference) / 100} ${circumference}`;
          const strokeDashoffset = -currentOffset;
          currentOffset += (percentage * circumference) / 100;

          return (
            <circle
              key={index}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={item.color}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          );
        })}
      </svg>
      
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-black text-foreground leading-none">{total}</span>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter mt-1">{totalLabel}</span>
      </div>
    </div>
  );
};

export default DonutChart;
