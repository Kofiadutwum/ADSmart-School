import { Quote } from "lucide-react";
import { CardRail } from "@/components/site/card-rail";
import { Container } from "@/components/ui/container";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { SectionHeading } from "@/components/ui/section-heading";
import type { PlatformTestimonial } from "@/lib/types";

/** Comments from schools, shown only with the person's permission (business tools spec §5.5). */
export function TestimonialsSection({ testimonials }: { testimonials: PlatformTestimonial[] }) {
  if (testimonials.length === 0) return null;
  return (
    <section aria-labelledby="comments-title" className="pb-20 sm:pb-28">
      <Container>
        <SectionHeading id="comments-title" eyebrow="What schools say" title="In their own words" />
        <CardRail label="Comments from schools" className="mt-10">
          {testimonials.slice(0, 3).map((comment) => (
            <figure key={comment.id} className="surface flex h-full flex-col rounded-card p-6 shadow-elev-1">
              <Quote aria-hidden className="size-8 text-indigo/50" />
              <blockquote className="mt-3 flex-1 text-lg">
                <p>{comment.quote}</p>
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                {comment.photo && (
                  <ResponsiveImage image={comment.photo} sizes="48px" className="size-12 rounded-full object-cover" />
                )}
                <span>
                  <span className="block font-semibold">{comment.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {comment.role}
                    {comment.role && comment.school && ", "}
                    {comment.school_url ? (
                      <a href={comment.school_url} className="link">
                        {comment.school}
                      </a>
                    ) : (
                      comment.school
                    )}
                  </span>
                </span>
              </figcaption>
            </figure>
          ))}
        </CardRail>
      </Container>
    </section>
  );
}
