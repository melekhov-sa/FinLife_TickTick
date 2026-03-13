// Root / is handled by the (app) route group layout+page.
// This file must not exist to avoid routing conflict, but since we can't
// delete files in this toolchain we redirect to /dashboard.
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/dashboard");
}
