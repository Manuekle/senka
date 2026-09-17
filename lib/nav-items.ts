import type { IconSvgElement } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  DocumentAttachmentIcon,
  ZapIcon,
  Settings01Icon,
  ChatSpark01Icon,
  InboxIcon,
  Timer01Icon,
  Calendar03Icon,
  MetaIcon,
  AiImagineIcon,
  LibraryIcon,
  FilterHorizontalIcon,
  FileEditIcon,
  Mail02Icon,
  UserCircleIcon,
  Blockchain05Icon,
  TelevisionTableIcon,
  PiggyBankIcon,
  SeoIcon,
  SmartPhone01Icon,
  GlobalEducationIcon,
  BulbChargingIcon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons";

export type NavItem = {
  readonly href: string;
  readonly labelKey: string;
  readonly icon: IconSvgElement;
};

export type NavGroup = {
  readonly id: string;
  /** Omitted for the first group: a heading over the two entry points would be
   *  a label on the obvious. */
  readonly labelKey?: string;
  readonly items: readonly NavItem[];
};

/**
 * The sidebar's navigation, grouped by what you're doing rather than listed
 * flat. Nine equal-weight rows read as a pile; four short groups read as a
 * map. Shared with the command palette so the two can never disagree.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "main",
    items: [
      { href: "/chat", labelKey: "nav.chat", icon: ChatSpark01Icon },
      { href: "/dashboard", labelKey: "nav.dashboard", icon: DashboardSquare01Icon },
    ],
  },
  {
    id: "conversations",
    labelKey: "nav.groupConversations",
    items: [
      { href: "/history", labelKey: "nav.chats", icon: DocumentAttachmentIcon },
      { href: "/inbox", labelKey: "nav.inbox", icon: InboxIcon },
    ],
  },
  {
    id: "crm",
    labelKey: "nav.groupCrm",
    items: [
      { href: "/crm", labelKey: "nav.crm", icon: TelevisionTableIcon },
      { href: "/pipeline", labelKey: "nav.pipeline", icon: PiggyBankIcon },
      { href: "/forms", labelKey: "nav.forms", icon: FileEditIcon },
    ],
  },
  {
    id: "automation",
    labelKey: "nav.groupAutomation",
    items: [
      { href: "/automations", labelKey: "nav.automations", icon: ZapIcon },
      { href: "/calendar", labelKey: "nav.calendar", icon: Calendar03Icon },
      { href: "/agents", labelKey: "nav.agents", icon: AiImagineIcon },
      // Next to the agents on purpose: the only question this page answers is
      // which agent holds which line.
      { href: "/numbers", labelKey: "nav.numbers", icon: SmartPhone01Icon },
      { href: "/email-templates", labelKey: "nav.emailTemplates", icon: Mail02Icon },
      { href: "/reminders", labelKey: "nav.reminders", icon: Timer01Icon },
      { href: "/ads", labelKey: "nav.ads", icon: MetaIcon },
      { href: "/seo", labelKey: "nav.seo", icon: SeoIcon },
    ],
  },
  {
    id: "knowledge",
    labelKey: "nav.groupKnowledge",
    items: [
      { href: "/knowledge", labelKey: "nav.knowledge", icon: LibraryIcon },
      // A document is consulted, a skill is followed — two different things
      // that both live in what the business "knows", so they group together.
      { href: "/skills", labelKey: "nav.skills", icon: GlobalEducationIcon },
    ],
  },
  {
    id: "system",
    labelKey: "nav.groupSystem",
    items: [
      { href: "/account", labelKey: "nav.account", icon: UserCircleIcon },
      { href: "/connections", labelKey: "nav.connections", icon: Blockchain05Icon },
      { href: "/runtime", labelKey: "nav.runtime", icon: BulbChargingIcon },
      { href: "/settings", labelKey: "nav.settings", icon: Settings01Icon },
      { href: "/setup", labelKey: "nav.setup", icon: FilterHorizontalIcon },
      // Last: where you go when the rest of the list did not answer it.
      { href: "/help", labelKey: "nav.help", icon: HelpCircleIcon },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
