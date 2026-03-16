function PageShell({ eyebrow, title, description, children }) {
  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <section className="mx-auto w-full max-w-4xl rounded-[28px] border border-white/70 bg-white/72 p-6 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] sm:p-8 lg:p-10">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">{description}</p>
        </div>
        <div className="mt-8 rounded-[24px] border border-stone-200/80 bg-white/80 p-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.35)] sm:p-7">
          <div className="space-y-6 text-base leading-8 text-slate-700">{children}</div>
        </div>
      </section>
    </main>
  )
}

export default PageShell
