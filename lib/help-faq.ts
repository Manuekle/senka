// The questions Help & Community answers before anyone has to ask.
//
// Structure only: the wording lives in the dictionaries under
// `help.faq.<id>.q` and `help.faq.<id>.a`, so the answers switch language with
// the rest of the app. Each answer points at the page where the thing is done,
// because "go to Conocimiento" is only half an answer without the link.
//
// Every answer here describes what the app does today. When a page changes,
// its entry changes with it — a wrong FAQ is worse than a missing one.

export const FAQ_CATEGORIES = ["start", "agents", "channels", "crm", "billing", "community"] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export type FaqItem = {
  readonly id: string;
  readonly category: FaqCategory;
  /** Where the answer is acted on. `labelKey` is that page's nav label. */
  readonly link?: { readonly href: string; readonly labelKey: string };
};

export const FAQ_ITEMS: readonly FaqItem[] = [
  { id: "firstSteps", category: "start", link: { href: "/agents", labelKey: "nav.agents" } },
  { id: "tryAgent", category: "start", link: { href: "/chat", labelKey: "nav.chat" } },
  { id: "knowledge", category: "agents", link: { href: "/knowledge", labelKey: "nav.knowledge" } },
  { id: "skills", category: "agents", link: { href: "/skills", labelKey: "nav.skills" } },
  { id: "handoff", category: "agents", link: { href: "/inbox", labelKey: "nav.inbox" } },
  { id: "whatsapp", category: "channels", link: { href: "/connections", labelKey: "nav.connections" } },
  { id: "instagram", category: "channels", link: { href: "/connections", labelKey: "nav.connections" } },
  { id: "numbers", category: "channels", link: { href: "/numbers", labelKey: "nav.numbers" } },
  { id: "importContacts", category: "crm", link: { href: "/crm/import", labelKey: "nav.crm" } },
  { id: "forms", category: "crm", link: { href: "/forms", labelKey: "nav.forms" } },
  { id: "credits", category: "billing", link: { href: "/account/billing", labelKey: "billing.title" } },
  { id: "workspaces", category: "billing" },
  { id: "password", category: "billing", link: { href: "/account", labelKey: "nav.account" } },
  { id: "ideas", category: "community" },
  { id: "reviews", category: "community" },
];

/** Accent- and case-insensitive, so "configuracion" finds "Configuración". */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Every word of the query has to appear somewhere in the question or the
 *  answer, in any order — a phrase match would miss "contraseña cambio"
 *  against "¿Cómo cambio mi contraseña?". */
export function faqMatches(query: string, question: string, answer: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeForSearch(`${question} ${answer}`);
  return words.every((word) => haystack.includes(word));
}
