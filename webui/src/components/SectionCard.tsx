export function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {icon}
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
