import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Plus,
  RefreshCw,
  Scissors,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppState,
  formatIssueKey,
  getTaskStatus,
  IssueStatus,
  SPRINT_SLOTS,
  SprintData,
  SprintTask,
} from './data/sprintPlan';
import {
  getSyncConfig,
  loadLocalState,
  pullStateFromCloud,
  pushStateToCloud,
  saveLocalState,
  saveSyncConfig,
  subscribeToCloudChanges,
  SUPABASE_SETUP_SQL,
  SyncConfig,
} from './lib/supabaseSync';

type JiraMenu = 'board' | 'backlog';

const STATUS_META: Record<
  IssueStatus,
  { label: string; lozengeClass: string; columnTitle: string }
> = {
  todo: {
    label: '할 일',
    lozengeClass: 'bg-[#DFE1E6] text-[#42526E]',
    columnTitle: 'TO DO · 할 일',
  },
  in_progress: {
    label: '진행 중',
    lozengeClass: 'bg-[#DEEBFF] text-[#0747A6]',
    columnTitle: 'IN PROGRESS · 진행 중',
  },
  done: {
    label: '완료',
    lozengeClass: 'bg-[#E3FCEF] text-[#006644]',
    columnTitle: 'DONE · 완료',
  },
};

function detectDefaultSprintId(sprints: SprintData[]): number {
  const today = new Date().toISOString().slice(0, 10);
  for (const sp of sprints) {
    if (today >= sp.startDate && today <= sp.endDate) {
      return sp.id;
    }
  }
  const firstUnfinished = sprints.find((s) => s.retro.goalAchieved === null);
  return firstUnfinished ? firstUnfinished.id : 1;
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadLocalState());
  const [activeMenu, setActiveMenu] = useState<JiraMenu>('board');
  const [activeSprintId, setActiveSprintId] = useState<number>(() =>
    detectDefaultSprintId(loadLocalState().sprints)
  );
  const [mobileColumnFilter, setMobileColumnFilter] = useState<'all' | IssueStatus>('all');

  // Backlog expanded sprint IDs (default: D-day(0) + current sprint + next sprint)
  const [expandedSprints, setExpandedSprints] = useState<Record<number, boolean>>(() => {
    const def = detectDefaultSprintId(loadLocalState().sprints);
    return { 0: true, [def]: true, [Math.min(13, def + 1)]: true };
  });

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Create issue inline state
  const [creatingInSprintId, setCreatingInSprintId] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskHours, setNewTaskHours] = useState<string>('1');
  const [newTaskSlot, setNewTaskSlot] = useState<string>('1주 토');

  // Complete Sprint Modal state
  const [showCompleteModal, setShowCompleteModal] = useState<boolean>(false);
  const [modalActualHours, setModalActualHours] = useState<string>('0');
  const [modalFunScore, setModalFunScore] = useState<number | null>(null);
  const [modalGoalAchieved, setModalGoalAchieved] = useState<boolean>(true);
  const [modalKeep, setModalKeep] = useState<string>('');
  const [modalProblem, setModalProblem] = useState<string>('');
  const [modalTry, setModalTry] = useState<string>('');
  const [modalGithubUrl, setModalGithubUrl] = useState<string>('');
  const [modalRolloverUnfinished, setModalRolloverUnfinished] = useState<boolean>(true);

  // Sync state
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => getSyncConfig());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const isCloudConfigured = Boolean(
    syncConfig.supabaseUrl.trim() && syncConfig.supabaseAnonKey.trim()
  );

  // Supabase Realtime & Focus Sync
  useEffect(() => {
    if (!isCloudConfigured) return;
    let cancelled = false;

    const syncFromRemote = () => {
      setSyncStatus('syncing');
      pullStateFromCloud(syncConfig).then((res) => {
        if (cancelled) return;
        if (res.ok && res.state) {
          setState((prev) => {
            const localTime = new Date(prev.updatedAt || 0).getTime();
            const remoteTime = new Date(res.state!.updatedAt || 0).getTime();
            if (remoteTime > localTime) {
              saveLocalState(res.state!);
              return res.state!;
            }
            return prev;
          });
          setSyncStatus('synced');
        } else if (!res.ok) {
          setSyncStatus('error');
        } else {
          setSyncStatus('synced');
        }
      });
    };

    syncFromRemote();

    const unsubscribe = subscribeToCloudChanges(syncConfig, (remoteState) => {
      if (cancelled) return;
      setState((prev) => {
        const localTime = new Date(prev.updatedAt || 0).getTime();
        const remoteTime = new Date(remoteState.updatedAt || 0).getTime();
        if (remoteTime > localTime) {
          saveLocalState(remoteState);
          setSyncStatus('synced');
          return remoteState;
        }
        return prev;
      });
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncFromRemote();
    };
    window.addEventListener('focus', syncFromRemote);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      window.removeEventListener('focus', syncFromRemote);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isCloudConfigured, syncConfig.supabaseUrl, syncConfig.supabaseAnonKey, syncConfig.syncKey]);

  const syncTimeoutRef = useRef<number | null>(null);

  const updateAppState = (updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = {
        ...updater(prev),
        updatedAt: new Date().toISOString(),
      };
      saveLocalState(next);

      if (syncConfig.supabaseUrl.trim() && syncConfig.supabaseAnonKey.trim()) {
        setSyncStatus('syncing');
        if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = window.setTimeout(() => {
          pushStateToCloud(next, syncConfig).then((res) => {
            setSyncStatus(res.ok ? 'synced' : 'error');
          });
        }, 400);
      }
      return next;
    });
  };

  const activeSprint = useMemo(
    () => state.sprints.find((s) => s.id === activeSprintId) || state.sprints[0],
    [state.sprints, activeSprintId]
  );

  const getEffectiveTargetHours = (sp: SprintData): number => {
    if (sp.id === 5) {
      let h = 7;
      if (sp.minMaintenanceWeek1) h -= 2;
      if (sp.minMaintenanceWeek2) h -= 1;
      return Math.max(2, h);
    }
    let h = sp.targetHours;
    if (sp.minMaintenanceWeek1) h -= 4;
    if (sp.minMaintenanceWeek2) h -= 4;
    return Math.max(2, h);
  };

  const getSprintHourBreakdown = (sp: SprintData) => {
    let todoH = 0;
    let inProgressH = 0;
    let doneH = 0;
    sp.tasks.forEach((t) => {
      const st = getTaskStatus(t);
      if (st === 'done') doneH += t.hours;
      else if (st === 'in_progress') inProgressH += t.hours;
      else todoH += t.hours;
    });
    return {
      todoH: Math.round(todoH * 10) / 10,
      inProgressH: Math.round(inProgressH * 10) / 10,
      doneH: Math.round(doneH * 10) / 10,
    };
  };

  // Update task status & auto-calculate actualHours from DONE tasks
  const setTaskStatus = (sprintId: number, taskId: string, nextStatus: IssueStatus) => {
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) => {
        if (sp.id !== sprintId) return sp;
        const updatedTasks = sp.tasks.map((t) =>
          t.id === taskId ? { ...t, status: nextStatus, done: nextStatus === 'done' } : t
        );
        const autoDoneHours =
          Math.round(
            updatedTasks
              .filter((t) => getTaskStatus(t) === 'done')
              .reduce((sum, t) => sum + t.hours, 0) * 10
          ) / 10;
        return {
          ...sp,
          tasks: updatedTasks,
          retro: {
            ...sp.retro,
            actualHours: autoDoneHours,
          },
        };
      }),
    }));
  };

  const setDDayStatus = (id: string, nextStatus: IssueStatus) => {
    updateAppState((prev) => ({
      ...prev,
      dDayChecklist: prev.dDayChecklist.map((item) =>
        item.id === id ? { ...item, status: nextStatus, done: nextStatus === 'done' } : item
      ),
    }));
  };

  const halveTaskScope = (sprintId: number, taskId: string) => {
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) =>
        sp.id !== sprintId
          ? sp
          : {
              ...sp,
              tasks: sp.tasks.map((t) => {
                if (t.id !== taskId) return t;
                const newHours = Math.max(0.5, Math.round((t.hours / 2) * 10) / 10);
                return {
                  ...t,
                  hours: newHours,
                  halved: true,
                  title: t.title.startsWith('[1/2 축소] ') ? t.title : `[1/2 축소] ${t.title}`,
                };
              }),
            }
      ),
    }));
  };

  const addIssueToSprint = (sprintId: number) => {
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    const hoursNum = Math.max(0.5, parseFloat(newTaskHours) || 1);
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) =>
        sp.id !== sprintId
          ? sp
          : {
              ...sp,
              tasks: [
                ...sp.tasks,
                {
                  id: `custom-${Date.now()}`,
                  title: trimmed,
                  hours: hoursNum,
                  slot: newTaskSlot,
                  done: false,
                  status: 'todo',
                  rolloverCount: 0,
                },
              ],
            }
      ),
    }));
    setNewTaskTitle('');
    setCreatingInSprintId(null);
  };

  const deleteIssue = (sprintId: number, taskId: string) => {
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) =>
        sp.id !== sprintId ? sp : { ...sp, tasks: sp.tasks.filter((t) => t.id !== taskId) }
      ),
    }));
  };

  // Open Jira "Complete Sprint" Modal
  const openCompleteSprintModal = () => {
    const { doneH } = getSprintHourBreakdown(activeSprint);
    const initialHours =
      activeSprint.retro.actualHours > 0 ? activeSprint.retro.actualHours : doneH;
    setModalActualHours(String(initialHours));
    setModalFunScore(activeSprint.retro.funScore ?? 4);
    setModalGoalAchieved(activeSprint.retro.goalAchieved ?? true);
    setModalKeep(activeSprint.retro.keep);
    setModalProblem(activeSprint.retro.problem);
    setModalTry(activeSprint.retro.tryText);
    setModalGithubUrl(activeSprint.retro.githubUrl);
    setModalRolloverUnfinished(true);
    setShowCompleteModal(true);
  };

  // Confirm Jira "Complete Sprint"
  const handleCompleteSprint = () => {
    const currentId = activeSprint.id;
    const finalHours = parseFloat(modalActualHours) || 0;

    updateAppState((prev) => {
      const sourceSprint = prev.sprints.find((s) => s.id === currentId);
      if (!sourceSprint) return prev;

      const unfinished = sourceSprint.tasks.filter(
        (t) =>
          getTaskStatus(t) !== 'done' &&
          !t.title.includes('버퍼') &&
          !t.title.includes('회고')
      );
      const unfinishedIds = new Set(unfinished.map((t) => t.id));

      const movedTasks: SprintTask[] =
        modalRolloverUnfinished && currentId < 13
          ? unfinished.map((t) => {
              const nextCount = (t.rolloverCount || 0) + 1;
              return {
                ...t,
                id: `${t.id}-r${nextCount}`,
                status: 'todo',
                done: false,
                rolloverCount: nextCount,
                slot: '1주 토 (이월)',
              };
            })
          : [];

      return {
        ...prev,
        sprints: prev.sprints.map((sp) => {
          if (sp.id === currentId) {
            return {
              ...sp,
              tasks:
                modalRolloverUnfinished && currentId < 13
                  ? sp.tasks.filter((t) => !unfinishedIds.has(t.id))
                  : sp.tasks,
              retro: {
                keep: modalKeep,
                problem: modalProblem,
                tryText: modalTry,
                funScore: modalFunScore,
                actualHours: finalHours,
                goalAchieved: modalGoalAchieved,
                githubUrl: modalGithubUrl,
              },
            };
          }
          if (sp.id === currentId + 1 && movedTasks.length > 0) {
            return {
              ...sp,
              tasks: [...movedTasks, ...sp.tasks],
            };
          }
          return sp;
        }),
      };
    });

    setShowCompleteModal(false);
    if (currentId < 13) {
      setActiveSprintId(currentId + 1);
    }
  };

  const s1ToS6Stats = useMemo(() => {
    const firstSix = state.sprints.slice(0, 6);
    const scored = firstSix.filter((s) => s.retro.funScore !== null);
    const avgFun =
      scored.length > 0
        ? Math.round(
            (scored.reduce((acc, s) => acc + (s.retro.funScore || 0), 0) / scored.length) * 10
          ) / 10
        : null;
    const totalHours6 = firstSix.reduce((acc, s) => acc + (s.retro.actualHours || 0), 0);
    const avgWeeklyHours = Math.round((totalHours6 / 12) * 10) / 10;
    return { avgFun, avgWeeklyHours };
  }, [state.sprints]);

  const exportBackupJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jira-sprint-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (parsed && Array.isArray(parsed.sprints)) {
          updateAppState(() => parsed);
        }
      } catch {
        alert('올바른 JSON 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  };

  const activeHours = getSprintHourBreakdown(activeSprint);
  const activeTargetH = getEffectiveTargetHours(activeSprint);

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#172B4D]">
      {/* Jira Top Global Bar */}
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-[#DFE1E6] px-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Project Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[3px] bg-[#0052CC] flex items-center justify-center text-white font-bold text-xs">
              AI
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-[#172B4D]">AI 전환 스프린트</div>
              <div className="text-[11px] text-[#5E6C84] hidden sm:block">Scrum Software Project</div>
            </div>
          </div>

          {/* 2 Jira Scrum Menus: 활성 스프린트 / 백로그 */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveMenu('board')}
              className={`px-3 py-1.5 rounded-[3px] text-sm font-medium transition relative ${
                activeMenu === 'board'
                  ? 'text-[#0052CC] bg-[#DEEBFF]/60'
                  : 'text-[#42526E] hover:bg-[#F4F5F7]'
              }`}
            >
              활성 스프린트
              {activeMenu === 'board' && (
                <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[#0052CC]" />
              )}
            </button>
            <button
              onClick={() => setActiveMenu('backlog')}
              className={`px-3 py-1.5 rounded-[3px] text-sm font-medium transition relative ${
                activeMenu === 'backlog'
                  ? 'text-[#0052CC] bg-[#DEEBFF]/60'
                  : 'text-[#42526E] hover:bg-[#F4F5F7]'
              }`}
            >
              백로그
              {activeMenu === 'backlog' && (
                <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[#0052CC]" />
              )}
            </button>
          </nav>
        </div>

        {/* Right: Sync Status & Settings */}
        <button
          onClick={() => setShowSettingsModal(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[3px] bg-[#F4F5F7] hover:bg-[#EBECF0] text-xs font-medium text-[#42526E] transition"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              !isCloudConfigured
                ? 'bg-[#A5ADBA]'
                : syncStatus === 'error'
                ? 'bg-[#DE350B]'
                : syncStatus === 'syncing'
                ? 'bg-[#FFAB00]'
                : 'bg-[#36B37E]'
            }`}
          />
          <span className="hidden sm:inline">
            {isCloudConfigured ? 'Supabase 연동' : '동기화 설정'}
          </span>
          <Settings className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* MENU 1: ACTIVE SPRINT (칸반: 할 일 / 진행 중 / 완료) */}
      {activeMenu === 'board' && (
        <div className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 py-5 space-y-4">
          {/* Jira Board Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#DFE1E6]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E6C84]">
                <span>Projects / AI 전환 6개월 /</span>
                <select
                  value={activeSprint.id}
                  onChange={(e) => setActiveSprintId(Number(e.target.value))}
                  className="bg-[#F4F5F7] hover:bg-[#EBECF0] text-[#172B4D] font-semibold px-2 py-0.5 rounded-[3px] border border-[#DFE1E6] outline-none cursor-pointer"
                >
                  {state.sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.period})
                    </option>
                  ))}
                </select>
                <span>· {activeSprint.phaseName}</span>
                {activeSprint.retro.goalAchieved === true && (
                  <span className="px-1.5 py-0.5 rounded-[3px] bg-[#E3FCEF] text-[#006644] font-bold text-[11px]">
                    완료된 스프린트
                  </span>
                )}
              </div>

              <h1 className="text-lg sm:text-xl font-semibold text-[#172B4D]">
                {activeSprint.goal}
              </h1>
              <p className="text-xs text-[#5E6C84]">완료 기준 (DoD): {activeSprint.dod}</p>
            </div>

            {/* Right: Hour Counters + Min Maintenance + Complete Sprint Button */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
              {/* Jira Estimation Badges */}
              <div className="flex items-center gap-1.5 text-xs font-semibold mr-1">
                <span
                  className="px-2 py-0.5 rounded-full bg-[#DFE1E6] text-[#42526E]"
                  title="할 일 시간"
                >
                  할 일 {activeHours.todoH}h
                </span>
                <span
                  className="px-2 py-0.5 rounded-full bg-[#DEEBFF] text-[#0747A6]"
                  title="진행 중 시간"
                >
                  진행 중 {activeHours.inProgressH}h
                </span>
                <span
                  className="px-2 py-0.5 rounded-full bg-[#E3FCEF] text-[#006644]"
                  title="완료 시간 (자동 합산)"
                >
                  완료 {activeHours.doneH}h / {activeTargetH}h
                </span>
              </div>

              <button
                onClick={() =>
                  updateAppState((prev) => ({
                    ...prev,
                    sprints: prev.sprints.map((s) =>
                      s.id === activeSprint.id
                        ? { ...s, minMaintenanceWeek1: !s.minMaintenanceWeek1 }
                        : s
                    ),
                  }))
                }
                className={`px-2.5 py-1.5 rounded-[3px] text-xs font-medium transition ${
                  activeSprint.minMaintenanceWeek1
                    ? 'bg-[#FFEBE6] text-[#BF2600] border border-[#FFBDAD]'
                    : 'bg-[#F4F5F7] text-[#42526E] hover:bg-[#EBECF0]'
                }`}
              >
                1주 최소유지
              </button>
              <button
                onClick={() =>
                  updateAppState((prev) => ({
                    ...prev,
                    sprints: prev.sprints.map((s) =>
                      s.id === activeSprint.id
                        ? { ...s, minMaintenanceWeek2: !s.minMaintenanceWeek2 }
                        : s
                    ),
                  }))
                }
                className={`px-2.5 py-1.5 rounded-[3px] text-xs font-medium transition ${
                  activeSprint.minMaintenanceWeek2
                    ? 'bg-[#FFEBE6] text-[#BF2600] border border-[#FFBDAD]'
                    : 'bg-[#F4F5F7] text-[#42526E] hover:bg-[#EBECF0]'
                }`}
              >
                2주 최소유지
              </button>

              <button
                onClick={openCompleteSprintModal}
                className="px-3 py-1.5 rounded-[3px] bg-[#0052CC] hover:bg-[#0065FF] text-white text-xs font-semibold transition shadow-sm"
              >
                스프린트 완료
              </button>
            </div>
          </div>

          {/* Mobile Status Filter Pills */}
          <div className="flex md:hidden items-center gap-1 bg-[#F4F5F7] p-1 rounded-[3px]">
            {(
              [
                { key: 'all', label: `전체 (${activeSprint.tasks.length})` },
                {
                  key: 'todo',
                  label: `할 일 (${
                    activeSprint.tasks.filter((t) => getTaskStatus(t) === 'todo').length
                  })`,
                },
                {
                  key: 'in_progress',
                  label: `진행 중 (${
                    activeSprint.tasks.filter((t) => getTaskStatus(t) === 'in_progress').length
                  })`,
                },
                {
                  key: 'done',
                  label: `완료 (${
                    activeSprint.tasks.filter((t) => getTaskStatus(t) === 'done').length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMobileColumnFilter(tab.key)}
                className={`flex-1 py-1.5 rounded-[3px] text-xs font-medium ${
                  mobileColumnFilter === tab.key
                    ? 'bg-white text-[#0052CC] shadow-sm'
                    : 'text-[#5E6C84]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 3 Jira Kanban Columns */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            {(['todo', 'in_progress', 'done'] as const).map((colStatus) => {
              if (mobileColumnFilter !== 'all' && mobileColumnFilter !== colStatus) {
                return null;
              }
              const colTasks = activeSprint.tasks.filter((t) => getTaskStatus(t) === colStatus);
              const colHours =
                Math.round(colTasks.reduce((acc, t) => acc + t.hours, 0) * 10) / 10;

              return (
                <div
                  key={colStatus}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedTaskId) {
                      setTaskStatus(activeSprint.id, draggedTaskId, colStatus);
                      setDraggedTaskId(null);
                    }
                  }}
                  className="bg-[#F4F5F7] rounded-[3px] p-2.5 min-h-[420px] flex flex-col"
                >
                  {/* Column Header */}
                  <div className="px-1.5 py-1.5 mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#5E6C84] uppercase tracking-wider">
                      {STATUS_META[colStatus].columnTitle}{' '}
                      <span className="font-normal ml-1">{colTasks.length}</span>
                    </span>
                    <span className="text-xs font-semibold text-[#5E6C84]">{colHours}h</span>
                  </div>

                  {/* Issue Cards */}
                  <div className="space-y-2 flex-1">
                    {colTasks.map((task) => {
                      const taskIndex = activeSprint.tasks.findIndex((x) => x.id === task.id);
                      const issueKey = formatIssueKey(activeSprint.id, taskIndex, task.id);
                      const isDoubleRollover = task.rolloverCount >= 2;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggedTaskId(task.id)}
                          className="bg-white rounded-[3px] p-3 shadow-[0_1px_2px_rgba(9,30,66,0.18)] border border-transparent hover:border-[#4C9AFF] transition cursor-grab active:cursor-grabbing space-y-2.5"
                        >
                          <div
                            className={`text-sm leading-snug ${
                              colStatus === 'done'
                                ? 'line-through text-[#6B778C]'
                                : 'text-[#172B4D]'
                            }`}
                          >
                            {task.title}
                          </div>

                          {/* Rollover Lozenge */}
                          {task.rolloverCount > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase ${
                                  isDoubleRollover
                                    ? 'bg-[#FFEBE6] text-[#BF2600]'
                                    : 'bg-[#FFFAE6] text-[#974F0C]'
                                }`}
                              >
                                {task.rolloverCount}회 이월됨
                              </span>
                              {isDoubleRollover && !task.halved && (
                                <button
                                  onClick={() => halveTaskScope(activeSprint.id, task.id)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] bg-[#DE350B] text-white text-[10px] font-semibold"
                                >
                                  <Scissors className="w-2.5 h-2.5" />
                                  <span>범위 1/2 축소</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Card Footer: Key + Slot + Story Hours + Status Switcher */}
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5">
                              <CheckSquare className="w-3.5 h-3.5 text-[#4BADE8] shrink-0" />
                              <span className="text-xs font-semibold text-[#5E6C84]">
                                {issueKey}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded-[3px] bg-[#F4F5F7] text-[#42526E] text-[11px] font-medium">
                                {task.slot}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-[#DFE1E6] text-[#172B4D] text-[11px] font-bold">
                                {task.hours}h
                              </span>
                              <select
                                value={colStatus}
                                onChange={(e) =>
                                  setTaskStatus(
                                    activeSprint.id,
                                    task.id,
                                    e.target.value as IssueStatus
                                  )
                                }
                                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-[3px] cursor-pointer outline-none ${STATUS_META[colStatus].lozengeClass}`}
                              >
                                <option value="todo">할 일</option>
                                <option value="in_progress">진행 중</option>
                                <option value="done">완료</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Create Issue in Todo Column */}
                  {colStatus === 'todo' && (
                    <div className="mt-2 pt-1">
                      {creatingInSprintId === activeSprint.id ? (
                        <div className="bg-white p-2 rounded-[3px] shadow-sm border border-[#0052CC] space-y-2">
                          <input
                            type="text"
                            autoFocus
                            placeholder="무엇을 해야 하나요?"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === 'Enter' && addIssueToSprint(activeSprint.id)
                            }
                            className="w-full text-xs outline-none text-[#172B4D]"
                          />
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <select
                                value={newTaskSlot}
                                onChange={(e) => setNewTaskSlot(e.target.value)}
                                className="text-[11px] bg-[#F4F5F7] px-1.5 py-0.5 rounded-[3px]"
                              >
                                {SPRINT_SLOTS.map((s) => (
                                  <option key={s.key} value={s.key}>
                                    {s.key}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                value={newTaskHours}
                                onChange={(e) => setNewTaskHours(e.target.value)}
                                className="w-12 text-[11px] bg-[#F4F5F7] px-1.5 py-0.5 rounded-[3px] text-center"
                              />
                              <span className="text-[11px] text-[#5E6C84]">h</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setCreatingInSprintId(null)}
                                className="px-2 py-0.5 text-[11px] text-[#5E6C84]"
                              >
                                취소
                              </button>
                              <button
                                onClick={() => addIssueToSprint(activeSprint.id)}
                                className="px-2 py-0.5 rounded-[3px] bg-[#0052CC] text-white text-[11px] font-semibold"
                              >
                                만들기
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingInSprintId(activeSprint.id)}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-[3px] hover:bg-[#EBECF0] text-xs font-medium text-[#42526E] transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>이슈 만들기</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MENU 2: BACKLOG (백로그: D-day + S1~S13 접이식 리스트) */}
      {activeMenu === 'backlog' && (
        <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-5 space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <div className="text-xs text-[#5E6C84]">Projects / AI 전환 6개월</div>
              <h1 className="text-lg font-semibold text-[#172B4D]">백로그 (S1 – S13)</h1>
            </div>
          </div>

          {/* Sprint 0: D-day Checklist Block */}
          <div className="bg-[#F4F5F7] rounded-[3px] border border-[#DFE1E6] overflow-hidden">
            <div
              onClick={() => setExpandedSprints((p) => ({ ...p, 0: !p[0] }))}
              className="px-3 py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-[#EBECF0]/60"
            >
              <div className="flex items-center gap-2">
                {expandedSprints[0] ? (
                  <ChevronDown className="w-4 h-4 text-[#42526E]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#42526E]" />
                )}
                <span className="text-xs font-bold text-[#172B4D]">
                  D-day 체크리스트 · 10월 24일 (토)
                </span>
                <span className="text-xs text-[#5E6C84]">({state.dDayChecklist.length}개 이슈)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#E3FCEF] text-[#006644] text-[11px] font-bold">
                완료 {state.dDayChecklist.filter((d) => getTaskStatus(d) === 'done').length} /{' '}
                {state.dDayChecklist.length}
              </span>
            </div>

            {expandedSprints[0] && (
              <div className="bg-white divide-y divide-[#DFE1E6] border-t border-[#DFE1E6]">
                {state.dDayChecklist.map((item, idx) => {
                  const st = getTaskStatus(item);
                  return (
                    <div
                      key={item.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[#F4F5F7] text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckSquare className="w-3.5 h-3.5 text-[#4BADE8] shrink-0" />
                        <span className="font-semibold text-[#5E6C84] shrink-0">
                          AI-00{idx + 1}
                        </span>
                        <span
                          className={`truncate ${
                            st === 'done' ? 'line-through text-[#6B778C]' : 'text-[#172B4D]'
                          }`}
                        >
                          {item.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-[#DFE1E6] text-[#172B4D] text-[11px] font-bold">
                          {item.duration}
                        </span>
                        <select
                          value={st}
                          onChange={(e) =>
                            setDDayStatus(item.id, e.target.value as IssueStatus)
                          }
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-[3px] cursor-pointer outline-none ${STATUS_META[st].lozengeClass}`}
                        >
                          <option value="todo">할 일</option>
                          <option value="in_progress">진행 중</option>
                          <option value="done">완료</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sprint 1 ~ 13 Collapsible Jira Backlog Blocks */}
          {state.sprints.map((sp) => {
            const isExpanded = Boolean(expandedSprints[sp.id]);
            const hours = getSprintHourBreakdown(sp);
            const targetH = getEffectiveTargetHours(sp);

            return (
              <div
                key={sp.id}
                className="bg-[#F4F5F7] rounded-[3px] border border-[#DFE1E6] overflow-hidden"
              >
                {/* Sprint Header Bar */}
                <div
                  onClick={() => setExpandedSprints((p) => ({ ...p, [sp.id]: !p[sp.id] }))}
                  className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-[#EBECF0]/60"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#42526E] shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#42526E] shrink-0" />
                    )}
                    <span className="text-xs font-bold text-[#172B4D]">{sp.title}</span>
                    <span className="text-xs text-[#5E6C84]">{sp.period}</span>
                    <span className="text-xs font-medium text-[#172B4D] truncate">
                      — {sp.goal}
                    </span>
                    {sp.retro.goalAchieved === true && (
                      <span className="px-1.5 py-0.5 rounded-[3px] bg-[#E3FCEF] text-[#006644] text-[10px] font-bold">
                        달성 ({sp.retro.actualHours}h · 재미 {sp.retro.funScore ?? '-'}/5)
                      </span>
                    )}
                  </div>

                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="px-2 py-0.5 rounded-full bg-[#DFE1E6] text-[#42526E] text-[11px] font-bold">
                      {hours.todoH}h
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#DEEBFF] text-[#0747A6] text-[11px] font-bold">
                      {hours.inProgressH}h
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#E3FCEF] text-[#006644] text-[11px] font-bold">
                      {hours.doneH}/{targetH}h
                    </span>
                    <button
                      onClick={() => {
                        setActiveSprintId(sp.id);
                        setActiveMenu('board');
                      }}
                      className="ml-1 px-2.5 py-1 rounded-[3px] bg-white border border-[#DFE1E6] hover:bg-[#EBECF0] text-xs font-medium text-[#42526E]"
                    >
                      보드 열기
                    </button>
                  </div>
                </div>

                {/* Expanded Sprint Issue Rows */}
                {isExpanded && (
                  <div className="bg-white divide-y divide-[#DFE1E6] border-t border-[#DFE1E6]">
                    {sp.tasks.map((task, idx) => {
                      const st = getTaskStatus(task);
                      const issueKey = formatIssueKey(sp.id, idx, task.id);
                      const isDoubleRollover = task.rolloverCount >= 2;

                      return (
                        <div
                          key={task.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[#F4F5F7] text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <CheckSquare className="w-3.5 h-3.5 text-[#4BADE8] shrink-0" />
                            <span className="font-semibold text-[#5E6C84] w-14 shrink-0">
                              {issueKey}
                            </span>
                            <span
                              className={`truncate ${
                                st === 'done'
                                  ? 'line-through text-[#6B778C]'
                                  : 'text-[#172B4D]'
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.rolloverCount > 0 && (
                              <span
                                className={`px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold shrink-0 ${
                                  isDoubleRollover
                                    ? 'bg-[#FFEBE6] text-[#BF2600]'
                                    : 'bg-[#FFFAE6] text-[#974F0C]'
                                }`}
                              >
                                {task.rolloverCount}회 이월
                              </span>
                            )}
                            {isDoubleRollover && !task.halved && (
                              <button
                                onClick={() => halveTaskScope(sp.id, task.id)}
                                className="px-1.5 py-0.5 rounded-[3px] bg-[#DE350B] text-white text-[10px] font-semibold shrink-0"
                              >
                                범위 1/2 축소
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-1.5 py-0.5 rounded-[3px] bg-[#F4F5F7] text-[#42526E] text-[11px] hidden sm:inline">
                              {task.slot}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#DFE1E6] text-[#172B4D] text-[11px] font-bold w-10 text-center">
                              {task.hours}h
                            </span>
                            <select
                              value={st}
                              onChange={(e) =>
                                setTaskStatus(sp.id, task.id, e.target.value as IssueStatus)
                              }
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-[3px] cursor-pointer outline-none ${STATUS_META[st].lozengeClass}`}
                            >
                              <option value="todo">할 일</option>
                              <option value="in_progress">진행 중</option>
                              <option value="done">완료</option>
                            </select>
                            {task.id.startsWith('custom-') && (
                              <button
                                onClick={() => deleteIssue(sp.id, task.id)}
                                className="text-[#A5ADBA] hover:text-[#DE350B]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline Create Issue in Backlog */}
                    <div className="px-3 py-1.5 bg-[#FAFBFC]">
                      {creatingInSprintId === sp.id ? (
                        <div className="flex flex-wrap items-center gap-2 py-1">
                          <input
                            type="text"
                            autoFocus
                            placeholder="새 이슈 제목 입력..."
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addIssueToSprint(sp.id)}
                            className="flex-1 min-w-[180px] text-xs px-2 py-1 border border-[#0052CC] rounded-[3px] outline-none"
                          />
                          <select
                            value={newTaskSlot}
                            onChange={(e) => setNewTaskSlot(e.target.value)}
                            className="text-xs border border-[#DFE1E6] rounded-[3px] px-2 py-1 bg-white"
                          >
                            {SPRINT_SLOTS.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.key}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={newTaskHours}
                            onChange={(e) => setNewTaskHours(e.target.value)}
                            className="w-14 text-xs border border-[#DFE1E6] rounded-[3px] px-2 py-1 text-center"
                          />
                          <button
                            onClick={() => addIssueToSprint(sp.id)}
                            className="px-2.5 py-1 rounded-[3px] bg-[#0052CC] text-white text-xs font-semibold"
                          >
                            만들기
                          </button>
                          <button
                            onClick={() => setCreatingInSprintId(null)}
                            className="px-2 py-1 text-xs text-[#5E6C84]"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingInSprintId(sp.id)}
                          className="flex items-center gap-1 text-xs text-[#5E6C84] hover:text-[#172B4D] py-0.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>이슈 만들기</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Compact Milestones & 3-Month Checkpoint in Backlog Footer */}
          <div className="bg-[#F4F5F7] rounded-[3px] border border-[#DFE1E6] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#172B4D]">
              <span>마일스톤 (M1 – M4) & ★ 3개월 체크포인트</span>
              <span className="text-[#5E6C84] font-normal">
                S1–S6 평균 재미: {s1ToS6Stats.avgFun ?? '-'}/5 · 주당 평균: {s1ToS6Stats.avgWeeklyHours}h
              </span>
            </div>
            <div className="bg-white rounded-[3px] border border-[#DFE1E6] divide-y divide-[#DFE1E6] text-xs">
              {state.milestones.map((m) => (
                <div
                  key={m.id}
                  className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() =>
                        updateAppState((prev) => ({
                          ...prev,
                          milestones: prev.milestones.map((item) =>
                            item.id === m.id ? { ...item, done: !item.done } : item
                          ),
                        }))
                      }
                      className="w-3.5 h-3.5 accent-[#0052CC]"
                    />
                    <span className="px-1.5 py-0.5 rounded-[3px] bg-[#DEEBFF] text-[#0747A6] font-bold text-[11px]">
                      {m.code}
                    </span>
                    <span className={m.done ? 'line-through text-[#6B778C]' : 'font-medium'}>
                      {m.title}
                    </span>
                    <span className="text-[#5E6C84]">({m.timing})</span>
                  </label>
                  <input
                    type="text"
                    placeholder="증빙 URL / 메모"
                    value={m.evidenceUrl}
                    onChange={(e) =>
                      updateAppState((prev) => ({
                        ...prev,
                        milestones: prev.milestones.map((item) =>
                          item.id === m.id ? { ...item, evidenceUrl: e.target.value } : item
                        ),
                      }))
                    }
                    className="sm:w-56 px-2 py-1 border border-[#DFE1E6] rounded-[3px] text-xs outline-none focus:border-[#0052CC]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Jira "Complete Sprint (스프린트 완료)" Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 bg-[#091E42]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3px] max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-[#172B4D]">
              {activeSprint.title} 완료 ({activeSprint.goal})
            </h2>

            <div className="p-3 rounded-[3px] bg-[#F4F5F7] text-xs space-y-1 text-[#42526E]">
              <div>
                · 완료(DONE)된 이슈:{' '}
                <strong>
                  {activeSprint.tasks.filter((t) => getTaskStatus(t) === 'done').length}개 (자동 합산{' '}
                  {activeHours.doneH}h)
                </strong>
              </div>
              <div>
                · 미완료 이슈:{' '}
                <strong>
                  {
                    activeSprint.tasks.filter(
                      (t) =>
                        getTaskStatus(t) !== 'done' &&
                        !t.title.includes('버퍼') &&
                        !t.title.includes('회고')
                    ).length
                  }
                  개
                </strong>
              </div>
              {activeSprint.id < 13 && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer text-[#172B4D] font-medium">
                  <input
                    type="checkbox"
                    checked={modalRolloverUnfinished}
                    onChange={(e) => setModalRolloverUnfinished(e.target.checked)}
                    className="accent-[#0052CC]"
                  />
                  <span>미완료 이슈를 Sprint {activeSprint.id + 1}(다음 스프린트)로 자동 이월</span>
                </label>
              )}
            </div>

            {/* Hours + Fun Score + Goal Achieved */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">
                  총 실제 투입 시간 (h)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={modalActualHours}
                  onChange={(e) => setModalActualHours(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] font-semibold outline-none focus:border-[#0052CC]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">재미 점수 (1–5)</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setModalFunScore(n)}
                      className={`w-7 h-7 rounded-[3px] font-bold border ${
                        modalFunScore === n
                          ? 'bg-[#0052CC] text-white border-[#0052CC]'
                          : 'border-[#DFE1E6] text-[#42526E]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">DoD 목표 달성</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setModalGoalAchieved(true)}
                    className={`flex-1 py-1.5 rounded-[3px] font-bold border ${
                      modalGoalAchieved
                        ? 'bg-[#006644] text-white border-[#006644]'
                        : 'border-[#DFE1E6] text-[#42526E]'
                    }`}
                  >
                    달성
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalGoalAchieved(false)}
                    className={`flex-1 py-1.5 rounded-[3px] font-bold border ${
                      !modalGoalAchieved
                        ? 'bg-[#DE350B] text-white border-[#DE350B]'
                        : 'border-[#DFE1E6] text-[#42526E]'
                    }`}
                  >
                    미달
                  </button>
                </div>
              </div>
            </div>

            {/* KPT Retro Inputs */}
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">Keep (유지할 점)</label>
                <input
                  type="text"
                  value={modalKeep}
                  onChange={(e) => setModalKeep(e.target.value)}
                  placeholder="주말 오전 2시간 슬롯을 지킨 것..."
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] outline-none focus:border-[#0052CC]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">Problem (아쉬운 점)</label>
                <input
                  type="text"
                  value={modalProblem}
                  onChange={(e) => setModalProblem(e.target.value)}
                  placeholder="평일 야근으로 화요일 슬롯 부족..."
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] outline-none focus:border-[#0052CC]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">Try (다음 시도)</label>
                <input
                  type="text"
                  value={modalTry}
                  onChange={(e) => setModalTry(e.target.value)}
                  placeholder="버퍼 슬롯에 이월 작업 우선 배치..."
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] outline-none focus:border-[#0052CC]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">
                  결과물 링크 (GitHub 커밋 / README / 배포 URL)
                </label>
                <input
                  type="url"
                  value={modalGithubUrl}
                  onChange={(e) => setModalGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] outline-none focus:border-[#0052CC]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="px-3 py-1.5 rounded-[3px] hover:bg-[#F4F5F7] text-xs font-medium text-[#42526E]"
              >
                취소
              </button>
              <button
                onClick={handleCompleteSprint}
                className="px-4 py-1.5 rounded-[3px] bg-[#0052CC] hover:bg-[#0065FF] text-white text-xs font-semibold"
              >
                스프린트 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Sync & Backup Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-[#091E42]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[3px] max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#172B4D]">Supabase 동기화 설정</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-xs text-[#5E6C84] hover:text-[#172B4D]"
              >
                닫기
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">Supabase URL</label>
                <input
                  type="url"
                  value={syncConfig.supabaseUrl}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, supabaseUrl: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] outline-none focus:border-[#0052CC]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">Anon Key</label>
                <input
                  type="password"
                  placeholder="eyJhbGci..."
                  value={syncConfig.supabaseAnonKey}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, supabaseAnonKey: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] outline-none focus:border-[#0052CC]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5E6C84] mb-1">동기화 키</label>
                <input
                  type="text"
                  value={syncConfig.syncKey}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, syncKey: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-[3px] border border-[#DFE1E6] font-mono outline-none focus:border-[#0052CC]"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  saveSyncConfig(syncConfig);
                  const res = await pushStateToCloud(state, syncConfig);
                  if (res.ok) {
                    setSyncStatus('synced');
                    setShowSettingsModal(false);
                  } else {
                    setSyncStatus('error');
                    alert(res.error);
                  }
                }}
                className="flex-1 py-2 rounded-[3px] bg-[#0052CC] hover:bg-[#0065FF] text-white text-xs font-semibold"
              >
                저장 및 동기화
              </button>
              <button
                onClick={async () => {
                  saveSyncConfig(syncConfig);
                  const res = await pullStateFromCloud(syncConfig);
                  if (res.ok && res.state) {
                    setState(res.state);
                    saveLocalState(res.state);
                    setShowSettingsModal(false);
                  }
                }}
                className="px-3 py-2 rounded-[3px] bg-[#F4F5F7] hover:bg-[#EBECF0] text-xs text-[#42526E] inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>불러오기</span>
              </button>
            </div>

            <div className="pt-3 border-t border-[#DFE1E6] flex items-center justify-between text-xs text-[#5E6C84]">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                  alert('SQL이 복사되었습니다.');
                }}
                className="inline-flex items-center gap-1 hover:text-[#172B4D]"
              >
                <Copy className="w-3 h-3" />
                <span>초기 SQL 복사</span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={exportBackupJson}
                  className="inline-flex items-center gap-1 hover:text-[#172B4D]"
                >
                  <Download className="w-3 h-3" />
                  <span>JSON 백업</span>
                </button>
                <label className="inline-flex items-center gap-1 hover:text-[#172B4D] cursor-pointer">
                  <Upload className="w-3 h-3" />
                  <span>복원</span>
                  <input type="file" accept=".json" onChange={importBackupJson} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
