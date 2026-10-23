import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { AppState, INITIAL_APP_STATE } from '../data/sprintPlan';

const LOCAL_STORAGE_STATE_KEY = 'ai_sprint_tracker_state_v1';
const LOCAL_STORAGE_CONFIG_KEY = 'ai_sprint_tracker_supabase_config_v1';

export interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  syncKey: string; // 개인 구분 키 (기본값: yohan-ai-sprint-2026)
}

export function getSyncConfig(): SyncConfig {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const envSyncKey = import.meta.env.VITE_SYNC_KEY || 'yohan-ai-sprint-2026';

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncConfig>;
      return {
        supabaseUrl: parsed.supabaseUrl || envUrl,
        supabaseAnonKey: parsed.supabaseAnonKey || envKey,
        syncKey: parsed.syncKey || envSyncKey,
      };
    }
  } catch {
    // ignore parse error
  }

  return {
    supabaseUrl: envUrl,
    supabaseAnonKey: envKey,
    syncKey: envSyncKey,
  };
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify(config));
}

export function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_STATE_KEY);
    if (!raw) return INITIAL_APP_STATE;
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...INITIAL_APP_STATE,
      ...parsed,
      sprints: parsed.sprints?.length === 13 ? parsed.sprints : INITIAL_APP_STATE.sprints,
    };
  } catch {
    return INITIAL_APP_STATE;
  }
}

export function saveLocalState(state: AppState): void {
  localStorage.setItem(LOCAL_STORAGE_STATE_KEY, JSON.stringify(state));
}

let cachedClient: { url: string; key: string; client: SupabaseClient } | null = null;

export function getSupabaseClient(config: SyncConfig): SupabaseClient | null {
  const url = config.supabaseUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const key = config.supabaseAnonKey.trim();
  if (!url || !key) return null;

  if (cachedClient && cachedClient.url === url && cachedClient.key === key) {
    return cachedClient.client;
  }
  const client = createClient(url, key);
  cachedClient = { url, key, client };
  return client;
}

export async function pushStateToCloud(
  state: AppState,
  config: SyncConfig
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(config);
  if (!client) {
    return { ok: false, error: 'Supabase URL과 Anon Key가 설정되지 않았습니다.' };
  }

  const { error } = await client.from('sprint_tracker_state').upsert(
    {
      sync_key: config.syncKey.trim() || 'yohan-ai-sprint-2026',
      payload: state,
      updated_at: state.updatedAt,
    },
    { onConflict: 'sync_key' }
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function pullStateFromCloud(
  config: SyncConfig
): Promise<{ ok: boolean; state?: AppState; error?: string }> {
  const client = getSupabaseClient(config);
  if (!client) {
    return { ok: false, error: 'Supabase URL과 Anon Key가 설정되지 않았습니다.' };
  }

  const { data, error } = await client
    .from('sprint_tracker_state')
    .select('payload, updated_at')
    .eq('sync_key', config.syncKey.trim() || 'yohan-ai-sprint-2026')
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || !data.payload) {
    return { ok: true, state: undefined };
  }
  return { ok: true, state: data.payload as AppState };
}

export function subscribeToCloudChanges(
  config: SyncConfig,
  onRemoteState: (remoteState: AppState) => void
): (() => void) | null {
  const client = getSupabaseClient(config);
  if (!client) return null;

  const targetKey = config.syncKey.trim() || 'yohan-ai-sprint-2026';
  const channel: RealtimeChannel = client
    .channel(`sprint-sync-${targetKey}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sprint_tracker_state',
        filter: `sync_key=eq.${targetKey}`,
      },
      (payload) => {
        const nextRow = payload.new as { payload?: AppState } | undefined;
        if (nextRow?.payload) {
          onRemoteState(nextRow.payload);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

export const SUPABASE_SETUP_SQL = `-- Supabase SQL Editor에 붙여넣고 Run을 눌러주세요 (1회만 실행)
create table if not exists public.sprint_tracker_state (
  sync_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.sprint_tracker_state enable row level security;

drop policy if exists "Allow personal sync read/write" on public.sprint_tracker_state;
create policy "Allow personal sync read/write"
  on public.sprint_tracker_state
  for all
  using (true)
  with check (true);

-- 실시간(Realtime) 동기화 활성화
alter publication supabase_realtime add table public.sprint_tracker_state;`;
