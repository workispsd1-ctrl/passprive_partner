export function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`skeleton-shimmer rounded-2xl border ${className}`}
      style={{
        backgroundColor: "rgba(119, 31, 168, 0.08)",
        borderColor: "rgba(119, 31, 168, 0.1)",
      }}
    />
  );
}

export function StatsSkeleton({ count = 4 }) {
  return (
    <div className={`grid gap-4 ${count === 3 ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-[28px] border bg-white p-5 shadow-sm"
          style={{ borderColor: "rgba(119, 31, 168, 0.14)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-10 w-36" />
              <SkeletonBlock className="h-3 w-28" />
            </div>
            <SkeletonBlock className="h-12 w-12 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-[30px] border bg-white p-6 shadow-sm" style={{ borderColor: "rgba(119, 31, 168, 0.14)" }}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-3 w-56" />
        </div>
        <SkeletonBlock className="h-11 w-44 rounded-2xl" />
      </div>
      <div className="mt-6">
        <SkeletonBlock className="h-[280px] w-full rounded-[28px]" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 5, titleWidth = "w-40" }) {
  return (
    <div className="rounded-[30px] border bg-white p-6 shadow-sm" style={{ borderColor: "rgba(119, 31, 168, 0.14)" }}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-3">
          <SkeletonBlock className={`h-5 ${titleWidth}`} />
          <SkeletonBlock className="h-3 w-56" />
        </div>
        <SkeletonBlock className="h-10 w-32 rounded-full" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className={`grid gap-3 ${columns === 7 ? "md:grid-cols-7" : columns === 6 ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
            {Array.from({ length: columns }).map((__, colIdx) => (
              <SkeletonBlock key={colIdx} className="h-12 w-full rounded-2xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <SkeletonBlock className="h-11 w-full rounded-2xl" />
      <SkeletonBlock className="h-11 w-full rounded-2xl" />
      <SkeletonBlock className="h-11 w-full rounded-2xl" />
      <SkeletonBlock className="h-11 w-full rounded-2xl" />
    </div>
  );
}

export function DashboardPageSkeleton({ cards = 4, tableRows = 5 }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[30px] border bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between" style={{ borderColor: "rgba(119, 31, 168, 0.14)" }}>
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-9 w-72" />
          <SkeletonBlock className="h-3 w-56" />
        </div>
        <div className="flex gap-3">
          <SkeletonBlock className="h-11 w-36 rounded-full" />
          <SkeletonBlock className="h-11 w-28 rounded-full" />
        </div>
      </div>
      <StatsSkeleton count={cards} />
      <ChartSkeleton />
      <TableSkeleton rows={tableRows} columns={5} />
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border bg-white p-6 shadow-sm" style={{ borderColor: "rgba(119, 31, 168, 0.14)" }}>
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-9 w-64" />
          <SkeletonBlock className="h-3 w-48" />
        </div>
      </div>
      <div className="rounded-[30px] border bg-white p-6 shadow-sm" style={{ borderColor: "rgba(119, 31, 168, 0.14)" }}>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="space-y-3">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
