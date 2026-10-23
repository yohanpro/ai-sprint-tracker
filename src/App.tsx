import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppState,
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

type ViewTab = 'sprint' | 'overview';

function detectActiveSprintId(sprints: SprintData[]): number {
  const today = new Date().toISOString().slice(0, 10);
  for (const sp of sprints) {
    if (today >= sp.startDate && today <= sp.endDate) {
      return sp.id;
    }
  }
  if (today < sprints[0].startDate) return 0; // 0 = D-day before Oct 24
  return 13;
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadLocalState());
  const [activeTab, setActiveTab] = useState<ViewTab>('sprint');
  // 0 = D-day checklist, 1..13 = Sprint 1..13
  const [selectedSprintId, setSelectedSprintId] = useState<number>(() => {
    const detected = detectActiveSprintId(loadLocalState().sprints);
    return detected === 0 ? 1 : detected;
  });

  // Sync state
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => getSyncConfig());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Stopwatch state
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);

  // New task input
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskHours, setNewTaskHours] = useState<string>('1');
  const [newTaskSlot, setNewTaskSlot] = useState<string>('1주 토');

  const isCloudConfigured = Boolean(
    syncConfig.supabaseUrl.trim() && syncConfig.supabaseAnonKey.trim()
  );

  // Supabase Realtime & focus sync
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

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

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

  const selectedSprint = useMemo(
    () => state.sprints.find((s) => s.id === selectedSprintId) || state.sprints[0],
    [state.sprints, selectedSprintId]
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

  const toggleDDayItem = (id: string) => {
    updateAppState((prev) => ({
      ...prev,
      dDayChecklist: prev.dDayChecklist.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      ),
    }));
  };

  const toggleSprintTask = (sprintId: number, taskId: string) => {
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) =>
        sp.id !== sprintId
          ? sp
          : {
              ...sp,
              tasks: sp.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
            }
      ),
    }));
  };

  const rolloverTaskToNextSprint = (fromSprintId: number, taskId: string) => {
    if (fromSprintId >= 13) return;
    updateAppState((prev) => {
      const sourceSprint = prev.sprints.find((s) => s.id === fromSprintId);
      const taskToMove = sourceSprint?.tasks.find((t) => t.id === taskId);
      if (!taskToMove) return prev;

      const nextCount = (taskToMove.rolloverCount || 0) + 1;
      const movedTask: SprintTask = {
        ...taskToMove,
        id: `${taskToMove.id}-r${nextCount}`,
        rolloverCount: nextCount,
        slot: '이월',
      };

      return {
        ...prev,
        sprints: prev.sprints.map((sp) => {
          if (sp.id === fromSprintId) {
            return { ...sp, tasks: sp.tasks.filter((t) => t.id !== taskId) };
          }
          if (sp.id === fromSprintId + 1) {
            return { ...sp, tasks: [movedTask, ...sp.tasks] };
          }
          return sp;
        }),
      };
    });
  };

  const rolloverAllUnfinishedTasks = (fromSprintId: number) => {
    if (fromSprintId >= 13) return;
    updateAppState((prev) => {
      const sourceSprint = prev.sprints.find((s) => s.id === fromSprintId);
      if (!sourceSprint) return prev;

      const unfinished = sourceSprint.tasks.filter(
        (t) => !t.done && !t.title.includes('버퍼') && !t.title.includes('회고')
      );
      if (unfinished.length === 0) return prev;

      const unfinishedIds = new Set(unfinished.map((t) => t.id));
      const movedTasks: SprintTask[] = unfinished.map((t) => {
        const nextCount = (t.rolloverCount || 0) + 1;
        return {
          ...t,
          id: `${t.id}-r${nextCount}`,
          rolloverCount: nextCount,
          slot: '이월',
        };
      });

      return {
        ...prev,
        sprints: prev.sprints.map((sp) => {
          if (sp.id === fromSprintId) {
            return { ...sp, tasks: sp.tasks.filter((t) => !unfinishedIds.has(t.id)) };
          }
          if (sp.id === fromSprintId + 1) {
            return { ...sp, tasks: [...movedTasks, ...sp.tasks] };
          }
          return sp;
        }),
      };
    });
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

  const addCustomTask = (sprintId: number) => {
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
                  rolloverCount: 0,
                },
              ],
            }
      ),
    }));
    setNewTaskTitle('');
  };

  const deleteTask = (sprintId: number, taskId: string) => {
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) =>
        sp.id !== sprintId ? sp : { ...sp, tasks: sp.tasks.filter((t) => t.id !== taskId) }
      ),
    }));
  };

  const applyTimerToSprint = () => {
    if (timerSeconds < 60) return;
    const targetId = selectedSprintId === 0 ? 1 : selectedSprintId;
    const addedHours = Math.round((timerSeconds / 3600) * 10) / 10;
    updateAppState((prev) => ({
      ...prev,
      sprints: prev.sprints.map((sp) =>
        sp.id !== targetId
          ? sp
          : {
              ...sp,
              retro: {
                ...sp.retro,
                actualHours: Math.round(((sp.retro.actualHours || 0) + addedHours) * 10) / 10,
              },
            }
      ),
    }));
    setTimerRunning(false);
    setTimerSeconds(0);
  };

  const exportBackupJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sprint-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Minimalist Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-neutral-200">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
          {/* 2 Simple Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('sprint')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'sprint'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              현재 스프린트
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'overview'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              전체 진척표
            </button>
          </div>

          {/* Right: Minimal Timer + Sync Button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-neutral-200 rounded-md px-2 py-1 text-xs">
              <span className="font-mono text-neutral-700">{formatSeconds(timerSeconds)}</span>
              <button
                onClick={() => setTimerRunning((r) => !r)}
                className="text-neutral-700 hover:text-black p-0.5"
                title={timerRunning ? '일시정지' : '타이머 시작'}
              >
                {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              {timerSeconds >= 60 && (
                <button
                  onClick={applyTimerToSprint}
                  className="text-[11px] font-semibold underline text-neutral-900 ml-0.5"
                >
                  반영
                </button>
              )}
              {timerSeconds > 0 && (
                <button
                  onClick={() => {
                    setTimerRunning(false);
                    setTimerSeconds(0);
                  }}
                  className="text-neutral-400 hover:text-neutral-700 p-0.5"
                  title="초기화"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 text-xs text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 transition"
              title="동기화 설정"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  !isCloudConfigured
                    ? 'bg-neutral-300'
                    : syncStatus === 'error'
                    ? 'bg-red-500'
                    : syncStatus === 'syncing'
                    ? 'bg-amber-400'
                    : 'bg-neutral-900'
                }`}
              />
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20">
        {/* TAB 1: CURRENT SPRINT */}
        {activeTab === 'sprint' && (
          <div className="space-y-8">
            {/* Compact Sprint Number Strip (D-day, S1..S13) */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar border-b border-neutral-100">
              <button
                onClick={() => setSelectedSprintId(0)}
                className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 transition ${
                  selectedSprintId === 0
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                D-day
              </button>
              {state.sprints.map((sp) => {
                const isSelected = selectedSprintId === sp.id;
                const allDone = sp.tasks.length > 0 && sp.tasks.every((t) => t.done);
                return (
                  <button
                    key={sp.id}
                    onClick={() => setSelectedSprintId(sp.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 transition flex items-center gap-1 ${
                      isSelected
                        ? 'bg-neutral-900 text-white'
                        : allDone
                        ? 'text-neutral-400 line-through hover:text-neutral-800'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                    }`}
                  >
                    <span>S{sp.id}</span>
                  </button>
                );
              })}
            </div>

            {/* D-DAY VIEW */}
            {selectedSprintId === 0 ? (
              <div className="space-y-6">
                <div className="space-y-1">
                  <div className="text-xs text-neutral-400 font-medium">2026.10.24 (토)</div>
                  <h1 className="text-xl font-semibold tracking-tight">D-day 체크리스트</h1>
                </div>

                <div className="divide-y divide-neutral-100 border-t border-b border-neutral-200">
                  {state.dDayChecklist.map((item) => (
                    <label
                      key={item.id}
                      className="py-3.5 flex items-start gap-3 cursor-pointer select-none group"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleDDayItem(item.id)}
                        className="mt-0.5 w-4 h-4 rounded border-neutral-300 accent-neutral-900"
                      />
                      <span
                        className={`flex-1 text-sm leading-snug ${
                          item.done ? 'line-through text-neutral-400' : 'text-neutral-900'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-xs text-neutral-400 shrink-0">{item.duration}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              /* SPRINT 1..13 VIEW */
              <div className="space-y-8">
                {/* Sprint Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>
                      {selectedSprint.title} · {selectedSprint.period} · {selectedSprint.phaseName}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            sprints: prev.sprints.map((s) =>
                              s.id === selectedSprint.id
                                ? { ...s, minMaintenanceWeek1: !s.minMaintenanceWeek1 }
                                : s
                            ),
                          }))
                        }
                        className={`px-2 py-0.5 rounded border text-[11px] transition ${
                          selectedSprint.minMaintenanceWeek1
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        1주 최소유지
                      </button>
                      <button
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            sprints: prev.sprints.map((s) =>
                              s.id === selectedSprint.id
                                ? { ...s, minMaintenanceWeek2: !s.minMaintenanceWeek2 }
                                : s
                            ),
                          }))
                        }
                        className={`px-2 py-0.5 rounded border text-[11px] transition ${
                          selectedSprint.minMaintenanceWeek2
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        2주 최소유지
                      </button>
                    </div>
                  </div>

                  <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
                    {selectedSprint.goal}
                  </h1>

                  <p className="text-xs text-neutral-500 leading-relaxed">
                    완료 기준: {selectedSprint.dod}
                  </p>
                </div>

                {/* Task Checklist */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>
                      할 일 ({selectedSprint.tasks.filter((t) => t.done).length}/
                      {selectedSprint.tasks.length}) · 목표 {getEffectiveTargetHours(selectedSprint)}h
                    </span>
                    {selectedSprint.id < 13 && (
                      <button
                        onClick={() => rolloverAllUnfinishedTasks(selectedSprint.id)}
                        className="text-neutral-500 hover:text-neutral-900 underline"
                      >
                        미완료 일괄 이월 →
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-neutral-100 border-t border-b border-neutral-200">
                    {selectedSprint.tasks.map((task) => {
                      const isDoubleRollover = task.rolloverCount >= 2;
                      return (
                        <div
                          key={task.id}
                          className="py-3 flex items-start justify-between gap-3 group"
                        >
                          <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => toggleSprintTask(selectedSprint.id, task.id)}
                              className="mt-0.5 w-4 h-4 rounded border-neutral-300 accent-neutral-900"
                            />
                            <div className="flex-1 space-y-1">
                              <span
                                className={`text-sm leading-snug block ${
                                  task.done ? 'line-through text-neutral-400' : 'text-neutral-900'
                                }`}
                              >
                                {task.title}
                              </span>

                              {task.rolloverCount > 0 && (
                                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                                  <span>{task.rolloverCount}회 이월</span>
                                  {isDoubleRollover && !task.halved && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        halveTaskScope(selectedSprint.id, task.id);
                                      }}
                                      className="px-1.5 py-0.5 rounded bg-neutral-900 text-white font-medium"
                                    >
                                      범위 1/2 축소
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>

                          <div className="flex items-center gap-2 shrink-0 text-xs text-neutral-400">
                            <span>{task.slot}</span>
                            <span className="w-8 text-right font-mono text-neutral-600">
                              {task.hours}h
                            </span>
                            {!task.done && selectedSprint.id < 13 && (
                              <button
                                onClick={() => rolloverTaskToNextSprint(selectedSprint.id, task.id)}
                                className="text-[11px] text-neutral-400 hover:text-neutral-900 px-1"
                                title="다음 스프린트로 이월"
                              >
                                이월
                              </button>
                            )}
                            {task.id.startsWith('custom-') && (
                              <button
                                onClick={() => deleteTask(selectedSprint.id, task.id)}
                                className="text-neutral-300 hover:text-neutral-700"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Minimal Add Task Row */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="+ 할 일 추가"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomTask(selectedSprint.id)}
                      className="flex-1 text-sm py-1.5 px-2 border-b border-transparent focus:border-neutral-300 outline-none placeholder:text-neutral-400"
                    />
                    {newTaskTitle.trim() && (
                      <>
                        <select
                          value={newTaskSlot}
                          onChange={(e) => setNewTaskSlot(e.target.value)}
                          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
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
                          className="w-14 text-xs border border-neutral-200 rounded px-2 py-1 text-center"
                        />
                        <button
                          onClick={() => addCustomTask(selectedSprint.id)}
                          className="px-2.5 py-1 rounded bg-neutral-900 text-white text-xs"
                        >
                          추가
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Minimal Retro Section */}
                <div className="pt-4 border-t border-neutral-200 space-y-4">
                  <div className="text-xs font-medium text-neutral-500">회고 · 기록</div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <textarea
                      rows={2}
                      placeholder="Keep"
                      value={selectedSprint.retro.keep}
                      onChange={(e) =>
                        updateAppState((prev) => ({
                          ...prev,
                          sprints: prev.sprints.map((s) =>
                            s.id === selectedSprint.id
                              ? { ...s, retro: { ...s.retro, keep: e.target.value } }
                              : s
                          ),
                        }))
                      }
                      className="w-full p-2.5 rounded-md border border-neutral-200 text-xs outline-none focus:border-neutral-900 resize-none"
                    />
                    <textarea
                      rows={2}
                      placeholder="Problem"
                      value={selectedSprint.retro.problem}
                      onChange={(e) =>
                        updateAppState((prev) => ({
                          ...prev,
                          sprints: prev.sprints.map((s) =>
                            s.id === selectedSprint.id
                              ? { ...s, retro: { ...s.retro, problem: e.target.value } }
                              : s
                          ),
                        }))
                      }
                      className="w-full p-2.5 rounded-md border border-neutral-200 text-xs outline-none focus:border-neutral-900 resize-none"
                    />
                    <textarea
                      rows={2}
                      placeholder="Try"
                      value={selectedSprint.retro.tryText}
                      onChange={(e) =>
                        updateAppState((prev) => ({
                          ...prev,
                          sprints: prev.sprints.map((s) =>
                            s.id === selectedSprint.id
                              ? { ...s, retro: { ...s.retro, tryText: e.target.value } }
                              : s
                          ),
                        }))
                      }
                      className="w-full p-2.5 rounded-md border border-neutral-200 text-xs outline-none focus:border-neutral-900 resize-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 text-xs pt-1">
                    {/* Fun Score */}
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">재미</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            onClick={() =>
                              updateAppState((prev) => ({
                                ...prev,
                                sprints: prev.sprints.map((s) =>
                                  s.id === selectedSprint.id
                                    ? { ...s, retro: { ...s.retro, funScore: num } }
                                    : s
                                ),
                              }))
                            }
                            className={`w-6 h-6 rounded border text-xs transition ${
                              selectedSprint.retro.funScore === num
                                ? 'bg-neutral-900 text-white border-neutral-900'
                                : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Actual Hours */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500">투입</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={selectedSprint.retro.actualHours}
                        onChange={(e) =>
                          updateAppState((prev) => ({
                            ...prev,
                            sprints: prev.sprints.map((s) =>
                              s.id === selectedSprint.id
                                ? {
                                    ...s,
                                    retro: {
                                      ...s.retro,
                                      actualHours: parseFloat(e.target.value) || 0,
                                    },
                                  }
                                : s
                            ),
                          }))
                        }
                        className="w-14 px-2 py-1 rounded border border-neutral-200 text-center font-mono"
                      />
                      <span className="text-neutral-400">
                        / {getEffectiveTargetHours(selectedSprint)}h
                      </span>
                    </div>

                    {/* Goal Achieved */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-500">목표 달성</span>
                      <button
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            sprints: prev.sprints.map((s) =>
                              s.id === selectedSprint.id
                                ? { ...s, retro: { ...s.retro, goalAchieved: true } }
                                : s
                            ),
                          }))
                        }
                        className={`px-2 py-1 rounded border ${
                          selectedSprint.retro.goalAchieved === true
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        예
                      </button>
                      <button
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            sprints: prev.sprints.map((s) =>
                              s.id === selectedSprint.id
                                ? { ...s, retro: { ...s.retro, goalAchieved: false } }
                                : s
                            ),
                          }))
                        }
                        className={`px-2 py-1 rounded border ${
                          selectedSprint.retro.goalAchieved === false
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        아니오
                      </button>
                    </div>
                  </div>

                  <input
                    type="url"
                    placeholder="결과물 링크 (GitHub 커밋 / 배포 URL / 블로그)"
                    value={selectedSprint.retro.githubUrl}
                    onChange={(e) =>
                      updateAppState((prev) => ({
                        ...prev,
                        sprints: prev.sprints.map((s) =>
                          s.id === selectedSprint.id
                            ? { ...s, retro: { ...s.retro, githubUrl: e.target.value } }
                            : s
                        ),
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-md border border-neutral-200 text-xs outline-none focus:border-neutral-900"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: OVERVIEW (전체 진척표) */}
        {activeTab === 'overview' && (
          <div className="space-y-10">
            {/* 13 Sprints Table */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-neutral-900">스프린트 1 – 13 진척 트래커</h2>
              <div className="border-t border-b border-neutral-200 divide-y divide-neutral-100 text-xs">
                {state.sprints.map((sp) => {
                  const doneCount = sp.tasks.filter((t) => t.done).length;
                  return (
                    <div
                      key={sp.id}
                      onClick={() => {
                        setSelectedSprintId(sp.id);
                        setActiveTab('sprint');
                      }}
                      className="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-neutral-50 px-1"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 font-mono font-semibold text-neutral-900 shrink-0">
                          S{sp.id}
                        </span>
                        <span className="text-neutral-400 w-24 shrink-0 hidden sm:inline">
                          {sp.period.split(' ').slice(0, 3).join(' ')}
                        </span>
                        <span className="text-neutral-800 truncate">{sp.goal}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 font-mono text-neutral-500">
                        <span>
                          {doneCount}/{sp.tasks.length}
                        </span>
                        <span className="w-10 text-right">{sp.retro.actualHours || 0}h</span>
                        <span className="w-8 text-right">
                          {sp.retro.funScore ? `${sp.retro.funScore}/5` : '-'}
                        </span>
                        <span className="w-5 text-right">
                          {sp.retro.goalAchieved === true ? (
                            <Check className="w-3.5 h-3.5 text-neutral-900 inline" />
                          ) : (
                            '-'
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Milestones & 6-Month Final Check */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-neutral-900">마일스톤 (M1 – M4)</h2>
              <div className="border-t border-b border-neutral-200 divide-y divide-neutral-100 text-xs">
                {state.milestones.map((m) => (
                  <div
                    key={m.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer">
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
                        className="w-4 h-4 rounded border-neutral-300 accent-neutral-900"
                      />
                      <span className="font-mono font-semibold w-6">{m.code}</span>
                      <span className={m.done ? 'line-through text-neutral-400' : 'text-neutral-900'}>
                        {m.title}
                      </span>
                      <span className="text-neutral-400">({m.timing})</span>
                    </label>
                    <input
                      type="text"
                      placeholder="증빙 링크/메모"
                      value={m.evidenceUrl}
                      onChange={(e) =>
                        updateAppState((prev) => ({
                          ...prev,
                          milestones: prev.milestones.map((item) =>
                            item.id === m.id ? { ...item, evidenceUrl: e.target.value } : item
                          ),
                        }))
                      }
                      className="sm:w-52 px-2 py-1 border border-neutral-200 rounded text-xs outline-none focus:border-neutral-900"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 3-Month Checkpoint (Compact) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">
                  ★ 3개월 체크포인트 (S7 · 1월 말)
                </h2>
                <span className="text-xs text-neutral-500 font-mono">
                  S1–S6 평균 재미: {s1ToS6Stats.avgFun ?? '-'}/5 · 주당: {s1ToS6Stats.avgWeeklyHours}h
                </span>
              </div>
              <div className="border-t border-b border-neutral-200 divide-y divide-neutral-100 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-neutral-700">1. M1·M2 달성 여부</span>
                  <div className="flex gap-1">
                    {(
                      [
                        { key: 'both', label: '둘 다' },
                        { key: 'one', label: '하나' },
                        { key: 'none', label: '없음' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.key}
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            checkpoint: { ...prev.checkpoint, m1m2Status: o.key },
                          }))
                        }
                        className={`px-2 py-1 rounded border ${
                          state.checkpoint.m1m2Status === o.key
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-neutral-700">4. 더 재미있었던 쪽</span>
                  <div className="flex gap-1">
                    {(
                      [
                        { key: 'A', label: '(A) UI·제품' },
                        { key: 'B', label: '(B) 검색·실험' },
                        { key: 'similar', label: '비슷' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.key}
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            checkpoint: { ...prev.checkpoint, preferTrack: o.key },
                          }))
                        }
                        className={`px-2 py-1 rounded border ${
                          state.checkpoint.preferTrack === o.key
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-neutral-700">5. 사내 AI 적용 가능성</span>
                  <div className="flex gap-1">
                    {(
                      [
                        { key: 'high', label: '높음' },
                        { key: 'medium', label: '보통' },
                        { key: 'low', label: '낮음' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.key}
                        onClick={() =>
                          updateAppState((prev) => ({
                            ...prev,
                            checkpoint: { ...prev.checkpoint, companyPossibility: o.key },
                          }))
                        }
                        className={`px-2 py-1 rounded border ${
                          state.checkpoint.companyPossibility === o.key
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Minimal Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-neutral-200 shadow-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Supabase 동기화 설정</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-xs text-neutral-500 hover:text-neutral-900"
              >
                닫기
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-neutral-500 mb-1">Supabase URL</label>
                <input
                  type="url"
                  value={syncConfig.supabaseUrl}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, supabaseUrl: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1">Anon Key</label>
                <input
                  type="password"
                  placeholder="eyJhbGci..."
                  value={syncConfig.supabaseAnonKey}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, supabaseAnonKey: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1">동기화 키</label>
                <input
                  type="text"
                  value={syncConfig.syncKey}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, syncKey: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 rounded border border-neutral-300 font-mono outline-none focus:border-neutral-900"
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
                className="flex-1 py-2 rounded bg-neutral-900 text-white text-xs font-medium"
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
                className="px-3 py-2 rounded border border-neutral-200 text-xs text-neutral-700 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>불러오기</span>
              </button>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-2 text-xs">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                  alert('SQL이 복사되었습니다.');
                }}
                className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900"
              >
                <Copy className="w-3 h-3" />
                <span>초기 SQL 복사</span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={exportBackupJson}
                  className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900"
                >
                  <Download className="w-3 h-3" />
                  <span>JSON 백업</span>
                </button>
                <label className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900 cursor-pointer">
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
