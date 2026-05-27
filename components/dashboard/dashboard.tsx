"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Command,
  Flag,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogIn,
  MoreHorizontal,
  Percent,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Settings,
  Sparkles,
  TimerReset,
  Trash2,
  X
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  addDays,
  format,
  formatDistanceToNow,
  isBefore,
  isSameDay,
  parseISO
} from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { parseTaskLocally } from "@/lib/local-parser";
import {
  clampProgress,
  getTaskRemainingHours,
  getTaskTotalHours,
  rankTasks,
  scoreTasks,
  weightLabelToValue
} from "@/lib/priority";
import { parseTaskResponseSchema } from "@/lib/schemas/task";
import { supabase } from "@/lib/supabase";
import type {
  CalendarBlock,
  Course,
  ParsedTask,
  ParserConfidence,
  Task,
  TaskWithPriority
} from "@/lib/types";
import type { DashboardSeedData } from "@/lib/data/tasks";
import { cn } from "@/lib/utils";

const fallbackCourseId = "inbox";
type DashboardView = "today" | "tasks" | "calendar" | "courses" | "settings";

const navItems = [
  { value: "today", label: "Today", icon: LayoutDashboard },
  { value: "tasks", label: "Tasks", icon: ListChecks },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "courses", label: "Courses", icon: Inbox },
  { value: "settings", label: "Settings", icon: Settings }
] satisfies { value: DashboardView; label: string; icon: typeof LayoutDashboard }[];

const googleCalendarScopes =
  "openid email profile https://www.googleapis.com/auth/calendar";

const viewTitles = {
  today: "Today's academic priorities",
  tasks: "Task queue",
  calendar: "Calendar sync",
  courses: "Courses",
  settings: "Settings"
} satisfies Record<DashboardView, string>;

const viewSubtitles = {
  today: "One screen for the next best move.",
  tasks: "Filter, adjust, and complete your ranked workload.",
  calendar: "Google Calendar blocks and FlowState deadlines together.",
  courses: "Course workload at a glance.",
  settings: "Auth, data, and calendar connection status."
} satisfies Record<DashboardView, string>;

const calendarStatusText = {
  connected: "Connected",
  not_connected: "Not connected",
  error: "Sync issue"
} satisfies Record<
  DashboardSeedData["integrationStatus"]["googleCalendar"],
  string
>;

