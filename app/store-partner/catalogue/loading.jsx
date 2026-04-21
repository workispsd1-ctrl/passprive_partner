import { SkeletonBlock } from "@/components/ui/PageSkeletons";

function CatalogueLoadingCard({ titleWidth = "w-40", children }) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <SkeletonBlock className={`h-5 ${titleWidth} border-gray-200 bg-gray-100`} />
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <div className="space-y-3">
          <SkeletonBlock className="h-6 w-44 border-gray-200 bg-gray-100" />
          <SkeletonBlock className="h-4 w-[520px] max-w-full border-gray-200 bg-gray-100" />
        </div>
        <SkeletonBlock className="h-10 w-28 rounded-full border-gray-200 bg-gray-100" />
      </div>
      <div className="p-6 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
            <SkeletonBlock className="h-4 w-28 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="mt-4 h-11 w-full rounded-2xl border-gray-200 bg-white" />
          </div>
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-4">
              <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
              <SkeletonBlock className="mt-4 h-7 w-28 border-gray-200 bg-gray-100" />
              <SkeletonBlock className="mt-3 h-4 w-36 border-gray-200 bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <SkeletonBlock className="h-4 w-52 border-gray-200 bg-gray-100" />
          <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function CategoryManagerSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div key={idx} className="space-y-3">
          <SkeletonBlock className="h-4 w-32 border-gray-200 bg-gray-100" />
          <SkeletonBlock className="h-11 w-full rounded-2xl border-gray-200 bg-gray-100" />
        </div>
      ))}
      <SkeletonBlock className="h-14 w-full rounded-2xl border-gray-200 bg-gray-100" />
      <SkeletonBlock className="h-11 w-44 rounded-full border-gray-200 bg-gray-100" />
    </div>
  );
}

function ItemFormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="space-y-3">
            <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="h-11 w-full rounded-2xl border-gray-200 bg-gray-100" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="h-28 w-full rounded-2xl border-gray-200 bg-gray-100" />
      <div className="grid gap-3 md:grid-cols-2">
        <SkeletonBlock className="h-14 w-full rounded-2xl border-gray-200 bg-gray-100" />
        <SkeletonBlock className="h-14 w-full rounded-2xl border-gray-200 bg-gray-100" />
      </div>
      <SkeletonBlock className="h-11 w-44 rounded-full border-gray-200 bg-gray-100" />
    </div>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="space-y-3">
            <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
            <SkeletonBlock className="h-11 w-full rounded-2xl border-gray-200 bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
        <SkeletonBlock className="h-5 w-28 border-gray-200 bg-gray-100" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4">
              <SkeletonBlock className="h-5 w-32 border-gray-200 bg-gray-100" />
              <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonBlock className="h-11 w-52 rounded-full border-gray-200 bg-gray-100" />
    </div>
  );
}

function StructureSkeleton({ compact = false }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, idx) => (
        <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <SkeletonBlock className="h-6 w-40 border-gray-200 bg-gray-100" />
              <div className="flex gap-2">
                <SkeletonBlock className="h-6 w-24 rounded-full border-gray-200 bg-gray-100" />
                <SkeletonBlock className="h-6 w-28 rounded-full border-gray-200 bg-gray-100" />
              </div>
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-20 rounded-full border-gray-200 bg-gray-100" />
              <SkeletonBlock className="h-9 w-20 rounded-full border-gray-200 bg-gray-100" />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {Array.from({ length: compact ? 3 : 2 }).map((__, itemIdx) => (
              <div
                key={itemIdx}
                className={`grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 ${
                  compact ? "md:grid-cols-[84px_1fr]" : "md:grid-cols-[96px_1fr_auto]"
                }`}
              >
                <SkeletonBlock className={`${compact ? "h-20" : "h-24"} w-full rounded-2xl border-gray-200 bg-white`} />
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <SkeletonBlock className="h-5 w-36 border-gray-200 bg-gray-100" />
                    <SkeletonBlock className="h-6 w-20 rounded-full border-gray-200 bg-gray-100" />
                  </div>
                  <SkeletonBlock className="h-4 w-full border-gray-200 bg-gray-100" />
                  <SkeletonBlock className="h-4 w-3/4 border-gray-200 bg-gray-100" />
                </div>
                {compact ? null : <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StoreCatalogueLoading() {
  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-4">
        <HeroSkeleton />

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <CatalogueLoadingCard titleWidth="w-44">
            <CategoryManagerSkeleton />
          </CatalogueLoadingCard>

          <CatalogueLoadingCard titleWidth="w-36">
            <ItemFormSkeleton />
          </CatalogueLoadingCard>
        </div>

        <CatalogueLoadingCard titleWidth="w-56">
          <ScheduleSkeleton />
        </CatalogueLoadingCard>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <CatalogueLoadingCard titleWidth="w-48">
            <StructureSkeleton />
          </CatalogueLoadingCard>

          <CatalogueLoadingCard titleWidth="w-36">
            <StructureSkeleton compact />
          </CatalogueLoadingCard>
        </div>
      </div>
    </div>
  );
}
