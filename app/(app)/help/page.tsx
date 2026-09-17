"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageContainer } from "../../_components/page-container";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useT } from "@/lib/i18n/provider";
import { FaqPanel } from "./_components/faq-panel";
import { IdeasPanel } from "./_components/ideas-panel";
import { ReviewsPanel } from "./_components/reviews-panel";

// Help & Community.
//
// Three reasons to come here, in the order people have them: something is not
// working or not clear (Help), something is missing (Ideas), or they have an
// opinion of the app (Reviews). The tab lives in the URL so the review prompt,
// the FAQ and a support reply can link straight to the part they mean.

const TABS = ["help", "ideas", "reviews"] as const;
type Tab = (typeof TABS)[number];

function HelpContent() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "help";

  const select = (next: string) => {
    const search = new URLSearchParams(params.toString());
    if (next === "help") search.delete("tab");
    else search.set("tab", next);
    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <div className="mb-6">
        <SlidingTabs
          tabs={[
            { id: "help", label: t("help.tabHelp") },
            { id: "ideas", label: t("help.tabIdeas") },
            { id: "reviews", label: t("help.tabReviews") },
          ]}
          value={tab}
          onValueChange={select}
        />
      </div>
      <div key={tab} className="content-enter">
        {tab === "help" ? <FaqPanel /> : tab === "ideas" ? <IdeasPanel /> : <ReviewsPanel />}
      </div>
    </>
  );
}

export default function HelpPage() {
  const t = useT();
  return (
    <PageContainer maxWidth="max-w-5xl" pattern="grid">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("help.title")}</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("help.subtitle")}</p>
      </header>
      {/* useSearchParams needs a boundary, or the whole route opts out of
          static rendering at build time. */}
      <Suspense fallback={null}>
        <HelpContent />
      </Suspense>
    </PageContainer>
  );
}
