// Root / redirects to /preview to show FinanceBlock preview without auth
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/preview");
}
