import AnniversarySection from './AnniversarySection'

export default function Memory() {
  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pt-[max(1.25rem,env(safe-area-inset-top))]
                        pb-[calc(env(safe-area-inset-bottom)+112px)]">
      <AnniversarySection />
    </section>
  )
}
