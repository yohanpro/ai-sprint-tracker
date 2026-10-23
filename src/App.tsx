import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  Flag,
  Heart,
  Home,
  Layers,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Settings,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AppState,
  INITIAL_APP_STATE,
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

type TabKey = 'home' | 'sprints' | 'checkpoint' | 'tracker';

const PHASE_COLORS: Record<1 | 2 | 3 | 4, { badge: string; header: string; border: string }> = {
  1: {
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    header: 'from-blue-900 to-blue-700',
    border: 'border-blue-600',
  },
  2: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    header: 'from-emerald-900 to-emerald-700',
    border: 'border-emerald-600',
  },
  3: {
    badge: 'bg-amber-100 text-amber-900 border-amber-200',
    header: 'from-amber-800 to-amber-600',
    border: 'border-amber-600',
  },
  4: {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    header: 'from-purple-900 to-purple-700',
    border: 'border-purple-600',
  },
};

function detectActiveSprintId(sprints: SprintData[]): number {
  const today = new Date().toISOString().slice(0, 10);
  for (const sp of sprints) {
    if (today >= sp.startDate && today <= sp.endDate) {
      return sp.id;
    }
  }
  if (today < sprints[0].startDate) return 1;
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
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [selectedSprintId, setSelectedSprintId] = useState<number>(() =>
    detectActiveSprintId(loadLocalState().sprints)
  );

  // Sync state
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => getSyncConfig());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Timer state
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerSprintId, setTimerSprintId] = useState<number>(selectedSprintId);
  const [timerSlot, setTimerSlot] = useState<string>('1주 토');
  const [timerNote, setTimerNote] = useState<string>('');

  // New task input state
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskHours, setNewTaskHours] = useState<string>('1');
  const [newTaskSlot, setNewTaskSlot] = useState<string>('1주 토');

  const isCloudConfigured = Boolean(
    syncConfig.supabaseUrl.trim() && syncConfig.supabaseAnonKey.trim()
  );

  // Initial pull + Realtime subscription + Focus sync from Supabase if configured
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
          setSyncMessage('Supabase 실시간 연동 중');
        } else if (!res.ok) {
          setSyncStatus('error');
          setSyncMessage(res.error || '동기화 오류');
        } else {
          setSyncStatus('synced');
          setSyncMessage('Supabase 연결됨');
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
          setSyncMessage('다른 기기 변경사항 반영됨');
          return remoteState;
        }
        return prev;
      });
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromRemote();
      }
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

  // Stopwatch interval
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
            if (res.ok) {
              setSyncStatus('synced');
              setSyncMessage('자동 저장됨');
            } else {
              setSyncStatus('error');
              setSyncMessage(res.error || '저장 실패');
            }
          });
        }, 600);
      }
      return next;
    });
  };

  const currentSprintId = useMemo(() => detectActiveSprintId(state.sprints), [state.sprints]);
  const selectedSprint = useMemo(
    () => state.sprints.find((s) => s.id === selectedSprintId) || state.sprints[0],
    [state.sprints, selectedSprintId]
  );

  // Effective target hours considering 최소 유지 모드 (가족 일정·야근·출장·아픈 주 → 주 2h 슬롯 1개)
  const getEffectiveTargetHours = (sp: SprintData): number => {
    if (sp.id === 5) {
      // S5 연말 라이트 스프린트 기본 7h
      let h = 7;
      if (sp.minMaintenanceWeek1) h -= 2;
      if (sp.minMaintenanceWeek2) h -= 1;
      return Math.max(2, h);
    }
    let h = sp.targetHours; // 12h (주 6h * 2)
    if (sp.minMaintenanceWeek1) h -= 4; // 1주차 6h -> 2h
    if (sp.minMaintenanceWeek2) h -= 4; // 2주차 6h -> 2h
    return Math.max(2, h);
  };

  // Global stats
  const totalStats = useMemo(() => {
    const allTasks = state.sprints.flatMap((s) => s.tasks);
    const doneTasks = allTasks.filter((t) => t.done).length;
    const totalHoursLogged = state.sprints.reduce((acc, s) => acc + (s.retro.actualHours || 0), 0);
    const achievedSprints = state.sprints.filter((s) => s.retro.goalAchieved === true).length;
    const dDayDone = state.dDayChecklist.filter((d) => d.done).length;
    return {
      totalTasks: allTasks.length,
      doneTasks,
      taskPercent: allTasks.length ? Math.round((doneTasks / allTasks.length) * 100) : 0,
      totalHoursLogged: Math.round(totalHoursLogged * 10) / 10,
      achievedSprints,
      dDayDone,
      dDayTotal: state.dDayChecklist.length,
    };
  }, [state]);

  // S1~S6 stats for 3개월 체크포인트
  const s1ToS6Stats = useMemo(() => {
    const firstSix = state.sprints.slice(0, 6);
    const scored = firstSix.filter((s) => s.retro.funScore !== null);
    const avgFun =
      scored.length > 0
        ? Math.round(
            (scored.reduce((acc, s) => acc + (s.retro.funScore || 0), 0) / scored.length) * 10
          ) / 10
        : null;
    // 6 sprints = 12 weeks
    const totalHours6 = firstSix.reduce((acc, s) => acc + (s.retro.actualHours || 0), 0);
    const avgWeeklyHours = Math.round((totalHours6 / 12) * 10) / 10;
    return { avgFun, avgWeeklyHours, totalHours6: Math.round(totalHours6 * 10) / 10 };
  }, [state.sprints]);

  // Handlers
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

      const nextRolloverCount = (taskToMove.rolloverCount || 0) + 1;
      const movedTask: SprintTask = {
        ...taskToMove,
        id: `${taskToMove.id}-r${nextRolloverCount}`,
        rolloverCount: nextRolloverCount,
        slot: '1주 토 (이월)',
      };

      return {
        ...prev,
        sprints: prev.sprints.map((sp) => {
          if (sp.id === fromSprintId) {
            return {
              ...sp,
              tasks: sp.tasks.filter((t) => t.id !== taskId),
            };
          }
          if (sp.id === fromSprintId + 1) {
            return {
              ...sp,
              tasks: [movedTask, ...sp.tasks],
            };
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
          slot: '1주 토 (이월)',
        };
      });

      return {
        ...prev,
        sprints: prev.sprints.map((sp) => {
          if (sp.id === fromSprintId) {
            return {
              ...sp,
              tasks: sp.tasks.filter((t) => !unfinishedIds.has(t.id)),
            };
          }
          if (sp.id === fromSprintId + 1) {
            return {
              ...sp,
              tasks: [...movedTasks, ...sp.tasks],
            };
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
                  originalTitle: t.originalTitle || t.title,
                  title: t.title.startsWith('[범위 1/2 축소] ')
                    ? t.title
                    : `[범위 1/2 축소] ${t.title}`,
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

  const saveTimerSession = () => {
    if (timerSeconds < 60) {
      alert('1분 이상 측정된 기록만 반영할 수 있어요.');
      return;
    }
    const addedHours = Math.round((timerSeconds / 3600) * 100) / 100;
    const logItem = {
      id: `log-${Date.now()}`,
      sprintId: timerSprintId,
      slot: timerSlot,
      seconds: timerSeconds,
      note: timerNote.trim() || `${timerSlot} 슬롯 학습`,
      createdAt: new Date().toISOString(),
    };

    updateAppState((prev) => ({
      ...prev,
      timerLogs: [logItem, ...prev.timerLogs],
      sprints: prev.sprints.map((sp) =>
        sp.id !== timerSprintId
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
    setTimerNote('');
  };

  const exportBackupJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-sprint-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
          alert('백업 데이터를 성공적으로 불러왔습니다.');
        }
      } catch {
        alert('올바른 JSON 백업 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-slate-900 text-white border-r border-slate-800 shrink-0">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg shadow-inner">
              AI
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">AI 전환 6개월 플랜</h1>
              <p className="text-xs text-slate-400 mt-0.5">2026.10.24 – 2027.04.23 (13주×2)</p>
            </div>
          </div>

          <div className="mt-4 bg-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 border border-slate-700/60">
            <div className="flex justify-between text-slate-300">
              <span>전체 백로그 달성</span>
              <span className="font-semibold text-white">
                {totalStats.doneTasks} / {totalStats.totalTasks} ({totalStats.taskPercent}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${totalStats.taskPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-slate-400 pt-1">
              <span>누적 투입 시간</span>
              <span className="text-blue-300 font-medium">{totalStats.totalHoursLogged}h / 151h</span>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('home')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              activeTab === 'home'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>0. 세팅 · D-day · 규칙</span>
          </button>

          <button
            onClick={() => setActiveTab('sprints')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              activeTab === 'sprints'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-3">
              <Layers className="w-4 h-4" />
              <span>스프린트 1 – 13</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-blue-300">
              S{currentSprintId} 진행기
            </span>
          </button>

          {/* Quick Sprint Jump List on Desktop */}
          <div className="pl-3 pr-1 py-1 space-y-0.5 max-h-64 overflow-y-auto">
            {state.sprints.map((sp) => {
              const doneCount = sp.tasks.filter((t) => t.done).length;
              const isSelected = activeTab === 'sprints' && selectedSprintId === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => {
                    setSelectedSprintId(sp.id);
                    setTimerSprintId(sp.id);
                    setActiveTab('sprints');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition ${
                    isSelected
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate">
                    S{sp.id}. {sp.goal.replace(/\[M\d\]|★/g, '').trim()}
                  </span>
                  <span className="ml-2 shrink-0 text-[11px] text-slate-400">
                    {doneCount}/{sp.tasks.length}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setActiveTab('checkpoint')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              activeTab === 'checkpoint'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-300 hover:bg-slate-800'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>★ 3개월 체크포인트</span>
          </button>

          <button
            onClick={() => setActiveTab('tracker')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
              activeTab === 'tracker'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>진척 트래커 · 마일스톤</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition"
          >
            <span className="flex items-center gap-2">
              {isCloudConfigured ? (
                <Cloud className="w-4 h-4 text-emerald-400" />
              ) : (
                <CloudOff className="w-4 h-4 text-slate-400" />
              )}
              <span>{isCloudConfigured ? 'Supabase 동기화 켜짐' : '동기화 · 백업 설정'}</span>
            </span>
            <Settings className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {syncMessage && (
            <p className="text-[11px] text-slate-400 text-center truncate">{syncMessage}</p>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        {/* Top Persistent Slot Stopwatch & Mobile Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-3 sm:px-6 py-2.5 shadow-sm">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            {/* Mobile Title & Sync Button */}
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-900 text-white">
                  S{currentSprintId} 진행기
                </span>
                <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">
                  주 6h (화1·목1·토2·일2) · 주말 오후는 가족 시간
                </span>
              </div>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="md:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium"
              >
                {isCloudConfigured ? (
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>동기화</span>
              </button>
            </div>

            {/* Slot Stopwatch Bar */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto justify-between md:justify-end bg-slate-100/90 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-blue-700 shrink-0" />
                <select
                  value={timerSprintId}
                  onChange={(e) => setTimerSprintId(Number(e.target.value))}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800"
                >
                  {state.sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      Sprint {s.id}
                    </option>
                  ))}
                </select>
                <select
                  value={timerSlot}
                  onChange={(e) => setTimerSlot(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800"
                >
                  {SPRINT_SLOTS.map((slot) => (
                    <option key={slot.key} value={slot.key}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-slate-900 text-emerald-400">
                  {formatSeconds(timerSeconds)}
                </span>
                <button
                  onClick={() => setTimerRunning((r) => !r)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white transition ${
                    timerRunning
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{timerRunning ? '일시정지' : '슬롯 시작'}</span>
                </button>
                {timerSeconds > 0 && (
                  <>
                    <button
                      onClick={saveTimerSession}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      title="해당 스프린트 실제 투입 시간에 자동 합산"
                    >
                      기록 반영
                    </button>
                    <button
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerSeconds(0);
                      }}
                      className="p-1 text-slate-500 hover:text-slate-700"
                      title="초기화"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-5 space-y-6">
          {/* TAB 1: HOME / D-DAY / RULES */}
          {activeTab === 'home' && (
            <div className="space-y-6">
              {/* Hero Banner */}
              <section className="rounded-2xl bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white p-5 sm:p-6 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="inline-block text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-700/80 text-blue-100 mb-2">
                      프론트엔드 9년 차 → AI 애플리케이션 엔지니어
                    </span>
                    <h2 className="text-xl sm:text-2xl font-bold">
                      AI 전환 6개월 스프린트 플랜 (C안)
                    </h2>
                    <p className="text-xs sm:text-sm text-blue-100 mt-1">
                      2026.10.24 (토) – 2027.04.23 (금) · 2주 스프린트 13개 · 최종 목표: 2028년까지 AI 직무 이직
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSprintId(currentSprintId);
                      setActiveTab('sprints');
                    }}
                    className="self-start sm:self-center shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-blue-900 font-bold text-sm shadow hover:bg-blue-50 transition"
                  >
                    <span>Sprint {currentSprintId} 바로 열기</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5 pt-4 border-t border-blue-700/60 text-xs">
                  <div className="bg-blue-950/50 rounded-xl p-3">
                    <div className="text-blue-300">6개월 핵심 결과물</div>
                    <div className="font-semibold mt-1">공개 앱 3 · 블로그 4 · 사내 제안서</div>
                  </div>
                  <div className="bg-blue-950/50 rounded-xl p-3">
                    <div className="text-blue-300">주간 고정 투입</div>
                    <div className="font-semibold mt-1">주 6시간 (1스프린트 = 12h)</div>
                  </div>
                  <div className="bg-blue-950/50 rounded-xl p-3">
                    <div className="text-blue-300">D-day 준비 상태</div>
                    <div className="font-semibold mt-1">
                      {totalStats.dDayDone} / {totalStats.dDayTotal} 완료
                    </div>
                  </div>
                  <div className="bg-blue-950/50 rounded-xl p-3">
                    <div className="text-blue-300">누적 투입 / 목표 달성</div>
                    <div className="font-semibold mt-1">
                      {totalStats.totalHoursLogged}h · {totalStats.achievedSprints}/13 스프린트
                    </div>
                  </div>
                </div>
              </section>

              {/* D-day Checklist (10월 24일 토) */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-700" />
                      <span>D-day 체크리스트 · 10월 24일 (토)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      계획의 성패는 의지가 아니라 고정된 시간에서 갈립니다. 시작 전 6가지를 먼저 체크하세요.
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                    {totalStats.dDayDone}/{totalStats.dDayTotal}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {state.dDayChecklist.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 py-3 cursor-pointer select-none group"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleDDayItem(item.id)}
                        className="mt-0.5 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span
                        className={`flex-1 text-sm ${
                          item.done ? 'line-through text-slate-400' : 'text-slate-800 font-medium'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        {item.duration}
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              {/* Weekly Fixed Schedule & 2-Week Slot Cycle */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <Clock className="w-5 h-5 text-blue-700" />
                    <span>주간 고정 일정 (주 6시간 · 주말 분산형)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    핵심은 주말 공부를 오전 2시간으로 끝내고, 나머지 주말은 온전히 가족 시간으로 두는 것입니다.
                  </p>
                  <div className="space-y-2.5 text-xs sm:text-sm">
                    {(
                      [
                        { key: 'tue', day: '화요일 (1h)' },
                        { key: 'thu', day: '목요일 (1h)' },
                        { key: 'sat', day: '토요일 오전 (2h)' },
                        { key: 'sun', day: '일요일 오전 (2h)' },
                      ] as const
                    ).map((row) => (
                      <div key={row.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                        <span className="w-32 font-semibold text-slate-700 shrink-0">{row.day}</span>
                        <input
                          type="text"
                          value={state.weeklyScheduleCustom[row.key]}
                          onChange={(e) =>
                            updateAppState((prev) => ({
                              ...prev,
                              weeklyScheduleCustom: {
                                ...prev.weeklyScheduleCustom,
                                [row.key]: e.target.value,
                              },
                            }))
                          }
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:bg-white focus:border-blue-500 outline-none"
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2 text-xs text-slate-600 border-t border-slate-100">
                      <span className="font-semibold text-blue-700">출퇴근 보너스:</span>
                      <span>3Blue1Brown 선형대수 영상 (시간 계산에 넣지 않음)</span>
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <Sparkles className="w-5 h-5 text-blue-700" />
                    <span>한 스프린트(2주 = 12h) 8슬롯 회전 순서</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    토요일에 시작해 둘째 주 금요일에 끝납니다. 2주 화요일은 버퍼, 2주 목요일은 회고입니다.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SPRINT_SLOTS.map((slot, idx) => (
                      <div
                        key={slot.key}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                      >
                        <div className="font-bold text-blue-900">
                          {idx + 1}. {slot.label}
                        </div>
                        <div className="text-slate-600 mt-1 text-[11px] leading-snug">{slot.role}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Operating Rules */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-3">
                  스프린트 운영 핵심 규칙 (지속 최우선)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1">🎯 스프린트 목표 1개 & DoD</div>
                    <p className="text-slate-600 leading-relaxed">
                      할 일을 다 못 해도 스프린트 목표 한 줄과 완료 기준(DoD)이 달성되면 성공입니다.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1">📦 결과물 규칙 (GitHub + README)</div>
                    <p className="text-slate-600 leading-relaxed">
                      매 스프린트 끝에는 GitHub 커밋과 README 업데이트가 남아야 합니다. 보여줄 수 없는 공부는 이직 시장에서 없는 것과 같습니다.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <div className="font-bold text-amber-900 mb-1">🔁 이월 규칙 (2회 연속 시 절반 축소)</div>
                    <p className="text-amber-800 leading-relaxed">
                      못 끝낸 일은 다음 스프린트로 넘깁니다. 같은 일이 2번 연속 이월되면 범위를 절반으로 줄입니다.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200">
                    <div className="font-bold text-rose-900 mb-1">👨‍👩‍👧 가족 우선 & 최소 유지 모드</div>
                    <p className="text-rose-800 leading-relaxed">
                      가족 일정·야근·출장·아픈 주에는 주말 슬롯 하나(2시간)만 합니다. 0시간인 주만 피하면 계획은 유지됩니다.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1">🔒 회사 데이터 보안 & API 한도</div>
                    <p className="text-slate-600 leading-relaxed">
                      개인 프로젝트에는 공개 데이터와 mock 데이터만 씁니다. API는 시작 전 월 한도($20)를 먼저 설정합니다.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="font-bold text-slate-900 mb-1">💻 언어 전략 (TS + Python)</div>
                    <p className="text-slate-600 leading-relaxed">
                      LLM 앱은 이미 잘하는 TypeScript로, 혼공머신 실습은 Python(Colab)으로 자연스럽게 익힙니다.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: SPRINTS 1 - 13 */}
          {activeTab === 'sprints' && (
            <div className="space-y-5">
              {/* Horizontal Sprint Selector Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
                {state.sprints.map((sp) => {
                  const active = sp.id === selectedSprint.id;
                  const isCurrentDate = sp.id === currentSprintId;
                  const allDone = sp.tasks.length > 0 && sp.tasks.every((t) => t.done);
                  return (
                    <button
                      key={sp.id}
                      onClick={() => {
                        setSelectedSprintId(sp.id);
                        setTimerSprintId(sp.id);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 border transition flex items-center gap-1.5 ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>S{sp.id}</span>
                      {sp.milestoneTag && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-500 text-[10px]">
                          {sp.milestoneTag}
                        </span>
                      )}
                      {isCurrentDate && !active && (
                        <span className="w-2 h-2 rounded-full bg-blue-600" title="현재 기간" />
                      )}
                      {allDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>

              {/* Sprint Header Card */}
              <section
                className={`rounded-2xl bg-gradient-to-r ${
                  PHASE_COLORS[selectedSprint.phase].header
                } text-white p-5 shadow-md`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-semibold">
                      {selectedSprint.phaseName}
                    </span>
                    <span className="text-xs text-white/80 font-medium">
                      {selectedSprint.period}
                    </span>
                  </div>
                  {selectedSprint.milestoneTag && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-extrabold">
                      마일스톤 {selectedSprint.milestoneTag}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-bold mt-2">
                  {selectedSprint.title}: {selectedSprint.goal}
                </h2>

                <div className="mt-4 p-3.5 rounded-xl bg-black/20 border border-white/15 space-y-1.5 text-xs sm:text-sm">
                  <div>
                    <span className="font-bold text-amber-300 mr-2">완료 기준 (DoD):</span>
                    <span>{selectedSprint.dod}</span>
                  </div>
                  <div className="text-white/85 text-xs">
                    <span className="font-bold text-blue-200 mr-2">메모:</span>
                    <span>{selectedSprint.memo}</span>
                  </div>
                </div>

                {/* 최소 유지 모드 (가족 우선 규칙) 토글 바 */}
                <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-300 shrink-0" />
                    <span>
                      <strong>최소 유지 모드</strong> (가족 일정·야근·출장·아픈 주 → 주말 2h 슬롯 1개만 유지, 미안해하지 않기)
                    </span>
                  </div>
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
                      className={`px-2.5 py-1 rounded-lg font-semibold border transition ${
                        selectedSprint.minMaintenanceWeek1
                          ? 'bg-rose-500 text-white border-rose-400'
                          : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
                      }`}
                    >
                      1주차 최소유지 {selectedSprint.minMaintenanceWeek1 ? 'ON (2h)' : 'OFF'}
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
                      className={`px-2.5 py-1 rounded-lg font-semibold border transition ${
                        selectedSprint.minMaintenanceWeek2
                          ? 'bg-rose-500 text-white border-rose-400'
                          : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
                      }`}
                    >
                      2주차 최소유지 {selectedSprint.minMaintenanceWeek2 ? 'ON (2h)' : 'OFF'}
                    </button>
                  </div>
                </div>
              </section>

              {/* Sprint Backlog Card */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      할 일 (백로그) · 목표 {getEffectiveTargetHours(selectedSprint)}시간
                    </h3>
                    <p className="text-xs text-slate-500">
                      못 끝낸 일은 다음 스프린트로 이월하세요. 2번 연속 이월된 항목은 범위를 절반으로 줄입니다.
                    </p>
                  </div>

                  {selectedSprint.id < 13 && (
                    <button
                      onClick={() => rolloverAllUnfinishedTasks(selectedSprint.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold transition"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>미완료 항목 S{selectedSprint.id + 1}로 일괄 이월</span>
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {selectedSprint.tasks.map((task) => {
                    const isDoubleRollover = task.rolloverCount >= 2;
                    return (
                      <div
                        key={task.id}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          isDoubleRollover && !task.halved
                            ? 'bg-amber-50/70 -mx-3 px-3 rounded-xl border border-amber-200 my-1'
                            : ''
                        }`}
                      >
                        <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
                          <input
                            type="checkbox"
                            checked={task.done}
                            onChange={() => toggleSprintTask(selectedSprint.id, task.id)}
                            className="mt-0.5 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 space-y-1">
                            <div
                              className={`text-sm ${
                                task.done
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-800 font-medium'
                              }`}
                            >
                              {task.title}
                            </div>

                            {/* Rollover Warning Badge */}
                            {task.rolloverCount > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    isDoubleRollover
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{task.rolloverCount}회 이월됨</span>
                                </span>

                                {isDoubleRollover && !task.halved && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      halveTaskScope(selectedSprint.id, task.id);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold shadow-sm"
                                  >
                                    <Scissors className="w-3 h-3" />
                                    <span>규칙 적용: 범위·시간 절반(1/2)으로 줄이기</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </label>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                            {task.slot}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold">
                            {task.hours}h
                          </span>

                          {!task.done && selectedSprint.id < 13 && (
                            <button
                              onClick={() => rolloverTaskToNextSprint(selectedSprint.id, task.id)}
                              className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-600 font-medium"
                              title={`Sprint ${selectedSprint.id + 1}로 이월`}
                            >
                              이월 →
                            </button>
                          )}

                          {task.id.startsWith('custom-') && (
                            <button
                              onClick={() => deleteTask(selectedSprint.id, task.id)}
                              className="p-1 text-slate-400 hover:text-red-600"
                              title="항목 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add custom task */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="새로운 할 일 또는 쪼갠 작업 추가..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomTask(selectedSprint.id)}
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm outline-none focus:border-blue-500"
                  />
                  <select
                    value={newTaskSlot}
                    onChange={(e) => setNewTaskSlot(e.target.value)}
                    className="px-2.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
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
                    max="10"
                    value={newTaskHours}
                    onChange={(e) => setNewTaskHours(e.target.value)}
                    className="w-16 px-2.5 py-2 rounded-xl border border-slate-200 text-xs text-center"
                  />
                  <button
                    onClick={() => addCustomTask(selectedSprint.id)}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>추가</span>
                  </button>
                </div>
              </section>

              {/* Sprint KPT Retro Card (2주 목요일) */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      회고 · 2주 목요일 (Keep / Problem / Try)
                    </h3>
                    <p className="text-xs text-slate-500">
                      각 스프린트 끝에는 GitHub 커밋과 README 링크를 남기고, 재미 점수(1–5)를 기록합니다.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-700 mb-1">
                      Keep (좋았던 점 · 유지할 리듬)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="주말 오전 8시 슬롯을 지킨 것..."
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
                      className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-rose-700 mb-1">
                      Problem (막혔던 점 · 시간 부족 원인)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="평일 야근으로 화요일 슬롯을 놓침..."
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
                      className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-700 mb-1">
                      Try (다음 스프린트 실험 · 개선안)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="버퍼 슬롯(2주 화)에 이월 작업 우선 배치..."
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
                      className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Fun Score, Actual Hours, Goal Achieved, GitHub URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">재미 점수 (1–5)</div>
                    <div className="flex items-center gap-1.5">
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
                          className={`w-8 h-8 rounded-lg font-bold text-xs transition ${
                            selectedSprint.retro.funScore === num
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">
                      실제 투입 시간 (목표 {getEffectiveTargetHours(selectedSprint)}h)
                    </div>
                    <div className="flex items-center gap-2">
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
                        className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-bold"
                      />
                      <span className="text-xs text-slate-500">
                        h / {getEffectiveTargetHours(selectedSprint)}h
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">목표 달성 (DoD 기준)</div>
                    <div className="flex items-center gap-2">
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
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                          selectedSprint.retro.goalAchieved === true
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        예 (달성)
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
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                          selectedSprint.retro.goalAchieved === false
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        아니오
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-bold text-slate-700 mb-2">
                      결과물 링크 (GitHub / README / 데모)
                    </div>
                    <input
                      type="url"
                      placeholder="https://github.com/..."
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
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: 3-MONTH CHECKPOINT (S7 2주 일요일) */}
          {activeTab === 'checkpoint' && (
            <div className="space-y-6">
              <section className="rounded-2xl bg-gradient-to-r from-amber-800 to-amber-600 text-white p-5 shadow-md">
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-black/20">
                  1월 말 · Sprint 7 2주 일요일 (2027.01.24)
                </span>
                <h2 className="text-xl sm:text-2xl font-bold mt-2">
                  ★ 3개월 체크포인트 — 방향 미세 조정
                </h2>
                <p className="text-xs sm:text-sm text-amber-100 mt-1">
                  S1–S6 기록을 바탕으로 답을 적고, 아래 판단 기준대로 S8 이후 비중을 조정합니다.
                </p>
              </section>

              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900">체크포인트 5가지 질문</h3>

                <div className="divide-y divide-slate-100 text-sm">
                  {/* Q1 */}
                  <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      1. M1(공개 데모 + 글), M2(RAG 품질 수치)를 달성했는가?
                    </span>
                    <div className="flex items-center gap-2">
                      {(
                        [
                          { key: 'both', label: '둘 다' },
                          { key: 'one', label: '하나' },
                          { key: 'none', label: '없음' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() =>
                            updateAppState((prev) => ({
                              ...prev,
                              checkpoint: { ...prev.checkpoint, m1m2Status: opt.key },
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            state.checkpoint.m1m2Status === opt.key
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2 (Auto-calculated) */}
                  <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-800">2. S1–S6 재미 점수 평균은?</span>
                      <p className="text-xs text-slate-500">
                        S1–S6 회고에 입력한 재미 점수 기준 자동 계산값입니다.
                      </p>
                    </div>
                    <span className="px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-900 font-bold text-sm">
                      {s1ToS6Stats.avgFun !== null ? `${s1ToS6Stats.avgFun} / 5` : '미입력 (S1~S6 회고 필요)'}
                    </span>
                  </div>

                  {/* Q3 (Auto-calculated) */}
                  <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-800">
                        3. 실제 투입 시간 평균은? (주당 / 목표 6h)
                      </span>
                      <p className="text-xs text-slate-500">
                        S1–S6 누적 투입 {s1ToS6Stats.totalHours6}h ÷ 12주 기준 자동 계산값입니다.
                      </p>
                    </div>
                    <span className="px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-900 font-bold text-sm">
                      주 {s1ToS6Stats.avgWeeklyHours}h / 6h
                    </span>
                  </div>

                  {/* Q4 */}
                  <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-slate-800">4. 더 재미있었던 쪽은?</span>
                      <p className="text-xs text-slate-500">
                        (A) 기능을 UI · 제품에 붙이는 일 vs (B) 검색 품질 · 모델 실험
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(
                        [
                          { key: 'A', label: '(A) UI·제품 연결' },
                          { key: 'B', label: '(B) 검색품질·모델 실험' },
                          { key: 'similar', label: '비슷' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() =>
                            updateAppState((prev) => ({
                              ...prev,
                              checkpoint: { ...prev.checkpoint, preferTrack: opt.key },
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            state.checkpoint.preferTrack === opt.key
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q5 */}
                  <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      5. 회사에 AI 기능을 붙일 가능성은? (조직 분위기, 데이터 접근)
                    </span>
                    <div className="flex items-center gap-2">
                      {(
                        [
                          { key: 'high', label: '높음' },
                          { key: 'medium', label: '보통' },
                          { key: 'low', label: '낮음' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() =>
                            updateAppState((prev) => ({
                              ...prev,
                              checkpoint: { ...prev.checkpoint, companyPossibility: opt.key },
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            state.checkpoint.companyPossibility === opt.key
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 판단 기준 (자동 매칭 하이라이트) */}
                <div className="pt-4">
                  <h4 className="text-sm font-bold text-slate-900 mb-2">
                    판단 기준 및 S8 이후 자동 진단 결과
                  </h4>
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div
                      className={`p-3.5 rounded-xl border ${
                        state.checkpoint.preferTrack === 'A'
                          ? 'bg-blue-50 border-blue-400 text-blue-950 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <strong>4번이 A (UI·제품):</strong> 계획 유지. 목표 직무 = AI 애플리케이션 엔지니어 / AI 제품팀 프론트·풀스택.
                    </div>
                    <div
                      className={`p-3.5 rounded-xl border ${
                        state.checkpoint.preferTrack === 'B'
                          ? 'bg-blue-50 border-blue-400 text-blue-950 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <strong>4번이 B (검색·실험):</strong> 병행 트랙 비중을 올립니다. 혼공머신 진도를 앞당기고, 이후 Andrew Ng ML Specialization과 선형대수·확률통계를 추가해 ML 엔지니어 방향을 검토합니다. 대학원 진학의 의미가 커집니다.
                    </div>
                    <div
                      className={`p-3.5 rounded-xl border ${
                        s1ToS6Stats.totalHours6 > 0 && s1ToS6Stats.avgWeeklyHours <= 3
                          ? 'bg-amber-50 border-amber-400 text-amber-950 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <strong>3번이 3h 이하:</strong> 계획을 줄입니다. 스프린트를 3주 단위로 늘리고, 각 스프린트의 할 일은 그대로 둡니다. 시간을 늘리기보다 기간을 늘리는 쪽이 가정과 덜 부딪힙니다.
                    </div>
                    <div
                      className={`p-3.5 rounded-xl border ${
                        s1ToS6Stats.avgFun !== null && s1ToS6Stats.avgFun <= 2
                          ? 'bg-rose-50 border-rose-400 text-rose-950 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <strong>2번이 2 이하:</strong> 멈추고 다시 생각합니다. AI 전환 대신 &apos;더 좋은 회사의 프론트엔드&apos;로 목표를 바꾸는 것도 실패가 아니라 정보입니다.
                    </div>
                    <div
                      className={`p-3.5 rounded-xl border ${
                        state.checkpoint.companyPossibility === 'low'
                          ? 'bg-amber-50 border-amber-400 text-amber-950 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <strong>5번이 낮음:</strong> 사내 제안(S9)은 그대로 하되, 실사용 경험은 사이드 프로젝트로 확보하는 쪽에 무게를 둡니다.
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3개월 체크포인트 메모
                  </label>
                  <textarea
                    rows={4}
                    placeholder="3개월을 돌아보며 느낀 점과 S8~S13 조정 방향을 솔직하게 적어주세요..."
                    value={state.checkpoint.memo}
                    onChange={(e) =>
                      updateAppState((prev) => ({
                        ...prev,
                        checkpoint: { ...prev.checkpoint, memo: e.target.value },
                      }))
                    }
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs sm:text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: PROGRESS TRACKER, MILESTONES, PARALLEL TRACK */}
          {activeTab === 'tracker' && (
            <div className="space-y-6">
              {/* 6-Month Milestones */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                  <Flag className="w-5 h-5 text-blue-700" />
                  <span>6개월 핵심 마일스톤 (M1 – M4)</span>
                </h3>
                <div className="divide-y divide-slate-100">
                  {state.milestones.map((m) => (
                    <div
                      key={m.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <label className="flex items-center gap-3 cursor-pointer">
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
                          className="w-5 h-5 rounded border-slate-300 text-blue-600"
                        />
                        <span className="px-2 py-0.5 rounded bg-blue-900 text-white text-xs font-bold">
                          {m.code}
                        </span>
                        <div>
                          <div
                            className={`text-sm font-bold ${
                              m.done ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {m.title}
                          </div>
                          <div className="text-xs text-slate-500">
                            {m.timing} · 증거: {m.evidenceDesc}
                          </div>
                        </div>
                      </label>
                      <input
                        type="text"
                        placeholder="증빙 URL / 메모 입력..."
                        value={m.evidenceUrl}
                        onChange={(e) =>
                          updateAppState((prev) => ({
                            ...prev,
                            milestones: prev.milestones.map((item) =>
                              item.id === m.id ? { ...item, evidenceUrl: e.target.value } : item
                            ),
                          }))
                        }
                        className="sm:w-64 px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Parallel Track & Final 6-Month Check */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <BookOpen className="w-5 h-5 text-blue-700" />
                    <span>병행 트랙 (혼공머신 1~4장 · 3Blue1Brown)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    메인 트랙(만드는 일)이 밀리면 병행 트랙을 가장 먼저 줄입니다.
                  </p>
                  <div className="divide-y divide-slate-100">
                    {state.parallelTrack.map((pt) => (
                      <label
                        key={pt.id}
                        className="py-2.5 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={pt.done}
                            onChange={() =>
                              updateAppState((prev) => ({
                                ...prev,
                                parallelTrack: prev.parallelTrack.map((item) =>
                                  item.id === pt.id ? { ...item, done: !item.done } : item
                                ),
                              }))
                            }
                            className="w-4 h-4 rounded border-slate-300 text-blue-600"
                          />
                          <span
                            className={`text-xs sm:text-sm ${
                              pt.done ? 'line-through text-slate-400' : 'text-slate-800'
                            }`}
                          >
                            {pt.title}
                          </span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                          {pt.targetPeriod}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>6개월 끝 · 최종 점검 (2027.04.23)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    여기까지 왔다면 이미 &apos;AI 제품을 만들어 본 개발자&apos;입니다.
                  </p>
                  <div className="divide-y divide-slate-100">
                    {state.finalChecklist.map((fc) => (
                      <label key={fc.id} className="py-3 flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fc.done}
                          onChange={() =>
                            updateAppState((prev) => ({
                              ...prev,
                              finalChecklist: prev.finalChecklist.map((item) =>
                                item.id === fc.id ? { ...item, done: !item.done } : item
                              ),
                            }))
                          }
                          className="w-5 h-5 rounded border-slate-300 text-emerald-600"
                        />
                        <span
                          className={`text-sm font-medium ${
                            fc.done ? 'line-through text-slate-400' : 'text-slate-800'
                          }`}
                        >
                          {fc.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              {/* 13 Sprints Summary Table (Page 20 of PDF) */}
              <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-x-auto">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-3">
                  진척 트래커 (Sprint 1 – 13 전체 요약)
                </h3>
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-2">#</th>
                      <th className="py-2.5 px-2">기간</th>
                      <th className="py-2.5 px-2">스프린트 목표</th>
                      <th className="py-2.5 px-2 text-center">할 일</th>
                      <th className="py-2.5 px-2 text-center">목표 달성</th>
                      <th className="py-2.5 px-2 text-center">실제 h</th>
                      <th className="py-2.5 px-2 text-center">재미</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.sprints.map((sp) => {
                      const doneCount = sp.tasks.filter((t) => t.done).length;
                      return (
                        <tr
                          key={sp.id}
                          onClick={() => {
                            setSelectedSprintId(sp.id);
                            setActiveTab('sprints');
                          }}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-2.5 px-2 font-bold text-blue-900">S{sp.id}</td>
                          <td className="py-2.5 px-2 text-xs text-slate-500 whitespace-nowrap">
                            {sp.period.split(' ').slice(0, 3).join(' ')}
                          </td>
                          <td className="py-2.5 px-2 font-medium text-slate-800">{sp.goal}</td>
                          <td className="py-2.5 px-2 text-center text-xs text-slate-600">
                            {doneCount}/{sp.tasks.length}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {sp.retro.goalAchieved === true ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                달성
                              </span>
                            ) : sp.retro.goalAchieved === false ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                                미달
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center font-semibold text-slate-700">
                            {sp.retro.actualHours || 0}h
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-blue-700">
                            {sp.retro.funScore ? `${sp.retro.funScore}/5` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Galaxy Android optimized) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-4 safe-bottom shadow-lg">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold ${
            activeTab === 'home' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span>세팅·D-day</span>
        </button>
        <button
          onClick={() => setActiveTab('sprints')}
          className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold ${
            activeTab === 'sprints' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <Layers className="w-5 h-5 mb-0.5" />
          <span>스프린트</span>
        </button>
        <button
          onClick={() => setActiveTab('checkpoint')}
          className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold ${
            activeTab === 'checkpoint' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <Star className="w-5 h-5 mb-0.5" />
          <span>3개월점검</span>
        </button>
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold ${
            activeTab === 'tracker' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <ListChecks className="w-5 h-5 mb-0.5" />
          <span>진척트래커</span>
        </button>
      </nav>

      {/* Supabase Sync & Backup Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                데스크톱 ↔ 갤럭시 동기화 (Supabase) & 백업
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-sm text-slate-500 hover:text-slate-800 font-semibold"
              >
                닫기
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              기본적으로 모든 체크 상태는 이 기기에 자동 저장됩니다. Supabase 무료 프로젝트의 URL과 Anon Key를 넣으면 맥과 갤럭시 안드로이드에서 동시에 실시간 동기화됩니다.
            </p>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supabase Project URL</label>
                <input
                  type="url"
                  placeholder="https://xxxx.supabase.co"
                  value={syncConfig.supabaseUrl}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, supabaseUrl: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supabase Anon Public Key</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  value={syncConfig.supabaseAnonKey}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, supabaseAnonKey: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  나만의 동기화 키 (맥과 갤럭시에 동일하게 입력)
                </label>
                <input
                  type="text"
                  value={syncConfig.syncKey}
                  onChange={(e) =>
                    setSyncConfig((prev) => ({ ...prev, syncKey: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={async () => {
                  saveSyncConfig(syncConfig);
                  const res = await pushStateToCloud(state, syncConfig);
                  if (res.ok) {
                    setSyncStatus('synced');
                    setSyncMessage('클라우드에 업로드 완료!');
                    alert('설정을 저장하고 현재 데이터를 Supabase에 업로드했습니다.');
                  } else {
                    setSyncStatus('error');
                    alert(`동기화 실패: ${res.error}`);
                  }
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                설정 저장 & 클라우드로 올리기
              </button>
              <button
                onClick={async () => {
                  saveSyncConfig(syncConfig);
                  const res = await pullStateFromCloud(syncConfig);
                  if (res.ok && res.state) {
                    setState(res.state);
                    saveLocalState(res.state);
                    alert('클라우드에서 최신 데이터를 불러왔습니다.');
                  } else if (res.ok) {
                    alert('클라우드에 아직 저장된 데이터가 없습니다.');
                  } else {
                    alert(`불러오기 실패: ${res.error}`);
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>클라우드에서 가져오기</span>
              </button>
            </div>

            {/* 1-Time SQL Helper */}
            <div className="p-3 rounded-xl bg-slate-900 text-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-300">Supabase 초기 테이블 생성 SQL (1회 실행)</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                    alert('SQL이 복사되었습니다! Supabase SQL Editor에 붙여넣고 Run을 눌러주세요.');
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px]"
                >
                  <Copy className="w-3 h-3" />
                  <span>SQL 복사</span>
                </button>
              </div>
              <pre className="overflow-x-auto text-[11px] text-slate-300 leading-relaxed">
                {SUPABASE_SETUP_SQL}
              </pre>
            </div>

            {/* JSON File Backup / Restore */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                onClick={exportBackupJson}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON 파일 백업</span>
              </button>
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>JSON 백업 복원</span>
                <input type="file" accept=".json" onChange={importBackupJson} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
