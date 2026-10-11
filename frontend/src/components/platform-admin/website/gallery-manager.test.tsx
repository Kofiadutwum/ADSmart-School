import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { bodyOf, mockApi } from "@/test/http";
import { PHOTO } from "./fixtures";
import { GalleryManager } from "./gallery-manager";

const URL = "/api/platform/website/gallery";
const file = () => new File(["png"], "pupils.png", { type: "image/png" });

describe("GalleryManager", () => {
  it("uploads a photo of people only with permission", async () => {
    const fetchMock = mockApi([["GET", URL, 200, []], ["POST", URL, 201, PHOTO]]);
    const user = userEvent.setup();
    render(<GalleryManager />);
    await user.upload(await screen.findByLabelText(/^photo/i), file());
    await user.type(screen.getByLabelText(/^description/i), "Pupils reading");
    await user.click(screen.getByRole("checkbox", { name: /shows people/i }));
    await user.click(screen.getByRole("button", { name: "Add photo" }));
    expect(await screen.findByText(/tick that you have permission/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("checkbox", { name: /i have permission/i }));
    await user.click(screen.getByRole("button", { name: "Add photo" }));
    expect(await screen.findByRole("img", { name: "Pupils reading" })).toBeInTheDocument();
    const form = fetchMock.mock.calls[1][1]?.body as FormData;
    expect(form.get("alt_text")).toBe("Pupils reading");
    expect(form.get("shows_people")).toBe("true");
    expect(form.get("people_permission")).toBe("true");
  });

  it("hides and reorders photos", async () => {
    const second = { ...PHOTO, id: 2, alt_text: "Our library", image: { ...PHOTO.image!, alt: "Our library" } };
    const fetchMock = mockApi([
      ["GET", URL, 200, [PHOTO, second]],
      ["PATCH", `${URL}/1`, 200, { ...PHOTO, visible: false }],
      ["POST", `${URL}/order`, 200, [second, { ...PHOTO, visible: false }]],
    ]);
    const user = userEvent.setup();
    render(<GalleryManager />);
    const first = await screen.findByRole("article", { name: "Pupils reading" });
    await user.click(within(first).getByRole("button", { name: "Hide" }));
    expect(await within(first).findByText("Hidden")).toBeInTheDocument();
    await user.click(within(first).getByRole("button", { name: "Move Pupils reading down" }));
    expect(bodyOf(fetchMock, "PATCH", `${URL}/1`)).toEqual({ visible: false });
    expect(bodyOf(fetchMock, "POST", `${URL}/order`)).toEqual({ ids: [2, 1] });
  });
});