export function Dashboard({ seedData }: { seedData: DashboardSeedData }) {
  const [tasks, setTasks] = useState(seedData.tasks);
  const [courses, setCourses] = useState(seedData.courses);
  const [calendarBlocks, setCalendarBlocks] = useState(seedData.calendarBlocks);
  const [integrationStatus, setIntegrationStatus] = useState(
    seedData.integrationStatus
  );
  const [activeView, setActiveView] = useState<DashboardView>("today");
  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [parserState, setParserState] = useState<{
    confidence: ParserConfidence;
    message: string;
  } | null>(null);

  const rankedTasks = useMemo(() => rankTasks(tasks), [tasks]);
  const visibleTasks = useMemo(() => {
    const baseTasks =
      activeTab === "completed"
        ? scoreTasks(tasks.filter((task) => task.is_completed))
        : rankedTasks;

    return baseTasks.filter((task) => {
      const courseMatch =
        selectedCourseId === "all" || task.course_id === selectedCourseId;
      const now = new Date();
      const due = parseISO(task.due_date);
      const tabMatch =
        activeTab === "all" ||
        (activeTab === "today" && isSameDay(due, now)) ||
        (activeTab === "overdue" && isBefore(due, now)) ||
        (activeTab === "heavy" && task.remaining_hours >= 4) ||
        activeTab === "completed";

      return courseMatch && tabMatch;
    });
  }, [activeTab, rankedTasks, selectedCourseId, tasks]);

  const focusTask = visibleTasks[0] ?? rankedTasks[0];
  const todayBlocks = calendarBlocks.filter((block) =>
    isSameDay(parseISO(block.start), new Date())
  );
  const openTasks = tasks.filter((task) => !task.is_completed);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommandShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isCommandShortcut) {
        event.preventDefault();
        setIsCommandOpen(true);
      }

      if (event.key === "Escape") {
        setIsCommandOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    async function hydrateFromSupabase() {
      const { data } = await supabase!.auth.getSession();
      const session = data.session;

      if (!isMounted || !session) {
        return;
      }

      setUserId(session.user.id);
      setGoogleAccessToken(session.provider_token ?? null);
      setIntegrationStatus({
        supabase: "connected",
        googleCalendar: session.provider_token ? "connected" : "not_connected"
      });

      await loadSupabaseData(session.user.id);

      if (session.provider_token) {
        await refreshCalendarEvents(session.provider_token);
      }
    }

    void hydrateFromSupabase();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUserId(null);
        setGoogleAccessToken(null);
        setIntegrationStatus({
          supabase: "seeded",
          googleCalendar: "not_connected"
        });
        return;
      }

      setUserId(session.user.id);
      setGoogleAccessToken(session.provider_token ?? null);
      setIntegrationStatus({
        supabase: "connected",
        googleCalendar: session.provider_token ? "connected" : "not_connected"
      });
      void loadSupabaseData(session.user.id);

      if (session.provider_token) {
        void refreshCalendarEvents(session.provider_token);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
    // Auth/bootstrap should run once on mount; calendar refresh is invoked from
    // the session callbacks with the current provider token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getCourse(courseId: string | null) {
    return (
      courses.find((course) => course.id === courseId) ??
      courses.find((course) => course.id === fallbackCourseId) ??
      courses[0]
    );
  }

  async function loadSupabaseData(nextUserId: string) {
    if (!supabase) {
      return;
    }

    const [coursesResult, tasksResult] = await Promise.all([
      supabase
        .from("courses")
        .select("id,name,color")
        .eq("user_id", nextUserId)
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id,course_id,title,item_type,due_date,estimated_total_hours,estimated_hours,progress_percent,remaining_hours_override,weight,is_completed,google_event_id,created_at,updated_at"
        )
        .eq("user_id", nextUserId)
        .order("due_date", { ascending: true })
    ]);

    if (coursesResult.data && coursesResult.data.length > 0) {
      setCourses(coursesResult.data as Course[]);
    }

    if (tasksResult.data && tasksResult.data.length > 0) {
      setTasks(tasksResult.data as Task[]);
    }
  }

  async function persistTask(task: Task) {
    if (!supabase || !userId) {
      return;
    }

    await supabase.from("tasks").upsert({
      ...task,
      user_id: userId
    });
  }

  async function removeTaskFromSupabase(taskId: string) {
    if (!supabase || !userId) {
      return;
    }

    await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", userId);
  }

  async function refreshCalendarEvents(token = googleAccessToken) {
    if (!token) {
      setCalendarBlocks(seedData.calendarBlocks);
      setIntegrationStatus((current) => ({
        ...current,
        googleCalendar: "not_connected"
      }));
      return;
    }

    try {
      const params = new URLSearchParams({
        timeMin: addDays(new Date(), -1).toISOString(),
        timeMax: addDays(new Date(), 21).toISOString()
      });
      const response = await fetch(`/api/calendar/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("Unable to pull Google Calendar events.");
      }

      const payload = (await response.json()) as { blocks: CalendarBlock[] };
      setCalendarBlocks([...seedData.calendarBlocks, ...payload.blocks]);
      setIntegrationStatus((current) => ({
        ...current,
        googleCalendar: "connected"
      }));
      setSyncMessage("Google Calendar events refreshed.");
    } catch {
      setIntegrationStatus((current) => ({
        ...current,
        googleCalendar: "error"
      }));
      setSyncMessage("Calendar pull failed. FlowState kept your local data.");
    }
  }

  async function syncDeadline(task: Task, action: "upsert" | "delete" = "upsert") {
    if (!googleAccessToken) {
      return task;
    }

    try {
      const response = await fetch("/api/calendar/deadlines", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ task, action })
      });

      if (!response.ok) {
        throw new Error("Unable to sync FlowState deadline.");
      }

      const payload = (await response.json()) as {
        googleEventId?: string;
        action: "upsert" | "delete";
      };
      const syncedTask =
        payload.action === "delete"
          ? { ...task, google_event_id: null }
          : { ...task, google_event_id: payload.googleEventId ?? task.google_event_id };

      setTasks((current) =>
        current.map((currentTask) =>
          currentTask.id === syncedTask.id ? syncedTask : currentTask
        )
      );
      await persistTask(syncedTask);
      setIntegrationStatus((current) => ({
        ...current,
        googleCalendar: "connected"
      }));
      setSyncMessage(
        payload.action === "delete"
          ? "Removed completed deadline from Google Calendar."
          : "Synced deadline to Google Calendar."
      );
      return syncedTask;
    } catch {
      setIntegrationStatus((current) => ({
        ...current,
        googleCalendar: "error"
      }));
      setSyncMessage("Deadline sync failed, but your FlowState task was kept.");
      return task;
    }
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setSyncMessage("Add Supabase environment variables to enable sign-in.");
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: googleCalendarScopes,
        redirectTo: window.location.origin
      }
    });
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setTasks(seedData.tasks);
    setCourses(seedData.courses);
    setCalendarBlocks(seedData.calendarBlocks);
    setIntegrationStatus(seedData.integrationStatus);
    setSyncMessage("Signed out. Showing seeded demo data.");
  }

  async function manualSync() {
    if (!googleAccessToken) {
      setSyncMessage("Connect Google Calendar before syncing.");
      return;
    }

    await refreshCalendarEvents(googleAccessToken);

    const response = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ tasks: openTasks })
    });

    setSyncMessage(
      response.ok
        ? "Manual sync finished."
        : "Manual sync had issues. Check Google Calendar permissions."
    );
  }

  function taskFromParsed(parsed: ParsedTask): Task {
    const matchedCourse = parsed.courseName
      ? courses.find(
          (course) =>
            course.name.toLowerCase() === parsed.courseName?.toLowerCase()
        )
      : null;
    const now = new Date().toISOString();

    const estimatedHours = parsed.estimatedHours ?? 1;

    return {
      id: crypto.randomUUID(),
      course_id: matchedCourse?.id ?? fallbackCourseId,
      title: parsed.title || "Untitled task",
      item_type: "assignment",
      due_date: parsed.dueDate,
      estimated_total_hours: estimatedHours,
      estimated_hours: estimatedHours,
      progress_percent: 0,
      remaining_hours_override: null,
      weight: weightLabelToValue(parsed.weight),
      is_completed: false,
      source: "llm",
      created_at: now,
      updated_at: now
    };
  }

  async function createTask(text: string) {
    try {
      const response = await fetch("/api/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          now: new Date().toISOString(),
          courses
        })
      });

      if (!response.ok) {
        throw new Error("Task parser request failed.");
      }

      const payload = parseTaskResponseSchema.parse(await response.json());
      const nextTask = taskFromParsed(payload.parsed);

      setTasks((current) => [nextTask, ...current]);
      await persistTask(nextTask);
      void syncDeadline(nextTask);
      setParserState({
        confidence: payload.confidence,
        message:
          payload.confidence === "llm"
            ? "Added with AI parsing."
            : "Added with local fallback parsing."
      });
    } catch {
      const parsed = parseTaskLocally(text, new Date(), courses);
      const nextTask = taskFromParsed(parsed);

      setTasks((current) => [nextTask, ...current]);
      await persistTask(nextTask);
      void syncDeadline(nextTask);
      setParserState({
        confidence: "failed",
        message: "Parser failed, so FlowState used the local fallback."
      });
    }
  }

  function completeTask(taskId: string) {
    let nextTask: Task | null = null;

    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        nextTask = {
              ...task,
              progress_percent: 100,
              remaining_hours_override: null,
              is_completed: true,
              updated_at: new Date().toISOString()
            };

        return nextTask;
      })
    );

    if (nextTask) {
      void persistTask(nextTask);
      void syncDeadline(nextTask, "delete");
    }
  }

  function snoozeTask(taskId: string) {
    let nextTask: Task | null = null;

    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        nextTask = {
              ...task,
              due_date: addDays(parseISO(task.due_date), 1).toISOString(),
              updated_at: new Date().toISOString()
            };

        return nextTask;
      })
    );

    if (nextTask) {
      void persistTask(nextTask);
      void syncDeadline(nextTask);
    }
  }

  function updateProgress(taskId: string, progress: number) {
    const nextProgress = clampProgress(progress);
    let nextTask: Task | null = null;

    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        nextTask = {
              ...task,
              progress_percent: nextProgress,
              remaining_hours_override:
                nextProgress === 100 ? null : task.remaining_hours_override,
              is_completed: nextProgress === 100,
              updated_at: new Date().toISOString()
            };

        return nextTask;
      })
    );

    if (nextTask) {
      void persistTask(nextTask);
      void syncDeadline(nextTask, nextProgress === 100 ? "delete" : "upsert");
    }
  }

  function updateEstimate(taskId: string, delta: number) {
    let nextTask: Task | null = null;

    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        nextTask = {
              ...task,
              estimated_total_hours: Math.max(
                0.5,
                getTaskTotalHours(task) + delta
              ),
              estimated_hours: Math.max(0.5, getTaskTotalHours(task) + delta),
              updated_at: new Date().toISOString()
            };

        return nextTask;
      })
    );

    if (nextTask) {
      void persistTask(nextTask);
    }
  }

  function setRemainingOverride(taskId: string, remainingHours: number | null) {
    let nextTask: Task | null = null;

    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        nextTask = {
              ...task,
              remaining_hours_override:
                remainingHours === null ? null : Math.max(0, remainingHours),
              updated_at: new Date().toISOString()
            };

        return nextTask;
      })
    );

    if (nextTask) {
      void persistTask(nextTask);
    }
  }

  function deleteTask(taskId: string) {
    const taskToDelete = tasks.find((task) => task.id === taskId);

    setTasks((current) => current.filter((task) => task.id !== taskId));

    if (taskToDelete) {
      void removeTaskFromSupabase(taskId);
      void syncDeadline(taskToDelete, "delete");
    }
  }

  const taskQueue = (
    <TaskQueue
      courses={courses}
      selectedCourseId={selectedCourseId}
      activeTab={activeTab}
      tasks={visibleTasks}
      getCourse={getCourse}
      onCourseChange={setSelectedCourseId}
      onTabChange={setActiveTab}
      onComplete={completeTask}
      onSnooze={snoozeTask}
      onEstimate={updateEstimate}
      onProgress={updateProgress}
      onDelete={deleteTask}
      onOpenCommand={() => setIsCommandOpen(true)}
    />
  );

  const focusPanel = (
    <FocusPanel
      task={focusTask}
      getCourse={getCourse}
      onComplete={completeTask}
      onSnooze={snoozeTask}
      onEstimate={updateEstimate}
      onProgress={updateProgress}
      onRemainingOverride={setRemainingOverride}
      onOpenCommand={() => setIsCommandOpen(true)}
    />
  );

  return (
    <main className="min-h-screen pb-20 text-ink lg:pb-0">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[232px_minmax(0,1fr)]">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <div className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <TopBar
            activeView={activeView}
            onOpenCommand={() => setIsCommandOpen(true)}
          />

          {activeView === "today" ? (
            <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(420px,1fr)_minmax(320px,0.8fr)] 2xl:grid-cols-[minmax(280px,0.75fr)_minmax(420px,1.25fr)_minmax(320px,0.8fr)]">
              <div className="grid content-start gap-4 xl:col-span-2 2xl:col-span-1">
                <StatsStrip tasks={openTasks} rankedTasks={rankedTasks} />
                <CalendarTimeline
                  blocks={todayBlocks}
                  tasks={openTasks}
                  getCourse={getCourse}
                />
              </div>
              {taskQueue}
              <div className="grid content-start gap-4">
                {focusPanel}
                <SettingsPanel
                  status={integrationStatus}
                  syncMessage={syncMessage}
                  hasSupabase={Boolean(supabase)}
                  hasGoogleToken={Boolean(googleAccessToken)}
                  onGoogleSignIn={signInWithGoogle}
                  onSignOut={signOut}
                  onManualSync={manualSync}
                />
              </div>
            </section>
          ) : null}

          {activeView === "tasks" ? (
            <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              {taskQueue}
              <div className="grid content-start gap-4">
                <StatsStrip tasks={openTasks} rankedTasks={rankedTasks} />
                {focusPanel}
              </div>
            </section>
          ) : null}

          {activeView === "calendar" ? (
            <CalendarView
              blocks={calendarBlocks}
              tasks={openTasks}
              getCourse={getCourse}
              status={integrationStatus}
              syncMessage={syncMessage}
              hasGoogleToken={Boolean(googleAccessToken)}
              onRefresh={() => void refreshCalendarEvents()}
              onGoogleSignIn={signInWithGoogle}
              onSignOut={signOut}
              onManualSync={manualSync}
            />
          ) : null}

          {activeView === "courses" ? (
            <CoursesView
              courses={courses}
              tasks={tasks}
              onOpenTasks={(courseId) => {
                setSelectedCourseId(courseId);
                setActiveView("tasks");
              }}
            />
          ) : null}

          {activeView === "settings" ? (
            <div className="mt-5 max-w-3xl">
              <SettingsPanel
                status={integrationStatus}
                syncMessage={syncMessage}
                hasSupabase={Boolean(supabase)}
                hasGoogleToken={Boolean(googleAccessToken)}
                onGoogleSignIn={signInWithGoogle}
                onSignOut={signOut}
                onManualSync={manualSync}
              />
            </div>
          ) : null}
        </div>
      </div>

      <MobileNav activeView={activeView} onViewChange={setActiveView} />
      <CommandDialog
        open={isCommandOpen}
        parserState={parserState}
        onOpenChange={setIsCommandOpen}
        onSubmit={createTask}
      />
    </main>
  );
}

function Sidebar({
  activeView,
  onViewChange
}: {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
}) {
  return (
    <aside className="hidden border-r border-white/80 bg-white/72 px-4 py-5 backdrop-blur lg:block">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white shadow-soft">
          <Sparkles size={20} />
        </div>
        <div>
          <p className="text-lg font-semibold">FlowState</p>
          <p className="text-xs text-muted">Academic command center</p>
        </div>
      </div>

      <nav className="mt-8 grid gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.value === activeView;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onViewChange(item.value)}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted transition hover:bg-surface-muted hover:text-ink",
                active && "bg-ink text-white hover:bg-ink hover:text-white"
              )}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileNav({
  activeView,
  onViewChange
}: {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white/95 px-2 py-2 shadow-panel backdrop-blur lg:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.value === activeView;

        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onViewChange(item.value)}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold text-muted",
              active && "bg-ink text-white"
            )}
          >
            <Icon size={17} />
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function TopBar({
  activeView,
  onOpenCommand
}: {
  activeView: DashboardView;
  onOpenCommand: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-moss">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">
          {viewTitles[activeView]}
        </h1>
        <p className="mt-1 text-sm text-muted">{viewSubtitles[activeView]}</p>
      </div>
      <button
        type="button"
        onClick={onOpenCommand}
        className="flex h-12 items-center justify-between gap-3 rounded-md border border-line bg-white px-3 text-left text-sm text-muted shadow-soft transition hover:border-sky hover:text-ink sm:w-80"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Search size={17} />
          <span className="truncate">Quick-drop assignment, exam, or task</span>
        </span>
        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-xs">
          Cmd K
        </span>
      </button>
    </header>
  );
}

function StatsStrip({
  tasks,
  rankedTasks
}: {
  tasks: Task[];
  rankedTasks: TaskWithPriority[];
}) {
  const overdue = tasks.filter((task) =>
    isBefore(parseISO(task.due_date), new Date())
  ).length;
  const effort = tasks.reduce((sum, task) => sum + getTaskRemainingHours(task), 0);

  return (
    <Panel>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Open" value={String(tasks.length)} tone="ink" />
        <Stat
          label="Next"
          value={rankedTasks[0] ? formatHours(rankedTasks[0].hours_remaining) : "--"}
          tone="coral"
        />
        <Stat label="Effort" value={`${effort}h`} tone="sky" />
      </div>
      {overdue > 0 ? (
        <Badge tone="coral" className="mt-3">
          <Flag size={13} />
          {overdue} overdue
        </Badge>
      ) : (
        <Badge tone="moss" className="mt-3">
          <Check size={13} />
          No overdue tasks
        </Badge>
      )}
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "ink" | "coral" | "sky";
}) {
  const colors = {
    ink: "bg-ink",
    coral: "bg-coral",
    sky: "bg-sky"
  };

  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-muted/55 p-3">
      <p className="truncate text-[11px] font-semibold uppercase text-muted">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="truncate text-2xl font-semibold">{value}</p>
        <span className={cn("h-2 w-8 shrink-0 rounded-full", colors[tone])} />
      </div>
    </div>
  );
}

function CalendarTimeline({
  blocks,
  tasks,
  getCourse
}: {
  blocks: CalendarBlock[];
  tasks: Task[];
  getCourse: (courseId: string | null) => Course;
}) {
  const deadlines = tasks
    .filter((task) => isSameDay(parseISO(task.due_date), new Date()))
    .slice(0, 4);

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-moss">
            Today timeline
          </p>
          <h2 className="mt-1 text-lg font-semibold">Classes and deadlines</h2>
        </div>
        <CalendarDays size={20} className="text-moss" />
      </div>
      <div className="grid gap-2">
        {[...blocks, ...deadlines.map(taskToDeadlineBlock)].map((block) => {
          const course = getCourse(block.course_id ?? null);

          return (
            <article
              key={block.id}
              className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-white p-3"
            >
              <p className="text-xs font-semibold text-muted">
                {format(parseISO(block.start), "h:mm")}
              </p>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: course.color }}
                  />
                  <h3 className="truncate text-sm font-semibold">
                    {block.title}
                  </h3>
                </div>
                <p className="mt-1 truncate text-xs text-muted">
                  {block.kind === "deadline"
                    ? "FlowState deadline"
                    : `${format(parseISO(block.start), "h:mm a")} - ${format(
                        parseISO(block.end),
                        "h:mm a"
                      )}`}
                </p>
              </div>
              <Badge tone={block.kind === "deadline" ? "gold" : "neutral"}>
                {eventKindLabel(block.kind)}
              </Badge>
            </article>
          );
        })}
        {blocks.length === 0 && deadlines.length === 0 ? (
          <EmptyState
            title="No blocks today"
            body="Your schedule is clear enough to make real progress."
          />
        ) : null}
      </div>
    </Panel>
  );
}

function TaskQueue({
  courses,
  selectedCourseId,
  activeTab,
  tasks,
  getCourse,
  onCourseChange,
  onTabChange,
  onComplete,
  onSnooze,
  onEstimate,
  onProgress,
  onDelete,
  onOpenCommand
}: {
  courses: Course[];
  selectedCourseId: string;
  activeTab: string;
  tasks: TaskWithPriority[];
  getCourse: (courseId: string | null) => Course;
  onCourseChange: (courseId: string) => void;
  onTabChange: (tab: string) => void;
  onComplete: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
  onEstimate: (taskId: string, delta: number) => void;
  onProgress: (taskId: string, progress: number) => void;
  onDelete: (taskId: string) => void;
  onOpenCommand: () => void;
}) {
  return (
    <Panel className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-moss">
            Priority queue
          </p>
          <h2 className="mt-1 text-xl font-semibold">Ranked tasks</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <CourseMenu
            courses={courses}
            selectedCourseId={selectedCourseId}
            onCourseChange={onCourseChange}
          />
          <Button variant="primary" size="sm" onClick={onOpenCommand}>
            <Plus size={16} />
            Add
          </Button>
        </div>
      </div>

      <Tabs.Root value={activeTab} onValueChange={onTabChange}>
        <Tabs.List className="mb-4 grid grid-cols-5 rounded-md bg-surface-muted p-1">
          {[
            ["all", "All"],
            ["today", "Today"],
            ["overdue", "Overdue"],
            ["heavy", "Heavy"],
            ["completed", "Done"]
          ].map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="h-9 rounded-sm px-2 text-xs font-semibold text-muted transition data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-soft sm:text-sm"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      <div className="grid gap-2">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              course={getCourse(task.course_id)}
              onComplete={onComplete}
              onSnooze={onSnooze}
              onEstimate={onEstimate}
              onProgress={onProgress}
              onDelete={onDelete}
            />
          ))}
        </AnimatePresence>
        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks match this view"
            body="Switch filters or quick-drop the next thing on your mind."
          />
        ) : null}
      </div>
    </Panel>
  );
}

function CourseMenu({
  courses,
  selectedCourseId,
  onCourseChange
}: {
  courses: Course[];
  selectedCourseId: string;
  onCourseChange: (courseId: string) => void;
}) {
  const selected =
    courses.find((course) => course.id === selectedCourseId)?.name ?? "All courses";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm">
          <span className="max-w-32 truncate">{selected}</span>
          <ChevronDown size={15} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-48 rounded-md border border-line bg-white p-1 shadow-panel"
        >
          <DropdownMenu.Item
            onClick={() => onCourseChange("all")}
            className="rounded-sm px-3 py-2 text-sm outline-hidden hover:bg-surface-muted"
          >
            All courses
          </DropdownMenu.Item>
          {courses.map((course) => (
            <DropdownMenu.Item
              key={course.id}
              onClick={() => onCourseChange(course.id)}
              className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm outline-hidden hover:bg-surface-muted"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: course.color }}
              />
              {course.name}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function TaskRow({
  task,
  course,
  onComplete,
  onSnooze,
  onEstimate,
  onProgress,
  onDelete
}: {
  task: TaskWithPriority;
  course: Course;
  onComplete: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
  onEstimate: (taskId: string, delta: number) => void;
  onProgress: (taskId: string, progress: number) => void;
  onDelete: (taskId: string) => void;
}) {
  const overdue = isBefore(parseISO(task.due_date), new Date());
  const progress = clampProgress(task.progress_percent);
  const remainingHours = getTaskRemainingHours(task);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="grid min-w-0 grid-cols-[5px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-white p-3 transition hover:border-sky/80 hover:shadow-soft"
    >
      <div
        className="h-full min-h-16 rounded-full"
        style={{ backgroundColor: course.color }}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 max-w-full truncate text-sm font-semibold">
            {task.title}
          </h3>
          <Badge tone={overdue ? "coral" : "neutral"}>
            {overdue ? "Overdue" : formatHours(task.hours_remaining)}
          </Badge>
          <Badge tone={task.item_type === "assignment" ? "sky" : "neutral"}>
            {task.item_type === "assignment" ? "Assignment" : "Task"}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {course.name} · due{" "}
          {formatDistanceToNow(parseISO(task.due_date), { addSuffix: true })} ·{" "}
          {formatHours(remainingHours)} left of {formatHours(getTaskTotalHours(task))}
        </p>
        <div className="mt-3 grid gap-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{progress}% complete</span>
            <span>{task.remaining_hours_override !== null ? "manual" : "auto"} remaining</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-moss transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Complete task"
              onClick={() => onComplete(task.id)}
            >
              <Check size={17} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Complete</TooltipContent>
        </Tooltip>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Task actions">
              <MoreHorizontal size={17} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-44 rounded-md border border-line bg-white p-1 shadow-panel"
            >
              <TaskMenuItem onClick={() => onSnooze(task.id)}>
                <Clock3 size={15} />
                Snooze 1 day
              </TaskMenuItem>
              <TaskMenuItem onClick={() => onEstimate(task.id, 0.5)}>
                <Plus size={15} />
                Add 30 min
              </TaskMenuItem>
              <TaskMenuItem onClick={() => onEstimate(task.id, -0.5)}>
                <Archive size={15} />
                Remove 30 min
              </TaskMenuItem>
              <div className="px-2 py-2">
                <p className="mb-2 text-xs font-semibold uppercase text-muted">
                  Progress
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {[0, 25, 50, 75, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onProgress(task.id, value)}
                      className={cn(
                        "h-8 rounded-sm border border-line text-xs font-semibold hover:border-sky hover:bg-surface-muted",
                        progress === value && "border-moss bg-moss text-white hover:bg-moss"
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <TaskMenuItem destructive onClick={() => onDelete(task.id)}>
                <Trash2 size={15} />
                Delete
              </TaskMenuItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </motion.article>
  );
}

function TaskMenuItem({
  children,
  destructive,
  onClick
}: {
  children: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenu.Item
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-sm px-3 py-2 text-sm outline-hidden hover:bg-surface-muted",
        destructive && "text-coral"
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

function FocusPanel({
  task,
  getCourse,
  onComplete,
  onSnooze,
  onEstimate,
  onProgress,
  onRemainingOverride,
  onOpenCommand
}: {
  task: TaskWithPriority | undefined;
  getCourse: (courseId: string | null) => Course;
  onComplete: (taskId: string) => void;
  onSnooze: (taskId: string) => void;
  onEstimate: (taskId: string, delta: number) => void;
  onProgress: (taskId: string, progress: number) => void;
  onRemainingOverride: (taskId: string, remainingHours: number | null) => void;
  onOpenCommand: () => void;
}) {
  if (!task) {
    return (
      <Panel className="bg-ink text-white">
        <EmptyState
          title="No focus task"
          body="Drop in an assignment to rebuild your queue."
          inverse
        />
        <Button className="mt-4 w-full" variant="secondary" onClick={onOpenCommand}>
          <Plus size={16} />
          Add task
        </Button>
      </Panel>
    );
  }

  const course = getCourse(task.course_id);
  const overdue = isBefore(parseISO(task.due_date), new Date());
  const remainingHours = getTaskRemainingHours(task);

  return (
    <Panel className="overflow-hidden bg-ink text-white">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-white/56">
            Focus task
          </p>
          <h2 className="mt-1 text-xl font-semibold">Next best move</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10">
          <TimerReset size={20} />
        </div>
      </div>
      <div
        className="mb-4 h-2 w-24 rounded-full"
        style={{ backgroundColor: course.color }}
      />
      <p className="text-sm font-semibold text-white/62">{course.name}</p>
      <h3 className="mt-3 text-balance text-3xl font-semibold leading-tight">
        {task.title}
      </h3>
      <div className="mt-5 grid gap-2">
        <FocusMetric
          icon={<Clock3 size={17} />}
          label="Due"
          value={format(parseISO(task.due_date), "EEE, MMM d h:mm a")}
        />
        <FocusMetric
          icon={<Flag size={17} />}
          label="Urgency"
          value={overdue ? "Overdue" : `${formatHours(task.hours_remaining)} left`}
        />
        <FocusMetric
          icon={<Percent size={17} />}
          label="Progress"
          value={`${clampProgress(task.progress_percent)}% complete`}
        />
        <FocusMetric
          icon={<Command size={17} />}
          label="Score"
          value={task.priority_score.toFixed(3)}
        />
      </div>
      <ProgressEditor
        task={task}
        remainingHours={remainingHours}
        onEstimate={onEstimate}
        onProgress={onProgress}
        onRemainingOverride={onRemainingOverride}
      />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onSnooze(task.id)}>
          <Clock3 size={16} />
          Snooze
        </Button>
        <Button variant="success" onClick={() => onComplete(task.id)}>
          <Check size={16} />
          Done
        </Button>
      </div>
    </Panel>
  );
}

function FocusMetric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/12 bg-white/8 p-3">
      <div className="mb-1 flex items-center gap-2 text-white/55">
        {icon}
        <span className="text-xs font-semibold uppercase">{label}</span>
      </div>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function ProgressEditor({
  task,
  remainingHours,
  onEstimate,
  onProgress,
  onRemainingOverride
}: {
  task: TaskWithPriority;
  remainingHours: number;
  onEstimate: (taskId: string, delta: number) => void;
  onProgress: (taskId: string, progress: number) => void;
  onRemainingOverride: (taskId: string, remainingHours: number | null) => void;
}) {
  const progress = clampProgress(task.progress_percent);
  const hasOverride = task.remaining_hours_override !== null;

  return (
    <div className="mt-5 rounded-md border border-white/12 bg-white/8 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white/68">
          <SlidersHorizontal size={16} />
          <p className="text-xs font-semibold uppercase">Progress tracker</p>
        </div>
        <Badge tone="neutral">{formatHours(remainingHours)} left</Badge>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={progress}
        aria-label="Task progress"
        onChange={(event) => onProgress(task.id, Number(event.target.value))}
        className="h-2 w-full accent-sky"
      />

      <div className="mt-3 grid grid-cols-5 gap-1">
        {[0, 25, 50, 75, 100].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onProgress(task.id, value)}
            className={cn(
              "h-8 rounded-sm border border-white/12 bg-white/8 text-xs font-semibold text-white/80 transition hover:bg-white/16",
              progress === value && "border-sky bg-sky text-white"
            )}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-white/12 bg-white/8 p-2">
          <p className="mb-2 text-xs font-semibold uppercase text-white/52">
            Total estimate
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reduce total estimate"
              onClick={() => onEstimate(task.id, -0.5)}
              className="bg-white/8 text-white hover:bg-white/16 hover:text-white"
            >
              -
            </Button>
            <p className="flex-1 text-center text-sm font-semibold">
              {formatHours(getTaskTotalHours(task))}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Increase total estimate"
              onClick={() => onEstimate(task.id, 0.5)}
              className="bg-white/8 text-white hover:bg-white/16 hover:text-white"
            >
              +
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-white/12 bg-white/8 p-2">
          <label className="flex items-center justify-between gap-3 text-xs font-semibold uppercase text-white/52">
            Manual left
            <input
              type="checkbox"
              checked={hasOverride}
              onChange={(event) =>
                onRemainingOverride(
                  task.id,
                  event.target.checked ? remainingHours : null
                )
              }
              className="h-4 w-4 accent-sky"
            />
          </label>
          <Input
            type="number"
            min={0}
            step={0.5}
            disabled={!hasOverride}
            value={hasOverride ? task.remaining_hours_override ?? 0 : remainingHours}
            onChange={(event) =>
              onRemainingOverride(task.id, Number(event.target.value))
            }
            className="mt-2 h-9 border-white/12 bg-white/10 text-white placeholder:text-white/40 disabled:opacity-45"
          />
        </div>
      </div>
    </div>
  );
}

function CalendarView({
  blocks,
  tasks,
  getCourse,
  status,
  syncMessage,
  hasGoogleToken,
  onRefresh,
  onGoogleSignIn,
  onSignOut,
  onManualSync
}: {
  blocks: CalendarBlock[];
  tasks: Task[];
  getCourse: (courseId: string | null) => Course;
  status: DashboardSeedData["integrationStatus"];
  syncMessage: string | null;
  hasGoogleToken: boolean;
  onRefresh: () => void;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onManualSync: () => void;
}) {
  const mergedBlocks = [
    ...blocks,
    ...tasks.map(taskToDeadlineBlock)
  ].sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());

  return (
    <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-moss">
              Master calendar
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Google events and FlowState deadlines
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button size="sm" onClick={onManualSync}>
              <CalendarDays size={15} />
              Sync deadlines
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          {mergedBlocks.map((block) => {
            const course = getCourse(block.course_id ?? null);

            return (
              <article
                key={block.id}
                className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-white p-3"
              >
                <div className="text-xs font-semibold text-muted">
                  <p>{format(parseISO(block.start), "MMM d")}</p>
                  <p>{format(parseISO(block.start), "h:mm a")}</p>
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: course.color }}
                    />
                    <h3 className="truncate text-sm font-semibold">
                      {block.title}
                    </h3>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {block.is_readonly
                      ? "Read-only Google Calendar event"
                      : "FlowState deadline"}
                  </p>
                </div>
                <Badge tone={block.kind === "deadline" ? "gold" : "neutral"}>
                  {eventKindLabel(block.kind)}
                </Badge>
              </article>
            );
          })}
          {mergedBlocks.length === 0 ? (
            <EmptyState
              title="No calendar items"
              body="Connect Google Calendar or add deadlines to fill this view."
            />
          ) : null}
        </div>
      </Panel>
      <SettingsPanel
        status={status}
        syncMessage={syncMessage}
        hasSupabase={Boolean(supabase)}
        hasGoogleToken={hasGoogleToken}
        onGoogleSignIn={onGoogleSignIn}
        onSignOut={onSignOut}
        onManualSync={onManualSync}
      />
    </section>
  );
}

function CoursesView({
  courses,
  tasks,
  onOpenTasks
}: {
  courses: Course[];
  tasks: Task[];
  onOpenTasks: (courseId: string) => void;
}) {
  return (
    <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => {
        const courseTasks = tasks.filter((task) => task.course_id === course.id);
        const open = courseTasks.filter((task) => !task.is_completed);
        const effort = open.reduce(
          (sum, task) => sum + getTaskRemainingHours(task),
          0
        );

        return (
          <Panel key={course.id}>
            <div
              className="mb-4 h-2 w-20 rounded-full"
              style={{ backgroundColor: course.color }}
            />
            <h2 className="text-xl font-semibold">{course.name}</h2>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Open" value={String(open.length)} tone="ink" />
              <Stat label="Done" value={String(courseTasks.length - open.length)} tone="sky" />
              <Stat label="Effort" value={`${effort}h`} tone="coral" />
            </div>
            <Button
              className="mt-4 w-full"
              variant="secondary"
              onClick={() => onOpenTasks(course.id)}
            >
              <ListChecks size={16} />
              View tasks
            </Button>
          </Panel>
        );
      })}
    </section>
  );
}

function SettingsPanel({
  status,
  syncMessage,
  hasSupabase,
  hasGoogleToken,
  onGoogleSignIn,
  onSignOut,
  onManualSync
}: {
  status: DashboardSeedData["integrationStatus"];
  syncMessage?: string | null;
  hasSupabase?: boolean;
  hasGoogleToken?: boolean;
  onGoogleSignIn?: () => void;
  onSignOut?: () => void;
  onManualSync?: () => void;
}) {
  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-moss">
            Integrations
          </p>
          <h2 className="mt-1 text-lg font-semibold">Connection status</h2>
        </div>
        <Settings size={20} className="text-moss" />
      </div>
      <div className="grid gap-2">
        <IntegrationRow
          label="Supabase"
          status={status.supabase === "connected" ? "Connected" : "Seeded demo"}
          connected={status.supabase === "connected"}
        />
        <IntegrationRow
          label="Google Calendar"
          status={calendarStatusText[status.googleCalendar]}
          connected={status.googleCalendar === "connected"}
        />
      </div>
      <div className="mt-4 grid gap-2">
        <Button
          variant={hasGoogleToken ? "secondary" : "primary"}
          onClick={onGoogleSignIn}
          disabled={!hasSupabase}
        >
          <LogIn size={16} />
          {hasGoogleToken ? "Reconnect Google" : "Connect Google Calendar"}
        </Button>
        <Button variant="secondary" onClick={onManualSync} disabled={!hasGoogleToken}>
          <RefreshCw size={16} />
          Manual sync
        </Button>
        {hasSupabase ? (
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        ) : null}
      </div>
      {syncMessage ? (
        <Badge
          tone={status.googleCalendar === "error" ? "coral" : "sky"}
          className="mt-4"
        >
          {syncMessage}
        </Badge>
      ) : null}
      {!hasSupabase ? (
        <p className="mt-3 text-sm text-muted">
          Add Supabase environment variables to enable auth and live sync.
        </p>
      ) : null}
    </Panel>
  );
}

function IntegrationRow({
  label,
  status,
  connected
}: {
  label: string;
  status: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-muted/50 p-3">
      <p className="min-w-0 truncate text-sm font-semibold">{label}</p>
      <Badge tone={connected ? "moss" : "gold"}>{status}</Badge>
    </div>
  );
}

function CommandDialog({
  open,
  parserState,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  parserState: { confidence: ParserConfidence; message: string } | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [quickText, setQuickText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quickText.trim()) {
      return;
    }

    setIsParsing(true);
    await onSubmit(quickText);
    setQuickText("");
    setIsParsing(false);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-md" />
        <Dialog.Content className="fixed left-1/2 top-20 z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 rounded-lg border border-white/90 bg-white p-3 shadow-panel">
          <div className="mb-2 flex items-center justify-between px-2">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={17} />
              Quick-drop
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close quick-drop">
                <X size={17} />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              value={quickText}
              onChange={(event) => setQuickText(event.target.value)}
              placeholder="PSTAT 120A homework due tomorrow 5pm, 2 hours"
              className="h-13 text-base"
            />
            <Button type="submit" disabled={isParsing} className="h-13 sm:w-28">
              <Plus size={18} />
              {isParsing ? "Parsing" : "Add"}
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 px-2 text-xs text-muted">
            <Badge tone={parserState?.confidence === "failed" ? "coral" : "sky"}>
              {parserState?.message ?? "AI parser ready, fallback parser available."}
            </Badge>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EmptyState({
  title,
  body,
  inverse
}: {
  title: string;
  body: string;
  inverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-line bg-surface-muted/45 p-5 text-center",
        inverse && "border-white/15 bg-white/8"
      )}
    >
      <p className={cn("font-semibold", inverse && "text-white")}>{title}</p>
      <p className={cn("mt-1 text-sm text-muted", inverse && "text-white/60")}>
        {body}
      </p>
    </div>
  );
}

function taskToDeadlineBlock(task: Task): CalendarBlock {
  return {
    id: `deadline-${task.id}`,
    title: task.title,
    start: task.due_date,
    end: task.due_date,
    course_id: task.course_id,
    kind: "deadline"
  };
}

function eventKindLabel(kind: CalendarBlock["kind"]) {
  const labels = {
    class: "Class",
    exam: "Exam",
    personal: "Event",
    deadline: "Deadline"
  };

  return labels[kind];
}

function formatHours(hours: number) {
  if (hours < 1) {
    return "<1h";
  }

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  return `${Math.round(hours / 24)}d`;
}
