"use client";

/* ElevenLabs UI registry component (ui.elevenlabs.io/r/conversation-bar.json),
 * vendored under `components/elevenlabs/` — see the note in `orb.tsx` for why
 * these do not live in `components/ui/`.
 *
 * Five edits against upstream:
 *   - `<Card>` is a plain div. The registry expects shadcn's `card`, which this
 *     project never installed; `app/_components/dashboard-card.tsx` already
 *     owns the name `Card`, and a second one under a near-identical import path
 *     is how the wrong card gets imported six months from now.
 *   - The idle placeholder was the literal string "Customer Support". It is a
 *     `label` prop, so the bar can say which agent is on the other end.
 *   - `getConversationToken` was added. Upstream only ever calls
 *     `startSession({ agentId })`, which the WebRTC transport accepts for
 *     public agents only; an agent created through the API is private, and
 *     needs a short-lived token minted server-side instead.
 *   - The four icon-only controls (mute, keyboard, call, send) had no
 *     accessible name at all upstream. Each now has an `aria-label` and a
 *     `Tooltip` from the project's own tooltip primitive.
 *   - The microphone pre-flight stream is now released on every way a call can
 *     end, not just the end-call button. See `stopMicStream` below.
 */

import * as React from "react"
import {
  useConversationControls,
  useConversationInput,
  useConversationStatus,
} from "@elevenlabs/react"
import {
  ArrowUpIcon,
  ChevronDown,
  Keyboard,
  Mic,
  MicOff,
  PhoneIcon,
} from "lucide-react"
import { HugeiconsIcon } from "@/components/icons/icon"
import { CallDisabled02Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LiveWaveform } from "./live-waveform"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface ConversationBarProps {
  /**
   * ElevenLabs Agent ID to connect to. Used only for public agents — a private
   * agent connects through `getConversationToken` instead.
   */
  agentId?: string

  /**
   * Mints a WebRTC conversation token server-side (see
   * `/api/agents/[id]/voice/token`). Required for private agents, which is
   * every agent this app creates.
   */
  getConversationToken?: () => Promise<string>

  /**
   * Custom className for the container
   */
  className?: string

  /**
   * Custom className for the waveform
   */
  waveformClassName?: string

  /**
   * Callback when user sends a message
   */
  onSendMessage?: (message: string) => void

  /**
   * Shown in place of the waveform while disconnected. Name the agent here —
   * upstream hardcoded "Customer Support".
   */
  label?: string

  /**
   * Called when starting the call fails. Upstream only logged to the console,
   * so a denied microphone prompt left the bar sitting on "idle" with nothing
   * on screen explaining why the call never started.
   */
  onStartError?: (error: unknown) => void
}

export const ConversationBar = React.forwardRef<
  HTMLDivElement,
  ConversationBarProps
