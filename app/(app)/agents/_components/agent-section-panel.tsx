"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  Delete02Icon,
  ArrowRight01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker, type ModelsResponse } from "@/components/ai-elements/model-picker";
import { CapabilityPicker, type CapabilityOption } from "./capability-picker";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { BRIEF_LANGUAGES } from "@/lib/agent-brief";
import type { AgentBrief, AgentStatus, ChannelId } from "@/lib/types";
import { SECTION_ICONS, type SectionId } from "./agent-sections";
import { ToggleChip } from "@/components/ui/toggle-chip";

// The dock's editing half: one section at a time, at whatever length it needs.
//
// Everything here writes through `onChange`, and the workspace debounces that
// into a single PUT — so there is no Save button anywhere in this file. The
// one exception to "just type" is the prompt, which asks before it lets you
// take it over by hand, because doing so stops the brief from ever rewriting
// it again.

export type AgentDraft = {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly brief: AgentBrief;
  readonly tools: readonly string[];
  readonly model: string | null;
};

export type BusinessContext = {
  readonly name: string;
  readonly description: string;
  readonly knowledgeDocuments: number;
  readonly hasProfile: boolean;
};

export function AgentSectionPanel({
  section,
  agentId,
  status,
  draft,
  onChange,
  capabilities,
  catalog,
  catalogLoading,
  channels,
  assignments,
  onAssignChannel,
  business,
  voiceEnabled,
}: {
  readonly section: SectionId;
  readonly agentId: string;
  readonly status: AgentStatus;
  readonly draft: AgentDraft;
  readonly onChange: (patch: Partial<AgentDraft>) => void;
  readonly capabilities: readonly CapabilityOption[];
  readonly catalog: ModelsResponse | null;
  readonly catalogLoading: boolean;
  readonly channels: readonly ChannelId[];
  readonly assignments: Partial<Record<ChannelId, string>>;
  readonly onAssignChannel: (channel: ChannelId, agentId: string | null) => void;
  readonly business: BusinessContext;
  readonly voiceEnabled: boolean;
}) {
  const t = useT();

  const setBrief = (patch: Partial<AgentBrief>) =>
    onChange({ brief: { ...draft.brief, ...patch, updatedAt: new Date().toISOString() } });

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      {/* The selected node's own header, repeated — same tile, same icon — so
          the dock reads as the continuation of a click rather than as a
          separate screen that happened to change. */}
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <HugeiconsIcon icon={SECTION_ICONS[section]} size={13} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t(`builder.section.${section}`)}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t(`builder.sectionHelp.${section}`)}
          </p>
        </div>
      </div>

      {section === "identity" ? (
        <div className="space-y-4">
          <Field label={t("agents.name")}>
            <Input
              value={draft.name}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder={t("agents.namePlaceholder")}
              autoComplete="off"
              data-1p-ignore="true"
            />
          </Field>
          <Field label={t("agents.description")}>
            <Input
              value={draft.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder={t("agents.descriptionPlaceholder")}
              autoComplete="off"
              data-1p-ignore="true"
            />
          </Field>
        </div>
      ) : null}

      {section === "brief" ? (
        <div className="space-y-4">
          <Field label={t("builder.field.role")} hint={t("builder.hint.role")}>
            <Input
              value={draft.brief.role}
              onChange={(event) => setBrief({ role: event.target.value })}
              placeholder={t("builder.placeholder.role")}
              autoComplete="off"
            />
          </Field>
          <Field label={t("builder.field.goal")} hint={t("builder.hint.goal")}>
            <Textarea
              value={draft.brief.goal}
              onChange={(event) => setBrief({ goal: event.target.value })}
              placeholder={t("builder.placeholder.goal")}
              rows={2}
              className="resize-y text-sm"
            />
          </Field>
          <Field label={t("builder.field.audience")}>
            <Input
              value={draft.brief.audience}
              onChange={(event) => setBrief({ audience: event.target.value })}
              placeholder={t("builder.placeholder.audience")}
              autoComplete="off"
            />
          </Field>
          <Field label={t("builder.field.tone")}>
            <Input
              value={draft.brief.tone}
              onChange={(event) => setBrief({ tone: event.target.value })}
              placeholder={t("builder.placeholder.tone")}
              autoComplete="off"
            />
          </Field>
          <Field label={t("builder.field.language")} hint={t("builder.hint.language")}>
            <div className="flex flex-wrap gap-1.5">
              {BRIEF_LANGUAGES.map((code) => (
                <ToggleChip
                  key={code}
                  selected={draft.brief.language === code}
                  onClick={() => setBrief({ language: code })}
                >
                  {t(`builder.language.${code}`)}
                </ToggleChip>
              ))}
            </div>
          </Field>
          <Field label={t("builder.field.greeting")} hint={t("builder.hint.greeting")}>
            <Textarea
              value={draft.brief.greeting}
              onChange={(event) => setBrief({ greeting: event.target.value })}
              placeholder={t("builder.placeholder.greeting")}
              rows={2}
              className="resize-y text-sm"
            />
          </Field>
        </div>
      ) : null}

      {section === "rules" ? (
        <div className="space-y-5">
          <ListEditor
            label={t("builder.field.rules")}
            hint={t("builder.hint.rules")}
            placeholder={t("builder.placeholder.rules")}
            items={draft.brief.rules}
            onChange={(rules) => setBrief({ rules })}
          />
          <ListEditor
            label={t("builder.field.avoid")}
            hint={t("builder.hint.avoid")}
            placeholder={t("builder.placeholder.avoid")}
            items={draft.brief.avoid}
            onChange={(avoid) => setBrief({ avoid })}
            tone="destructive"
          />
          <Field label={t("builder.field.handoff")} hint={t("builder.hint.handoff")}>
            <Textarea
              value={draft.brief.handoff}
              onChange={(event) => setBrief({ handoff: event.target.value })}
              placeholder={t("builder.placeholder.handoff")}
              rows={3}
              className="resize-y text-sm"
            />
          </Field>
        </div>
      ) : null}

      {section === "prompt" ? (
        <PromptSection
          draft={draft}
          onChange={onChange}
          onDetach={() =>
            onChange({ brief: { ...draft.brief, promptCustomized: true } })
          }
          onReattach={() =>
            onChange({ brief: { ...draft.brief, promptCustomized: false } })
          }
        />
      ) : null}

      {section === "capabilities" ? (
        <div className="space-y-3">
          <CapabilityPicker
            options={capabilities}
            value={draft.tools as string[]}
            onChange={(tools) => onChange({ tools })}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("builder.capabilitiesNote")}
          </p>
        </div>
      ) : null}

      {section === "channels" ? (
        <div className="space-y-3">
          {status !== "active" ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {t("builder.channelsNeedActive")}
            </p>
          ) : null}
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("builder.channelsNone")}</p>
          ) : (
            <ul className="space-y-2">
              {channels.map((channel) => {
                const mine = assignments[channel] === agentId;
                const takenBySomeoneElse = Boolean(assignments[channel]) && !mine;
                return (
                  <li
                    key={channel}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium capitalize">{channel}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {mine
                          ? t("builder.channelMine")
                          : takenBySomeoneElse
                            ? t("builder.channelOther")
                            : t("builder.channelFree")}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant={mine ? "outline" : "default"}
                      disabled={status !== "active" && !mine}
                      onClick={() => onAssignChannel(channel, mine ? null : agentId)}
                    >
                      {mine ? t("builder.channelUnassign") : t("builder.channelAssign")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {section === "model" ? (
        <div className="space-y-3">
          <ModelPicker
            models={catalog?.models ?? []}
            value={draft.model}
            onChange={(model) => onChange({ model })}
            autoLabel={catalog?.tasks?.chat}
            loading={catalogLoading}
            size="md"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t("agents.modelHelp")}</p>
        </div>
      ) : null}

      {section === "voice" ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {voiceEnabled ? t("builder.voiceOn") : t("builder.voiceOff")}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/agents/${agentId}/voice`}>
              {t("builder.voiceOpen")}
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.75} />
            </Link>
          </Button>
        </div>
      ) : null}

      {section === "business" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium">{business.name || t("builder.businessUnnamed")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {business.description || t("builder.businessNoDescription")}
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            {t("builder.businessNote")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("builder.businessKnowledge", { count: business.knowledgeDocuments })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/setup">{t("builder.businessEdit")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/knowledge">{t("builder.businessKnowledgeOpen")}</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span> : null}
      {children}
    </label>
  );
}

/**
 * A short list of one-line rules. Typed one per row rather than as a textarea
 * because the composed prompt renders them as bullets, and a textarea makes
 * "one rule" and "one paragraph" look like the same thing.
 */
function ListEditor({
  label,
  hint,
  placeholder,
  items,
  onChange,
  tone = "default",
}: {
  readonly label: string;
  readonly hint?: string;
  readonly placeholder: string;
  readonly items: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly tone?: "default" | "destructive";
}) {
  const t = useT();
  const [value, setValue] = useState("");

  const add = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setValue("");
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li
            key={`${index}-${item}`}
            className={cn(
              "group flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed",
              tone === "destructive"
                ? "border-destructive/20 bg-destructive/5"
                : "border-border bg-card",
            )}
          >
            <span className="min-w-0 flex-1">{item}</span>
            <button
              type="button"
              aria-label={t("common.delete")}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
          autoComplete="off"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!value.trim()}>
          <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}

/**
 * The composed prompt, read-only until someone says they want it.
 *
 * Editing it is a one-way door for the brief — from then on the fields above
 * stop rewriting this text — so it is a decision, not a keystroke, and the
 * panel says which mode it is in either way.
 */
function PromptSection({
  draft,
  onChange,
  onDetach,
  onReattach,
}: {
  readonly draft: AgentDraft;
  readonly onChange: (patch: Partial<AgentDraft>) => void;
  readonly onDetach: () => void;
  readonly onReattach: () => void;
}) {
  const t = useT();
  const custom = draft.brief.promptCustomized === true;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {custom ? t("builder.promptCustom") : t("builder.promptComposed")}
        </span>
        <Button size="sm" variant="ghost" onClick={custom ? onReattach : onDetach}>
          {custom ? t("builder.promptRecompose") : t("builder.promptEdit")}
        </Button>
      </div>
      {custom ? (
        <Textarea
          value={draft.systemPrompt}
          onChange={(event) => onChange({ systemPrompt: event.target.value })}
          rows={18}
          className="resize-y font-mono text-[11px] leading-relaxed"
        />
      ) : (
        <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-[11px] leading-relaxed">
          {draft.systemPrompt || t("builder.promptEmpty")}
        </pre>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {custom ? t("builder.promptCustomHint") : t("builder.promptComposedHint")}
      </p>
    </div>
  );
}
