"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { DocumentsTab } from "@/components/trackers/DocumentsTab";
import { MaintenanceTab } from "@/components/trackers/MaintenanceTab";
import { SubscriptionsTab } from "@/components/trackers/SubscriptionsTab";
import { BodyMetricsTab } from "@/components/trackers/BodyMetricsTab";

const TRACKER_TABS = [
  { id: "documents",    label: "Документы" },
  { id: "maintenance",  label: "Обслуживание" },
  { id: "subscriptions", label: "Подписки" },
  { id: "body",         label: "Метрики тела" },
];

function TrackersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "documents";

  function handleTabChange(id: string) {
    router.replace(`/trackers?tab=${id}`);
  }

  return (
    <>
      <PageHeader
        title="Трекеры"
        sticky
        tabs={
          <Tabs
            items={TRACKER_TABS}
            active={tab}
            onChange={handleTabChange}
          />
        }
      />
      <main className="flex-1 p-3 md:p-6">
        {tab === "documents"     && <DocumentsTab />}
        {tab === "maintenance"   && <MaintenanceTab />}
        {tab === "subscriptions" && <SubscriptionsTab />}
        {tab === "body"          && <BodyMetricsTab />}
      </main>
    </>
  );
}

export default function TrackersPage() {
  return (
    <Suspense>
      <TrackersContent />
    </Suspense>
  );
}