>((
  { agentId, getConversationToken, className, waveformClassName, onSendMessage, onStartError },
  ref
) => {
  const { status } = useConversationStatus()
  const { startSession, endSession, sendUserMessage, sendContextualUpdate } =
    useConversationControls()
  const { isMuted, setMuted } = useConversationInput()
  const [keyboardOpen, setKeyboardOpen] = React.useState(false)
  const [textInput, setTextInput] = React.useState("")
  const mediaStreamRef = React.useRef<MediaStream | null>(null)

  const isConnected = status === "connected"

  const getMicStream = React.useCallback(async () => {
    if (mediaStreamRef.current) return mediaStreamRef.current

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaStreamRef.current = stream

    return stream
  }, [])

  const stopMicStream = React.useCallback(() => {
    const stream = mediaStreamRef.current
    if (!stream) return
    // Null the ref first: a second call while the tracks are stopping must not
    // hand the same dead stream back out of `getMicStream`.
    mediaStreamRef.current = null
    stream.getTracks().forEach((t) => t.stop())
  }, [])

  const startConversation = React.useCallback(async () => {
    try {
      await getMicStream()

      if (getConversationToken) {
        const conversationToken = await getConversationToken()
        startSession({ conversationToken, connectionType: "webrtc" })
        return
      }
      if (!agentId) throw new Error("No agentId and no getConversationToken")
      startSession({ agentId, connectionType: "webrtc" })
    } catch (error) {
      // The status never left "disconnected", so the effect below will not
      // fire on this path — release the stream here.
      stopMicStream()
      console.error("Error starting conversation:", error)
      onStartError?.(error)
    }
  }, [getMicStream, stopMicStream, agentId, getConversationToken, startSession, onStartError])

  const handleEndSession = React.useCallback(() => {
    endSession()
    stopMicStream()
  }, [endSession, stopMicStream])

  const toggleMute = React.useCallback(() => {
    setMuted(!isMuted)
  }, [isMuted, setMuted])

  const handleStartOrEnd = React.useCallback(() => {
    if (status === "connected" || status === "connecting") {
      handleEndSession()
    } else if (status === "disconnected" || status === "error") {
      startConversation()
    }
  }, [status, handleEndSession, startConversation])

  const handleSendText = React.useCallback(() => {
    if (!textInput.trim()) return

    const messageToSend = textInput
    sendUserMessage(messageToSend)
    setTextInput("")
    onSendMessage?.(messageToSend)
  }, [sendUserMessage, textInput, onSendMessage])

  const handleTextChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setTextInput(value)

      if (value.trim() && isConnected) {
        sendContextualUpdate(value)
      }
    },
    [sendContextualUpdate, isConnected]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSendText()
      }
    },
    [handleSendText]
  )

  // The pre-flight stream is never handed to the SDK — it exists so a denied
  // microphone fails before `startSession` — but it is held for the length of
  // the call because Firefox drops a non-remembered permission as soon as the
  // last track stops, which would make the SDK's own track re-prompt. That put
  // teardown entirely on the end-call button, and a call can end without that
  // button ever being pressed: the agent hangs up, the session times out, the
  // transport errors. Each of those left the stream live and the browser's
  // microphone indicator lit long after the call was over. Tie the stream's
  // lifetime to the session status instead, so whoever ends the call releases
  // the microphone.
  React.useEffect(() => {
    if (status === "connected" || status === "connecting") return
    stopMicStream()
  }, [status, stopMicStream])

  React.useEffect(() => {
    return () => {
      stopMicStream()
    }
  }, [stopMicStream])

  return (
    <div
      ref={ref}
      className={cn("flex w-full items-end justify-center p-4", className)}
    >
      <div className="m-0 w-full">
        <div className="flex flex-col-reverse">
          <div>
            {keyboardOpen && <Separator />}
            <div className="flex items-center justify-center gap-4 p-2">
              <div className="h-9 w-[180px] md:h-10 md:w-[220px]">
                <div
                  className={cn(
                    "flex h-full items-center gap-2 py-1 px-1",
                    "bg-transparent border-0 text-muted-foreground"
                  )}
                >
                  <div className="h-full flex-1">
                    <div
                      className={cn(
                        "relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-sm",
                        waveformClassName
                      )}
                    >
                      <LiveWaveform
                        key={isConnected ? "active" : "idle"}
                        active={isConnected && !isMuted}
                        processing={status === "connecting"}
                        barWidth={3}
                        barGap={1}
                        barRadius={4}
                        fadeEdges={true}
                        fadeWidth={24}
                        sensitivity={1.8}
                        smoothingTimeConstant={0.85}
                        height={20}
                        mode="static"
                        className="h-full w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleMute}
                      aria-pressed={isMuted}
                      aria-label={isMuted ? "Unmute" : "Mute"}
                      className={cn(isMuted && "bg-muted")}
                      disabled={!isConnected}
                    >
                      {isMuted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setKeyboardOpen((v) => !v)}
                      aria-pressed={keyboardOpen}
                      aria-label={keyboardOpen ? "Hide text input" : "Show text input"}
                      className="relative"
                      disabled={!isConnected}
                    >
                      <Keyboard
                        className={
                          "h-[18px] w-[18px] transform-gpu transition duration-200 ease-smooth-out " +
                          (keyboardOpen ? "scale-75 opacity-0" : "scale-100 opacity-100")
                        }
                      />
                      <ChevronDown
                        className={
                          "absolute inset-0 m-auto h-[18px] w-[18px] transform-gpu transition delay-50 duration-200 ease-bounce-strong " +
                          (keyboardOpen ? "scale-100 opacity-100" : "scale-75 opacity-0")
                        }
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{keyboardOpen ? "Hide text input" : "Show text input"}</TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="mx-1.5 h-6" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={isConnected || status === "connecting" ? "ghost" : "default"}
                      onClick={handleStartOrEnd}
                      aria-label={isConnected || status === "connecting" ? "End call" : "Start call"}
                      className={cn(
                        // Literal white, not `text-destructive-foreground`: that
                        // token is tuned for red-as-accent text on a near-white/
                        // near-black surface (see button.tsx's destructive
                        // variant), not for a solid red fill — on this bg it read
                        // as low-contrast in both themes.
                        (isConnected || status === "connecting") &&
                          "bg-destructive text-white shadow-[var(--shadow-button)] hover:bg-destructive/90",
                      )}
                    >
                      {isConnected || status === "connecting" ? (
                        <HugeiconsIcon icon={CallDisabled02Icon} size={18} strokeWidth={1.75} />
                      ) : (
                        <PhoneIcon className="h-[18px] w-[18px]" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isConnected || status === "connecting" ? "End call" : "Start call"}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "overflow-hidden transition-[max-height] duration-300 ease-out",
              keyboardOpen ? "max-h-[120px]" : "max-h-0"
            )}
          >
            <div className="relative px-2 pt-2 pb-2">
              <Textarea
                aria-label="Enter your message"
                value={textInput}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter your message..."
                className="min-h-[100px] resize-none border-0 pr-12 shadow-none focus-visible:ring-0"
                disabled={!isConnected}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSendText}
                    aria-label="Send message"
                    disabled={!textInput.trim() || !isConnected}
                    className="absolute right-3 bottom-3 h-8 w-8"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

ConversationBar.displayName = "ConversationBar"
