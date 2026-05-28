"use client";

import { useState, useMemo } from "react";
import { Plus, Scale, Heart, Activity, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { clsx } from "clsx";
import { useBodyMetrics, useDeleteBodyMetric, type BodyMetric } from "@/hooks/useBodyMetrics";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { LineChart } from "@/components/primitives/charts/LineChart";
import { AddMetricModal } from "@/components/modals/AddMetricModal";

type MetricType = "weight" | "pressure" | "pulse";

interface MetricConfig {
  type: MetricType;
  label: string;
  unit: string;
  color: string;
  Icon: React.ElementType;
  formatValue: (m: BodyMetric) => string;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    type: "weight",
    label: "Вес",
    unit: "кг",
    color: "#6366F1",
    Icon: Scale,
    formatValue: (m) =>
      `${parseFloat(String(m.value)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг`,
  },
  {
    type: "pressure",
    label: "Давление",
    unit: "мм рт.ст.",
    color: "#F43F5E",
    Icon: Heart,
    formatValue: (m) =>
      m.value2 != null ? `${Math.round(m.value)} / ${Math.round(m.value2)}` : `${Math.round(m.value)}`,
  },
  {
    type: "pulse",
    label: "Пульс",
    unit: "уд/мин",
    color: "#10B981",
    Icon: Activity,
    formatValue: (m) => `${Math.round(m.value)} уд/мин`,
  },
];

