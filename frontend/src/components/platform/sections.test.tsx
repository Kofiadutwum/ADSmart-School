import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ArticlesSection } from "./articles-section";
import { FaqSection } from "./faq-section";
import { ARTICLES, COMMENTS, FAQS, PHOTOS } from "./fixtures";
import { PhotoGrid } from "./photo-grid";
import { TestimonialsSection } from "./testimonials-section";

describe("the platform website's sections", () => {
  it("shows nothing at all when a section has nothing published", () => {
    const { container } = render(
      <>
        <PhotoGrid photos={[]} />
        <TestimonialsSection testimonials={[]} />
        <ArticlesSection articles={[]} />
        <FaqSection faqs={[]} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens gallery photos large, moves between them and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<PhotoGrid photos={PHOTOS} />);
    await user.click(screen.getByRole("button", { name: "Open photo: Reading hour" }));
    const dialog = screen.getByRole("dialog", { name: "Reading hour" });
    expect(within(dialog).getByRole("img", { name: "Pupils reading" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Next photo" }));
    expect(screen.getByRole("dialog", { name: "Photo 2 of 2" })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: "Reading hour" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows comments from schools with a link to the school's website", () => {
    render(<TestimonialsSection testimonials={COMMENTS} />);
    expect(screen.getByText("Parents find us easily now.").closest("blockquote")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Hope Academy" })).toHaveAttribute("href", "https://hope.example");
  });

  it("links the latest articles and all articles", () => {
    render(<ArticlesSection articles={ARTICLES} />);
    expect(screen.getByRole("link", { name: /Collect fees on time, kindly/ })).toHaveAttribute(
      "href", "/articles/collect-fees-on-time-kindly",
    );
    expect(screen.getByText("3 min read")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All articles and tips" })).toHaveAttribute("href", "/articles");
  });

  it("answers questions in place and describes them for search engines", async () => {
    const user = userEvent.setup();
    const { container } = render(<FaqSection faqs={FAQS} />);
    await user.click(screen.getByText("How long does setup take?"));
    expect(screen.getByText("a week").tagName).toBe("STRONG");
    const data = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity[0].acceptedAnswer.text).toBe("About a week.");
  });
});
