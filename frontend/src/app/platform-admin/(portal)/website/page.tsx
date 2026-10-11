import { redirect } from "next/navigation";

export default function WebsiteHome() {
  redirect("/website/articles");
}
