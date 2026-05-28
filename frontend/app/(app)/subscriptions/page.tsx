import { redirect } from "next/navigation";

export default function SubscriptionsRedirect() {
  redirect("/trackers?tab=subscriptions");
}
