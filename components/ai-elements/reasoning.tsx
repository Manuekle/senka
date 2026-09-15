"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Brain02Icon, ChevronDownIcon } from "@hugeicons/core-free-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";

import { ThinkingText } from "@/components/motion/thinking-text";
import { Orb } from "@/components/ui/orb";
import { useT } from "@/lib/i18n/provider";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    // Track when streaming starts and compute duration
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    // Auto-open when streaming starts (unless explicitly closed)
    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen],
    );

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn("not-prose mb-4 w-full", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

/** Built from the dictionary so the trigger follows the language toggle.
 *  A caller passing `getThinkingMessage` owns its own wording. */
function useDefaultThinkingMessage() {
  const t = useT();
  // Not a component — a hook returning the render function the trigger calls
  // with its own arguments. The lint rule sees "returns JSX" and asks for a
  // displayName that would never appear anywhere.
  // eslint-disable-next-line react/display-name
  return (isStreaming: boolean, duration?: number) => {
    if (isStreaming || duration === 0) {
      return (
        <span className="flex items-center gap-2">
          <Orb state="solving" />
          <ThinkingText
            states={[
              t("chat.thinking"),
              t("chat.analyzing"),
              t("chat.reasoning"),
              t("chat.processing"),
            ]}
          />
        </span>
      );
    }
    if (duration === undefined) {
      return <p>{t("chat.thoughtBriefly")}</p>;
    }
    return <p>{t("chat.thoughtFor", { duration })}</p>;
  };
}

export const ReasoningTrigger = memo(
  ({ className, children, getThinkingMessage, ...props }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();
    const defaultThinkingMessage = useDefaultThinkingMessage();
    const thinkingMessage = getThinkingMessage ?? defaultThinkingMessage;

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <HugeiconsIcon icon={Brain02Icon} size={16} strokeWidth={1.75} />
            {thinkingMessage(isStreaming, duration)}
            <HugeiconsIcon icon={ChevronDownIcon} size={16} strokeWidth={1.75} className={cn("transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

const streamdownPlugins = { cjk, code, math, mermaid };

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => {
  const { isStreaming } = useReasoning();

  return (
    <CollapsibleContent
      className={cn(
        "mt-4 text-sm",
        "text-muted-foreground outline-none",
        // Reasoning stream viewport while streaming: scrollable box with
        // masked top/bottom edge fades so new content scrolls into view.
        isStreaming && "t-reason",
        className,
      )}
      {...props}
    >
      {isStreaming ? (
        <div className="t-reason-viewport">
          <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
        </div>
      ) : (
        <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
      )}
    </CollapsibleContent>
  );
});

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