const PERIODS = [
  { label: "7 дн.",  days: 7 },
  { label: "30 дн.", days: 30 },
  { label: "90 дн.", days: 90 },
  { label: "Всё",   days: 0 },
];

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function MetricCard({
  config,
  entries,
  selected,
  onClick,
}: {
  config: MetricConfig;
  entries: BodyMetric[];
  selected: boolean;
  onClick: () => void;
}) {
  const latest = entries[0];
  const prev = entries[1];
  const { Icon } = config;

  let TrendIcon: React.ElementType | null = null;
  let trendCls = "text-slate-400";
  if (latest && prev) {
    const diff = latest.value - prev.value;
    if (Math.abs(diff) < 0.01) { TrendIcon = Minus; }
    else if (diff > 0) { TrendIcon = TrendingUp; }
    else { TrendIcon = TrendingDown; }
  }

  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-2xl border p-3 flex flex-col gap-1.5 text-left transition-all",
        selected
          ? "border-indigo-400/60 bg-indigo-50 dark:bg-indigo-500/[0.08]"
          : "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.09] hover:border-slate-300 dark:hover:border-white/[0.15]",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${config.color}22` }}>
          <Icon size={12} style={{ color: config.color }} />
        </div>
        {TrendIcon && <TrendIcon size={12} className={trendCls} />}
      </div>
      <div>
        <p className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>{config.label}</p>
        {latest ? (
          <p className="text-[13px] font-bold leading-tight" style={{ color: "var(--t-primary)" }}>
            {config.formatValue(latest)}
          </p>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>—</p>
        )}
      </div>
      {latest && (
        <p className="text-[10px]" style={{ color: "var(--t-faint)" }}>{formatDate(latest.recorded_at)}</p>
      )}
    </button>
  );
}

export function BodyMetricsTab() {
  const { data: allMetrics, isLoading } = useBodyMetrics();
  const { mutate: deleteMetric } = useDeleteBodyMetric();

  const [selectedType, setSelectedType] = useState<MetricType>("weight");
  const [period, setPeriod] = useState(30);
  const [showAdd, setShowAdd] = useState(false);
  const [addDefaultType, setAddDefaultType] = useState<MetricType>("weight");

  const byType = useMemo(() => {
    const groups: Record<MetricType, BodyMetric[]> = { weight: [], pressure: [], pulse: [] };
    for (const m of allMetrics ?? []) {
      if (m.metric_type in groups) groups[m.metric_type as MetricType].push(m);
    }
    return groups;
  }, [allMetrics]);

  const config = METRIC_CONFIGS.find((c) => c.type === selectedType)!;
  const allEntries = byType[selectedType];

  const cutoff = period > 0
    ? new Date(Date.now() - period * 86_400_000).toISOString().slice(0, 10)
    : null;
  const filteredEntries = cutoff ? allEntries.filter((e) => e.recorded_at >= cutoff) : allEntries;

  const chartData = useMemo(() => {
    const sorted = [...filteredEntries].reverse();
    if (selectedType === "pressure") {
      return sorted.map((e) => ({ date: formatDate(e.recorded_at), Сист: e.value, Диаст: e.value2 ?? undefined }));
    }
    return sorted.map((e) => ({ date: formatDate(e.recorded_at), value: e.value }));
  }, [filteredEntries, selectedType]);

  const chartSeries =
    selectedType === "pressure"
      ? [
          { key: "Сист",  label: "Систолическое",  color: "#F43F5E" },
          { key: "Диаст", label: "Диастолическое", color: "#FB923C" },
        ]
      : [{ key: "value", label: config.label, color: config.color }];

  return (
    <>
      {showAdd && (
        <AddMetricModal defaultType={addDefaultType} onClose={() => setShowAdd(false)} />
      )}

      <div className="w-full">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>Вес, давление и пульс в одном месте</p>
          <Button
            variant="primary" size="sm" leftIcon={<Plus size={14} />}
            onClick={() => { setAddDefaultType(selectedType); setShowAdd(true); }}
          >
            Добавить
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-20 rounded-2xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {METRIC_CONFIGS.map((mc) => (
                <MetricCard
                  key={mc.type}
                  config={mc}
                  entries={byType[mc.type]}
                  selected={selectedType === mc.type}
                  onClick={() => setSelectedType(mc.type)}
                />
              ))}
            </div>

            {allEntries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <config.Icon size={32} className="text-slate-300 dark:text-white/20" />
                <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>Нет замеров</p>
                <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
                  Нажмите «Добавить», чтобы записать первый показатель
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 mb-3">
                  {PERIODS.map((p) => (
                    <button
                      key={p.days}
                      onClick={() => setPeriod(p.days)}
                      className={clsx(
                        "px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors",
                        period === p.days
                          ? "bg-indigo-500 text-white"
                          : "hover:bg-slate-100 dark:hover:bg-white/[0.08]",
                      )}
                      style={period !== p.days ? { color: "var(--t-muted)" } : undefined}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {chartData.length >= 2 && (
                  <div className="mb-5 rounded-2xl border border-slate-200 dark:border-white/[0.09] p-4 bg-white dark:bg-white/[0.03]">
                    <LineChart
                      data={chartData as Record<string, unknown>[]}
                      xKey="date"
                      series={chartSeries}
                      height={200}
                      mode="area"
                    />
                  </div>
                )}

                {chartData.length === 1 && (
                  <p className="text-[12px] text-center mb-4" style={{ color: "var(--t-faint)" }}>
                    Добавьте ещё один замер, чтобы увидеть график
                  </p>
                )}

                <div className="bg-white dark:bg-white/[0.03] rounded-2xl border border-slate-200 dark:border-white/[0.09] px-4 py-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider py-2" style={{ color: "var(--t-faint)" }}>
                    История
                  </p>
                  {allEntries.slice(0, 30).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-white/[0.05] last:border-0"
                    >
                      <span className="text-[12px] w-20 shrink-0" style={{ color: "var(--t-faint)" }}>
                        {formatDate(entry.recorded_at)}
                      </span>
                      <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
                        {config.formatValue(entry)}
                      </span>
                      {entry.note && (
                        <span className="text-[11px] italic truncate max-w-[100px]" style={{ color: "var(--t-faint)" }}>
                          {entry.note}
                        </span>
                      )}
                      <button
                        onClick={() => deleteMetric(entry.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors shrink-0"
                        style={{ color: "var(--t-faint)" }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
