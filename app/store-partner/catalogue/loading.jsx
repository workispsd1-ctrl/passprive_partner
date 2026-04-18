import { SkeletonBlock } from "@/components/ui/PageSkeletons";

function CatalogueLoadingCard({ children }) {
  return <div className="rounded-3xl border border-gray-200 bg-white shadow-sm"><div className="p-6">{children}</div></div>;
}

export default function StoreCatalogueLoading() {
  return (
    <div className="min-h-screen" style={{ fontFamily: '"Space Grotesk", "Sora", sans-serif' }}>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-4">
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
            <div className="space-y-3">
              <SkeletonBlock className="h-6 w-40 border-gray-200 bg-gray-100" />
              <SkeletonBlock className="h-4 w-96 max-w-full border-gray-200 bg-gray-100" />
            </div>
            <SkeletonBlock className="h-10 w-28 rounded-full border-gray-200 bg-gray-100" />
          </div>
          <div className="p-6">
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                  <SkeletonBlock className="h-4 w-24 border-gray-200 bg-gray-100" />
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
                <SkeletonBlock className="h-4 w-44 border-gray-200 bg-gray-100" />
                <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <CatalogueLoadingCard>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="space-y-3">
                  <SkeletonBlock className="h-4 w-28 border-gray-200 bg-gray-100" />
                  <SkeletonBlock className="h-11 w-full rounded-2xl border-gray-200 bg-gray-100" />
                </div>
              ))}
              <SkeletonBlock className="h-28 w-full rounded-2xl border-gray-200 bg-gray-100" />
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4">
                    <SkeletonBlock className="h-5 w-32 border-gray-200 bg-gray-100" />
                    <SkeletonBlock className="mt-3 h-4 w-full border-gray-200 bg-gray-100" />
                  </div>
                ))}
              </div>
              <SkeletonBlock className="h-11 w-44 rounded-full border-gray-200 bg-gray-100" />
            </div>
          </CatalogueLoadingCard>

          <CatalogueLoadingCard>
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div key={idx} className="rounded-3xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <SkeletonBlock className="h-6 w-40 border-gray-200 bg-gray-100" />
                      <div className="flex gap-2">
                        <SkeletonBlock className="h-6 w-24 rounded-full border-gray-200 bg-gray-100" />
                        <SkeletonBlock className="h-6 w-32 rounded-full border-gray-200 bg-gray-100" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />
                      <SkeletonBlock className="h-9 w-24 rounded-full border-gray-200 bg-gray-100" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {Array.from({ length: 2 }).map((__, itemIdx) => (
                      <div key={itemIdx} className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[84px_1fr]">
                        <SkeletonBlock className="h-20 w-full rounded-2xl border-gray-200 bg-white" />
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <SkeletonBlock className="h-5 w-36 border-gray-200 bg-gray-100" />
                            <SkeletonBlock className="h-6 w-20 rounded-full border-gray-200 bg-gray-100" />
                          </div>
                          <SkeletonBlock className="h-4 w-full border-gray-200 bg-gray-100" />
                          <SkeletonBlock className="h-4 w-3/4 border-gray-200 bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CatalogueLoadingCard>
        </div>
      </div>
    </div>
  );
}
