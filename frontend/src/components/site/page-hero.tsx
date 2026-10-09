import { Container } from "@/components/ui/container";

type Props = { title: string; eyebrow?: string; intro?: string };

export function PageHero({ title, eyebrow, intro }: Props) {
  return (
    <section className="bg-brand-mesh on-dark relative overflow-hidden pt-32 pb-16 text-white sm:pt-40 sm:pb-20">
      <Container>
        {eyebrow && (
          <p className="flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
            <span aria-hidden className="h-1 w-6 rounded-full bg-amber" />
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-lg text-white/90">{intro}</p>}
      </Container>
    </section>
  );
}
