import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport, type UIMessage } from "ai";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  AudioPlayer,
  AudioPlayerControlBar,
  AudioPlayerDurationDisplay,
  AudioPlayerElement,
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
} from "@/components/ai-elements/audio-player";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  BotIcon,
  FileAudioIcon,
  GhostIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  MessageSquareTextIcon,
  PlusIcon,
  SidebarIcon,
  Trash2Icon,
} from "lucide-react";
import {
  deleteWebChatHistory,
  fetchChatCatalog,
  fetchAgents,
  fetchWebChatHistory,
  type AgentRecord,
  type ChatCatalogEntry,
  type WebChatHistory,
} from "../../runtimeApi";

const STORAGE_KEY = "acoo:web-chat-thread-id";
const RECENTS_STORAGE_KEY = "acoo:web-chat-recents";
const SIDEBAR_STORAGE_KEY = "acoo:web-chat-sidebar-collapsed";

interface RecentThreadEntry {
  agentDisplayName: string;
  agentSlug: string | null;
  channelThreadId: string;
  channelType?: "web";
  lastPreview: string | null;
  lastUsedAt: string;
  title: string | null;
}

interface ChatScreenProps {
  appName: string;
  onBack: () => void;
}

export function ChatScreen({ onBack }: ChatScreenProps) {
  const composerRootRef = useRef<HTMLDivElement | null>(null);
  const previousStatusRef = useRef<string>("ready");
  const [channelThreadId, setChannelThreadId] = useState(() => {
    if (typeof window === "undefined") {
      return crypto.randomUUID();
    }
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      return current;
    }
    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  });
  const historyLoadTokenRef = useRef(0);
  const [availableAgents, setAvailableAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(() =>
    readInitialSelectedAgentSlug(),
  );
  const [ephemeral, setEphemeral] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);
  const [recentThreads, setRecentThreads] = useState<RecentThreadEntry[]>(() =>
    readRecentThreads(),
  );
  const [telegramChats, setTelegramChats] = useState<ChatCatalogEntry[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat/stream",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            agentSlug: selectedAgentSlug,
            channelThreadId,
            messages,
            mode: ephemeral ? "ephemeral" : "resume",
          },
        }),
      }),
    [channelThreadId, ephemeral, selectedAgentSlug]
  );

  const { error, messages, sendMessage, setMessages, status, stop } =
    useChat<UIMessage>({
      messages: [],
      transport,
      onError: (nextError) => {
        setHistoryError(nextError.message);
      },
      onFinish: ({ isAbort, messages: nextMessages }) => {
        setRecentThreads((current) =>
          upsertRecentThread(current, {
            agentDisplayName: resolveAgentName(availableAgents, selectedAgentSlug),
            agentSlug: selectedAgentSlug,
            channelThreadId,
            lastPreview: summarizeUiMessagesPreview(nextMessages),
            lastUsedAt: new Date().toISOString(),
            title: null,
          }),
        );

        if (isAbort) {
          setHistoryError("Execução interrompida.");
        }
      },
    });

  const loadHistory = async (
    nextThreadId: string,
    nextAgentSlug: string | null = selectedAgentSlug,
  ) => {
    const requestToken = ++historyLoadTokenRef.current;
    setLoadingHistory(true);
    setMessages([]);
    try {
      const next = await fetchWebChatHistory(nextThreadId, {
        agentSlug: nextAgentSlug,
      });
      if (historyLoadTokenRef.current !== requestToken) {
        return;
      }
      setMessages(mapHistoryToUiMessages(next));
      if (next.messages.length > 0 || !nextAgentSlug) {
        setSelectedAgentSlug(next.agent.slug);
      }
      setRecentThreads((current) => {
        const alreadyListed = current.some(
          (thread) => thread.channelThreadId === nextThreadId,
        );
        if (!alreadyListed && next.messages.length === 0) {
          return current;
        }

        return upsertRecentThread(current, {
          agentDisplayName: next.agent.displayName,
          agentSlug: next.agent.slug,
          channelThreadId: nextThreadId,
          lastPreview: summarizeHistoryPreview(next),
          title: deriveHistoryTitle(next),
          lastUsedAt: new Date().toISOString(),
        }, { bump: false });
      });
      setHistoryError(null);
    } catch (loadError) {
      if (historyLoadTokenRef.current !== requestToken) {
        return;
      }
      setHistoryError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar conversa."
      );
      setMessages([]);
    } finally {
      if (historyLoadTokenRef.current === requestToken) {
        setLoadingHistory(false);
      }
    }
  };

  useEffect(() => {
    void loadHistory(channelThreadId, selectedAgentSlug);
  }, [channelThreadId, selectedAgentSlug, setMessages]);

  useEffect(() => {
    void fetchAgents().then((next) => {
      setAvailableAgents(next.filter((agent) => agent.status === "active"));
      setSelectedAgentSlug((current) => current ?? next[0]?.slug ?? null);
    }).catch(() => {
      setAvailableAgents([]);
    });
  }, []);

  useEffect(() => {
    let active = true;

    const loadTelegramCatalog = async () => {
      try {
        const next = await fetchChatCatalog({ channel: "telegram" });
        if (!active) {
          return;
        }
        setTelegramChats(next);
      } catch {
        if (!active) {
          return;
        }
        setTelegramChats([]);
      }
    };

    void loadTelegramCatalog();
    const timer = window.setInterval(() => {
      void loadTelegramCatalog();
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      RECENTS_STORAGE_KEY,
      JSON.stringify(recentThreads.slice(0, 12)),
    );
  }, [recentThreads]);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      sidebarCollapsed ? "true" : "false",
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, channelThreadId);
  }, [channelThreadId]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    if (
      status !== "ready" ||
      previousStatus === "ready" ||
      loadingHistory ||
      deletingThread
    ) {
      return;
    }

    queueMicrotask(() => {
      const textarea = composerRootRef.current?.querySelector<HTMLTextAreaElement>(
        'textarea[name="message"]',
      );
      textarea?.focus();
    });
  }, [deletingThread, loadingHistory, status]);

  const startNewSession = () => {
    if (status === "submitted" || status === "streaming") {
      stop();
    }
    const next = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, next);
    setChannelThreadId(next);
    setHistoryError(null);
    setLoadingHistory(false);
    setMessages([]);
  };

  const openThread = (thread: RecentThreadEntry) => {
    if (
      thread.channelThreadId === channelThreadId &&
      thread.agentSlug === selectedAgentSlug
    ) {
      return;
    }

    if (status === "submitted" || status === "streaming") {
      stop();
    }

    setHistoryError(null);
    setLoadingHistory(true);
    setMessages([]);
    setSelectedAgentSlug(thread.agentSlug);
    setChannelThreadId(thread.channelThreadId);
  };

  const handlePromptSubmit = async (message: PromptInputMessage) => {
    if (
      (status !== "ready" && status !== "error") ||
      (!message.text.trim() && message.files.length === 0)
    ) {
      return;
    }

    setHistoryError(null);
    setRecentThreads((current) =>
      upsertRecentThread(current, {
        agentDisplayName: resolveAgentName(availableAgents, selectedAgentSlug),
        agentSlug: selectedAgentSlug,
        channelThreadId,
        lastPreview: message.text.trim() || (message.files.length > 0 ? "Anexo enviado" : null),
        lastUsedAt: new Date().toISOString(),
        title: deriveMessageTitle(message.text),
      }),
    );

    try {
      if (message.files.length > 0 && message.text.trim()) {
        await sendMessage({ files: message.files, text: message.text.trim() });
      } else if (message.files.length > 0) {
        await sendMessage({ files: message.files });
      } else {
        await sendMessage({ text: message.text.trim() });
      }
    } catch (sendError) {
      setHistoryError(
        sendError instanceof Error
          ? sendError.message
          : "Falha ao enviar mensagem."
      );
    }
  };

  const handleDeleteThread = async () => {
    if (deletingThread) {
      return;
    }

    if (status === "submitted" || status === "streaming") {
      stop();
    }

    setDeletingThread(true);
    setHistoryError(null);
    try {
      historyLoadTokenRef.current += 1;
      await deleteWebChatHistory(channelThreadId, {
        agentSlug: selectedAgentSlug,
      });
      const nextThreadId = crypto.randomUUID();
      setRecentThreads((current) =>
        current.filter((thread) => thread.channelThreadId !== channelThreadId),
      );
      setMessages([]);
      setLoadingHistory(false);
      setChannelThreadId(nextThreadId);
    } catch (deleteError) {
      setHistoryError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao deletar conversa.",
      );
    } finally {
      setDeletingThread(false);
    }
  };

  const activeThreadEntry = recentThreads.find(
    (thread) => thread.channelThreadId === channelThreadId,
  );
  const activeThreadTitle =
    activeThreadEntry?.title?.trim()
    || activeThreadEntry?.agentDisplayName?.trim()
    || "Nova conversa";

  return (
    <main className="h-screen overflow-hidden bg-[linear-gradient(180deg,#091113_0%,#0b1518_100%)] text-[#f7f0e4]">
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? "56px minmax(0,1fr)"
            : "248px minmax(0,1fr)",
        }}
      >
          <aside className="min-h-0 border-r border-white/8 bg-[rgba(7,14,16,0.94)]">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-white/8 px-2 py-2">
                <Button
                  className="h-8 w-8 border-none bg-transparent text-[rgba(247,240,228,0.72)] hover:bg-white/6"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <SidebarIcon className="size-4" />
                </Button>
                {!sidebarCollapsed ? (
                  <span className="truncate text-sm font-medium text-[rgba(247,240,228,0.82)]">
                    Chats
                  </span>
                ) : (
                  <HistoryIcon className="mx-auto size-4 text-[rgba(247,240,228,0.6)]" />
                )}
                {!sidebarCollapsed ? (
                  <Button
                    className="h-8 px-2"
                    disabled={status !== "ready"}
                    onClick={startNewSession}
                    size="sm"
                    type="button"
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                ) : null}
              </div>

              <div className="ui-scroll min-h-0 flex-1 overflow-auto px-2 pb-2">
                <SidebarSessionSection
                  collapsed={sidebarCollapsed}
                  entries={recentThreads}
                  onOpen={openThread}
                  selectedThreadId={channelThreadId}
                  title="Web"
                />
                <SidebarTelegramSection
                  collapsed={sidebarCollapsed}
                  entries={telegramChats}
                />
              </div>

              {!sidebarCollapsed ? (
                <div className="border-t border-white/8 px-2 py-2">
                  <Button
                    className="w-full justify-start border-none bg-transparent text-[rgba(247,240,228,0.72)] hover:bg-white/6"
                    onClick={onBack}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeftIcon className="size-4" />
                    Painel
                  </Button>
                </div>
              ) : null}
            </div>
          </aside>

          <section className="min-h-0 bg-[rgba(10,21,24,0.66)] px-3 py-3 md:px-5 md:py-4">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,28,31,0.96)_0%,rgba(9,18,21,0.98)_100%)] shadow-[0_18px_60px_rgba(0,0,0,0.32)]">
              <div className="border-b border-white/8 px-5 py-4 md:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[rgba(247,240,228,0.42)]">
                      Chat operacional
                    </div>
                    <h1 className="mt-1 truncate text-xl font-semibold tracking-[-0.02em] text-[#f7f0e4]">
                      {activeThreadTitle}
                    </h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[rgba(247,240,228,0.54)]">
                      <span>{resolveAgentName(availableAgents, selectedAgentSlug)}</span>
                      <span className="text-[rgba(247,240,228,0.24)]">/</span>
                      <span>Sessão {formatShortThreadId(channelThreadId)}</span>
                      <span className="text-[rgba(247,240,228,0.24)]">/</span>
                      <span>
                        {status === "submitted" || status === "streaming"
                          ? "Executando"
                          : "Pronto"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Select
                      onValueChange={(value) => setSelectedAgentSlug(value)}
                      value={selectedAgentSlug ?? undefined}
                    >
                      <SelectTrigger className="h-10 min-w-[196px] max-w-[256px] rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] px-3 text-[#f7f0e4] shadow-none hover:bg-[rgba(255,255,255,0.06)]">
                        <div className="flex items-center gap-2">
                          <BotIcon className="size-4 text-[rgba(247,240,228,0.58)]" />
                          <SelectValue placeholder="Selecionar agente" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgents.map((agent) => (
                          <SelectItem key={agent.slug} value={agent.slug}>
                            {agent.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      aria-pressed={ephemeral}
                      className={`h-10 w-10 rounded-xl border ${
                        ephemeral
                          ? "border-[#72d4b1]/30 bg-[#72d4b1]/12 text-[#d9fff1]"
                          : "border-white/10 bg-[rgba(255,255,255,0.04)] text-[rgba(247,240,228,0.68)]"
                      }`}
                      onClick={() => setEphemeral((current) => !current)}
                      size="icon"
                      title="Modo efêmero"
                      type="button"
                      variant="outline"
                    >
                      <GhostIcon className="size-4" />
                    </Button>

                    {(status === "submitted" || status === "streaming") && (
                      <Button
                        className="h-10 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 text-[#f7f0e4] hover:bg-[rgba(255,255,255,0.06)]"
                        onClick={stop}
                        type="button"
                        variant="ghost"
                      >
                        Interromper
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="h-10 w-10 rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] text-[rgba(247,240,228,0.72)] hover:bg-[rgba(255,255,255,0.06)]"
                          disabled={deletingThread}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-[#f28482] focus:text-[#f28482]"
                          onClick={() => void handleDeleteThread()}
                        >
                          <Trash2Icon className="size-4" />
                          Deletar sessão
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              <Conversation className="ui-scroll min-h-0 flex-1 px-5 pb-4 pt-4 md:px-6">
                <ConversationContent className="mx-auto w-full max-w-[920px] gap-6 px-0 py-0">
                  {loadingHistory ? (
                    <ConversationEmptyState
                      description="A sessão web está sendo carregada."
                      title="Carregando conversa"
                    />
                  ) : messages.length === 0 ? (
                    <ConversationEmptyState
                      description="Envie texto, anexe arquivos ou grave um áudio para abrir a sessão."
                      title="Nenhuma mensagem ainda"
                    />
                  ) : (
                    messages.map((message) => (
                      <ChatMessageBubble key={message.id} message={message} />
                    ))
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>

              {historyError || error ? (
                <div className="border-t border-[#f28482]/16 bg-[rgba(242,132,130,0.06)] px-5 py-2 text-sm text-[#ffd9d8] md:px-6">
                  {historyError ?? error?.message}
                </div>
              ) : null}

              <div className="border-t border-white/8 bg-[rgba(5,10,12,0.34)] px-5 py-4 md:px-6">
                <div className="mx-auto w-full max-w-[920px]" ref={composerRootRef}>
                  <PromptInputProvider key={`${channelThreadId}:${ephemeral ? "ephemeral" : "persisted"}`}>
                    <ChatComposer
                      disabled={status !== "ready" && status !== "error"}
                      onSubmit={handlePromptSubmit}
                      status={status}
                      stop={stop}
                    />
                  </PromptInputProvider>
                </div>
              </div>
            </div>
          </section>
      </div>
    </main>
  );
}

function ChatComposer({
  disabled,
  onSubmit,
  status,
  stop,
}: {
  disabled: boolean;
  onSubmit: (message: PromptInputMessage) => Promise<void>;
  status: string;
  stop: () => void;
}) {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInput
      className="rounded-[18px] border border-white/8 bg-[rgba(255,255,255,0.03)] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
      globalDrop
      multiple
      onSubmit={(message) => void onSubmit(message)}
    >
      {(attachments.files ?? []).length > 0 ? (
        <PromptInputHeader className="flex w-full flex-wrap gap-2 border-b border-white/8 px-4 py-3">
          <Attachments variant="inline">
            {(attachments.files ?? []).map((file) => (
              <Attachment
                className="border-white/10 bg-white/4"
                data={file}
                key={file.id}
                onRemove={() => attachments.remove(file.id)}
              >
                <AttachmentPreview />
                <AttachmentInfo />
              </Attachment>
            ))}
          </Attachments>
        </PromptInputHeader>
      ) : null}

      <PromptInputBody>
        <PromptInputTextarea
          className="min-h-[112px] border-none bg-transparent px-4 py-4 text-[15px] leading-7 text-[#f7f0e4] placeholder:text-[rgba(247,240,228,0.4)] focus-visible:ring-0"
          disabled={disabled}
          placeholder="Escreva para o agente. Você pode anexar arquivos, ditar texto ou gravar um áudio."
        />
      </PromptInputBody>

      <PromptInputFooter className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3">
        <PromptInputTools className="flex flex-wrap items-center gap-2">
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger
              disabled={disabled}
              tooltip="Adicionar arquivo"
              variant="outline"
            >
              <PlusIcon className="size-4" />
            </PromptInputActionMenuTrigger>
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
              <PromptInputActionAddScreenshot />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>

          <VoiceToTextButton disabled={disabled} />
          <AudioAttachmentButton disabled={disabled} />
        </PromptInputTools>

        <div className="ml-auto flex items-center gap-2">
          <PromptInputSubmit
            className="rounded-xl"
            disabled={disabled}
            onStop={stop}
            status={status as
              | "error"
              | "ready"
              | "streaming"
              | "submitted"}
          />
        </div>
      </PromptInputFooter>
    </PromptInput>
  );
}

function VoiceToTextButton({ disabled }: { disabled: boolean }) {
  const controller = usePromptInputController();

  return (
    <div>
      <SpeechInput
        className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.03)] text-[#f7f0e4] hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50"
        disabled={disabled}
        onTranscriptionChange={(text: string) => {
          const current = controller.textInput.value.trim();
          const next = current ? `${current} ${text}` : text;
          controller.textInput.setInput(next);
        }}
        type="button"
        variant="ghost"
      />
    </div>
  );
}

function AudioAttachmentButton({ disabled }: { disabled: boolean }) {
  const attachments = usePromptInputAttachments();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const supportsRecording =
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    !!navigator.mediaDevices?.getUserMedia;

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    if (!supportsRecording) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      const extension = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File(
        [blob],
        `gravacao-${new Date().toISOString().replaceAll(":", "-")}.${extension}`,
        {
          type: blob.type || "audio/webm",
        }
      );

      attachments.add([file]);
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      setIsRecording(false);
    };

    recorder.start();
    recorderRef.current = recorder;
    streamRef.current = stream;
    setIsRecording(true);
  };

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  return (
    <Button
      className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.03)] text-[#f7f0e4] hover:bg-[rgba(255,255,255,0.06)]"
      disabled={disabled || !supportsRecording}
      onClick={() => {
        if (isRecording) {
          stopRecording();
          return;
        }
        void startRecording();
      }}
      type="button"
      variant="outline"
    >
      <FileAudioIcon className="size-4" />
      {isRecording ? "Parar áudio" : "Gravar áudio"}
    </Button>
  );
}

function ChatMessageBubble({ message }: { message: UIMessage }) {
  const messageParts = message.parts ?? [];
  const textParts = messageParts.filter((part) => part.type === "text");
  const fileParts = messageParts.filter((part) => part.type === "file");

  return (
    <Message from={message.role}>
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(247,240,228,0.42)]">
        {message.role === "assistant"
          ? "Agente"
          : message.role === "user"
            ? "Você"
            : "Sistema"}
      </div>

      <MessageContent className="w-full max-w-[min(100%,46rem)] rounded-[18px] bg-[rgba(255,255,255,0.035)] px-4 py-3 shadow-none group-[.is-user]:ml-auto group-[.is-user]:bg-[rgba(240,164,92,0.14)] group-[.is-user]:text-white">
        {textParts.length > 0 ? (
          textParts.map((part, index) => (
            <MessageResponse
              className="text-[15px] leading-7 text-[#f7f0e4]"
              key={`${message.id}-text-${index}`}
            >
              {part.text}
            </MessageResponse>
          ))
        ) : (
          <p className="text-sm text-[rgba(247,240,228,0.58)]">
            {message.role === "user"
              ? "Mensagem enviada só com anexo."
              : "Sem conteúdo textual."}
          </p>
        )}

        {fileParts.length > 0 ? (
          <div className="mt-4 space-y-3">
            <Attachments className="w-full" variant="list">
              {fileParts.map((part, index) => (
                <Attachment
                  className="w-full border-white/10 bg-white/4"
                  data={{ ...part, id: `${message.id}-file-${index}` }}
                  key={`${message.id}-file-${index}`}
                >
                  <AttachmentPreview />
                  <AttachmentInfo showMediaType />
                  {isDownloadable(part.url) ? (
                    <Button asChild size="sm" variant="ghost">
                      <a href={part.url} rel="noreferrer" target="_blank">
                        Abrir
                      </a>
                    </Button>
                  ) : null}
                </Attachment>
              ))}
            </Attachments>

            {fileParts
              .filter(
                (part) =>
                  part.mediaType.startsWith("audio/") &&
                  isDownloadable(part.url)
              )
              .map((part, index) => (
                <AudioPlayer
                  className="w-full rounded-2xl border border-white/10 bg-white/4 px-3 py-2"
                  key={`${message.id}-audio-${index}`}
                >
                  <AudioPlayerElement src={part.url} />
                  <AudioPlayerControlBar>
                    <AudioPlayerPlayButton />
                    <AudioPlayerSeekBackwardButton />
                    <AudioPlayerSeekForwardButton />
                    <AudioPlayerTimeDisplay showDuration />
                    <AudioPlayerTimeRange className="mx-2 min-w-24 flex-1" />
                    <AudioPlayerDurationDisplay />
                  </AudioPlayerControlBar>
                </AudioPlayer>
              ))}
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function mapHistoryToUiMessages(history: WebChatHistory): UIMessage[] {
  return (history.messages ?? []).map((message) => ({
    id: message.id,
    parts: [
      ...(message.content
        ? [{ state: "done" as const, text: message.content, type: "text" as const }]
        : []),
      ...(message.attachments ?? []).map((attachment) => ({
        filename: attachment.filename ?? undefined,
        mediaType: attachment.mediaType,
        type: "file" as const,
        url: attachment.downloadPath || `attachment://${attachment.id}`,
      })),
    ],
    role: message.role,
  }));
}

function isDownloadable(url: string) {
  return !url.startsWith("attachment://");
}

function readRecentThreads(): RecentThreadEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as RecentThreadEntry[];
    return Array.isArray(parsed)
      ? parsed
          .filter((entry) => typeof entry?.channelThreadId === "string")
          .map((entry) => ({
            agentDisplayName: typeof entry.agentDisplayName === "string" ? entry.agentDisplayName : "AI COO",
            agentSlug: typeof entry.agentSlug === "string" ? entry.agentSlug : null,
            channelThreadId: entry.channelThreadId,
            channelType: "web" as const,
            lastPreview: typeof entry.lastPreview === "string" ? entry.lastPreview : null,
            lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : new Date().toISOString(),
            title: typeof entry.title === "string" ? entry.title : null,
          }))
      : [];
  } catch {
    return [];
  }
}

function upsertRecentThread(
  current: RecentThreadEntry[],
  next: RecentThreadEntry,
  options?: { bump?: boolean },
): RecentThreadEntry[] {
  const existing = current.find(
    (entry) => entry.channelThreadId === next.channelThreadId,
  );
  const merged: RecentThreadEntry = {
    agentDisplayName: next.agentDisplayName || existing?.agentDisplayName || "AI COO",
    agentSlug: next.agentSlug ?? existing?.agentSlug ?? null,
    channelThreadId: next.channelThreadId,
    channelType: "web",
    lastPreview: next.lastPreview ?? existing?.lastPreview ?? null,
    lastUsedAt: next.lastUsedAt || existing?.lastUsedAt || new Date().toISOString(),
    title: next.title ?? existing?.title ?? null,
  };
  const rest = current.filter(
    (entry) => entry.channelThreadId !== next.channelThreadId,
  );

  if (options?.bump === false) {
    if (!existing) {
      return [...current, merged].slice(-12);
    }
    return current.map((entry) =>
      entry.channelThreadId === next.channelThreadId ? merged : entry,
    );
  }

  return [merged, ...rest].slice(0, 12);
}

function summarizeHistoryPreview(history: WebChatHistory): string | null {
  const latest = [...(history.messages ?? [])]
    .reverse()
    .find((message) => message.role !== "system");

  if (!latest) {
    return null;
  }

  if (latest.content.trim()) {
    return latest.content.trim().slice(0, 72);
  }

  if ((latest.attachments ?? []).length > 0) {
    return latest.role === "user" ? "Anexo enviado" : "Resposta com anexo";
  }

  return null;
}

function summarizeUiMessagesPreview(messages: UIMessage[]): string | null {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role !== "system");

  if (!latest) {
    return null;
  }

  const text = (latest.parts ?? [])
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("")
    .trim();

  if (text) {
    return text.slice(0, 72);
  }

  const hasFile = (latest.parts ?? []).some((part) => part.type === "file");
  if (hasFile) {
    return latest.role === "user" ? "Anexo enviado" : "Resposta com anexo";
  }

  return null;
}

function deriveHistoryTitle(history: WebChatHistory): string | null {
  const firstUserMessage = (history.messages ?? []).find(
    (message) => message.role === "user" && message.content.trim(),
  );
  return deriveMessageTitle(firstUserMessage?.content ?? null);
}

function deriveMessageTitle(input: string | null | undefined): string | null {
  const text = input?.trim();
  if (!text) {
    return null;
  }
  return text.slice(0, 72);
}

function readInitialSelectedAgentSlug(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const currentThreadId = window.localStorage.getItem(STORAGE_KEY);
  if (!currentThreadId) {
    return null;
  }

  return (
    readRecentThreads().find((entry) => entry.channelThreadId === currentThreadId)?.agentSlug ??
    null
  );
}

function resolveAgentName(
  agents: AgentRecord[],
  agentSlug: string | null,
): string {
  return (
    agents.find((agent) => agent.slug === agentSlug)?.displayName ??
    "AI COO"
  );
}

function formatShortThreadId(channelThreadId: string): string {
  return channelThreadId.slice(0, 8);
}

function SidebarSessionSection({
  collapsed,
  entries,
  onOpen,
  selectedThreadId,
  title,
}: {
  collapsed: boolean;
  entries: RecentThreadEntry[];
  onOpen: (thread: RecentThreadEntry) => void;
  selectedThreadId: string;
  title: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {!collapsed ? (
        <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-[rgba(247,240,228,0.34)]">
          {title}
        </div>
      ) : null}
      {entries.map((thread) => (
        <button
          className={`flex w-full items-start gap-2 px-2 py-2 text-left transition hover:bg-white/6 ${
            thread.channelThreadId === selectedThreadId
              ? "bg-white/8 text-white"
              : "bg-transparent"
          }`}
          key={`web-${thread.channelThreadId}`}
          onClick={() => onOpen(thread)}
          type="button"
        >
          <MessageSquareTextIcon className="mt-0.5 size-4 shrink-0 text-[rgba(247,240,228,0.5)]" />
          {!collapsed ? (
            <span className="min-w-0">
              <strong className="block truncate text-sm font-medium text-[#f7f0e4]">
                {thread.title || thread.agentDisplayName || "Nova sessão"}
              </strong>
              <small className="block truncate text-[11px] text-[rgba(247,240,228,0.48)]">
                {(thread.lastPreview || thread.agentDisplayName || "Sem atividade").slice(0, 52)}
              </small>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function SidebarTelegramSection({
  collapsed,
  entries,
}: {
  collapsed: boolean;
  entries: ChatCatalogEntry[];
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-1">
      {!collapsed ? (
        <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-[rgba(247,240,228,0.34)]">
          Telegram
        </div>
      ) : null}
      {entries.map((entry) => (
        <div
          className="flex w-full items-start gap-2 px-2 py-2 text-left opacity-88"
          key={`telegram-${entry.channelThreadId}`}
        >
          <MessageSquareTextIcon className="mt-0.5 size-4 shrink-0 text-[rgba(114,212,177,0.72)]" />
          {!collapsed ? (
            <span className="min-w-0">
              <strong className="block truncate text-sm font-medium text-[#f7f0e4]">
                {entry.title || `Telegram ${entry.channelThreadId}`}
              </strong>
              <small className="block truncate text-[11px] text-[rgba(247,240,228,0.48)]">
                {buildTelegramPreview(entry).slice(0, 60)}
              </small>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function buildTelegramPreview(entry: ChatCatalogEntry): string {
  const status = entry.active ? "ativo" : "encerrado";
  const preview = entry.lastPreview?.trim();
  if (preview) {
    return `Telegram · ${status} · ${preview}`;
  }
  return `Telegram · ${status} · ${entry.agentDisplayName || entry.agentSlug || "sem agente"}`;
}
