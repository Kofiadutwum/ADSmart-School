import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { photo } from "@/test/site-fixture";
import { Gallery } from "./gallery";
import { Lightbox } from "./lightbox";

const photos = [photo(1), photo(2), photo(3)];

describe("Gallery", () => {
  it("opens the photo viewer and closes it with the close button", async () => {
    const user = userEvent.setup();
    render(<Gallery photos={photos} />);

    await user.click(screen.getByRole("button", { name: "Open photo: Caption 2" }));
    expect(screen.getByRole("dialog", { name: "Photo viewer" })).toBeInTheDocument();
    expect(screen.getByText("Photo 2 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Lightbox", () => {
  it("closes when swiped down", () => {
    const onClose = vi.fn();
    render(<Lightbox photos={photos} index={0} onClose={onClose} />);
    const surface = screen.getByTestId("lightbox-swipe");

    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 205, clientY: 260 });
    fireEvent.pointerUp(surface, { clientX: 205, clientY: 260 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores sideways drags", () => {
    const onClose = vi.fn();
    render(<Lightbox photos={photos} index={0} onClose={onClose} />);
    const surface = screen.getByTestId("lightbox-swipe");

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 160 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 160 });

    expect(onClose).not.toHaveBeenCalled();
  });
});
