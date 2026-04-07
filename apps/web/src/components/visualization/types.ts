export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'radar'
  | 'scatter'
  | 'treemap'
  | 'funnel'
  | 'timeline';

export type StatType = 'kpi' | 'sparkline' | 'progress' | 'compare';

export interface DataItem {
  [key: string]: string | number | null;
}

export interface ChartConfig {
  type: ChartType;
  title?: string;
  sql?: string;
  x?: string;
  y?: string[];
  data?: DataItem[];
  stacked?: boolean;
  horizontal?: boolean;
}

export interface ProgressItem {
  label: string;
  value: number;
  max: number;
}

export interface StatConfig {
  type: StatType;
  title?: string;
  sql?: string;
  value?: string | number;
  change?: string;
  y?: string;
  keys?: string[];
  items?: ProgressItem[];
  data?: DataItem[];
}
