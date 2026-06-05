export default function PlatformLoading() {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5" aria-busy="true">
        <div className="p-1">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-28 rounded-md bg-slate-200" />
            <div className="h-8 w-64 max-w-full rounded-md bg-slate-300" />
            <div className="h-4 w-full max-w-2xl rounded-md bg-slate-200" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="min-h-24 rounded-md border border-slate-200 bg-slate-50 p-4"
              >
                <div className="h-3 w-20 rounded-md bg-slate-200" />
                <div className="mt-4 h-6 w-16 rounded-md bg-slate-300" />
                <div className="mt-3 h-3 w-32 rounded-md bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
            <div className="h-4 w-48 rounded-md bg-slate-300" />
            <div className="mt-5 grid gap-3">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-10 rounded-md bg-slate-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
