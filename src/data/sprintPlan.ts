export type IssueStatus = 'todo' | 'in_progress' | 'done';

export interface DDayItem {
  id: string;
  title: string;
  duration: string;
  done: boolean;
  status?: IssueStatus;
}

export interface SprintTask {
  id: string;
  title: string;
  hours: number;
  slot: string;
  done: boolean;
  status?: IssueStatus;
  isParallel?: boolean;
  rolloverCount: number; // 이월 횟수 (2회 연속 이월 시 범위 절반 축소 알림)
  halved?: boolean; // 범위 절반 축소 적용 여부
  originalTitle?: string;
}

export function getTaskStatus(task: { done: boolean; status?: IssueStatus }): IssueStatus {
  if (task.status) return task.status;
  return task.done ? 'done' : 'todo';
}

export function formatIssueKey(sprintId: number, index: number, taskId: string): string {
  const m = taskId.match(/^s(\d+)-(\d+)/);
  if (m) {
    return `AI-${m[1]}${String(m[2]).padStart(2, '0')}`;
  }
  return `AI-${sprintId}${String(index + 1).padStart(2, '0')}`;
}

export interface SprintRetro {
  keep: string;
  problem: string;
  tryText: string;
  funScore: number | null; // 1 ~ 5
  actualHours: number; // 실제 투입 시간 (타이머 자동 합산 + 수동 보정)
  goalAchieved: boolean | null; // 목표 달성 예 / 아니오
  githubUrl: string; // 매 스프린트 끝 GitHub 커밋 / README 링크
}

export interface SprintData {
  id: number;
  title: string;
  period: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  phase: 1 | 2 | 3 | 4;
  phaseName: string;
  goal: string;
  milestoneTag?: string;
  targetHours: number;
  minMaintenanceWeek1: boolean; // 1주차 최소 유지 모드 (주 6h -> 2h)
  minMaintenanceWeek2: boolean; // 2주차 최소 유지 모드 (주 6h -> 2h)
  dod: string;
  memo: string;
  tasks: SprintTask[];
  retro: SprintRetro;
}

export interface MilestoneItem {
  id: string;
  code: string;
  timing: string;
  title: string;
  evidenceDesc: string;
  evidenceUrl: string;
  done: boolean;
}

export interface CheckpointData {
  m1m2Status: 'both' | 'one' | 'none' | null;
  preferTrack: 'A' | 'B' | 'similar' | null;
  companyPossibility: 'high' | 'medium' | 'low' | null;
  memo: string;
}

export interface FinalChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface ParallelTrackItem {
  id: string;
  category: 'hongong' | '3b1b';
  title: string;
  targetPeriod: string;
  done: boolean;
}

export interface TimerLog {
  id: string;
  sprintId: number;
  slot: string;
  seconds: number;
  note: string;
  createdAt: string;
}

export interface AppState {
  updatedAt: string;
  dDayChecklist: DDayItem[];
  sprints: SprintData[];
  milestones: MilestoneItem[];
  checkpoint: CheckpointData;
  finalChecklist: FinalChecklistItem[];
  parallelTrack: ParallelTrackItem[];
  timerLogs: TimerLog[];
  weeklyScheduleCustom: {
    tue: string;
    thu: string;
    sat: string;
    sun: string;
  };
}

export const INITIAL_APP_STATE: AppState = {
  updatedAt: new Date(0).toISOString(),
  weeklyScheduleCustom: {
    tue: '21:00 – 22:00 (1h · 문서 읽기 · 짧은 구현)',
    thu: '21:00 – 22:00 (1h · 문서 읽기 · 짧은 구현 / 격주 회고)',
    sat: '08:00 – 10:00 (2h · 메인 구현 블록 — 오전 마감 후 가족 시간)',
    sun: '08:00 – 10:00 (2h · 구현 · 혼공머신 · 글쓰기)',
  },
  dDayChecklist: [
    {
      id: 'dday-1',
      title: '위 4개 슬롯(화·목·토·일)을 캘린더 반복 일정으로 등록 (알림 10분 전)',
      duration: '10분',
      done: false,
    },
    {
      id: 'dday-2',
      title: '아내와 이 계획 공유 — 2년 목표, 주말 오전 2시간씩, 나머지 주말은 가족 시간이라는 약속',
      duration: '30분',
      done: false,
    },
    {
      id: 'dday-3',
      title: 'OpenAI 또는 Anthropic API 키 발급 + 월 사용 한도 먼저 설정 (예: $20)',
      duration: '20분',
      done: false,
    },
    {
      id: 'dday-4',
      title: 'GitHub 저장소 ai-lab 생성 (public)',
      duration: '5분',
      done: false,
    },
    {
      id: 'dday-5',
      title: '『혼자 공부하는 머신러닝+딥러닝』 개정판 주문 (구판 X)',
      duration: '5분',
      done: false,
    },
    {
      id: 'dday-6',
      title: '이 플랜 앱을 데스크톱과 갤럭시 홈화면에 저장',
      duration: '5분',
      done: false,
    },
  ],
  milestones: [
    {
      id: 'm1',
      code: 'M1',
      timing: 'S3 끝 · 12/4',
      title: '첫 공개 데모 + 블로그 1편',
      evidenceDesc: '배포 URL, 글 링크',
      evidenceUrl: '',
      done: false,
    },
    {
      id: 'm2',
      code: 'M2',
      timing: 'S6 끝 · 1/15',
      title: '근거를 보여주는 RAG 앱 + 품질 수치',
      evidenceDesc: '실험 전후 비교 표',
      evidenceUrl: '',
      done: false,
    },
    {
      id: 'cp',
      code: '★',
      timing: 'S7 끝 · 1/29',
      title: '3개월 체크포인트',
      evidenceDesc: '체크포인트 페이지 작성',
      evidenceUrl: '',
      done: false,
    },
    {
      id: 'm3',
      code: 'M3',
      timing: 'S9 끝 · 2/26',
      title: '사내 AI 기능 제안서 제출',
      evidenceDesc: '제안서 1장 + 데모',
      evidenceUrl: '',
      done: false,
    },
    {
      id: 'm4',
      code: 'M4',
      timing: 'S13 끝 · 4/23',
      title: '대학원 지원 + 포트폴리오 + 이력서 v1',
      evidenceDesc: '제출 완료, 포트폴리오 URL',
      evidenceUrl: '',
      done: false,
    },
  ],
  checkpoint: {
    m1m2Status: null,
    preferTrack: null,
    companyPossibility: null,
    memo: '',
  },
  finalChecklist: [
    { id: 'final-1', title: '공개 프로젝트 3개 (챗봇 · RAG Q&A · 에이전트)', done: false },
    { id: 'final-2', title: '블로그 글 4편', done: false },
    { id: 'final-3', title: '사내 AI 기능 제안서 제출', done: false },
    { id: 'final-4', title: '대학원 원서 제출', done: false },
    { id: 'final-5', title: '포트폴리오 URL + 이력서 v1', done: false },
  ],
  parallelTrack: [
    { id: 'pt-1', category: 'hongong', title: '혼공머신 개정판 1장 (S1–S2)', targetPeriod: '10~11월', done: false },
    { id: 'pt-2', category: 'hongong', title: '혼공머신 개정판 2장 (S3–S4)', targetPeriod: '11~12월', done: false },
    { id: 'pt-3', category: 'hongong', title: '혼공머신 개정판 3장 (S6, S8)', targetPeriod: '1~2월', done: false },
    { id: 'pt-4', category: 'hongong', title: '혼공머신 개정판 4장 (S10, S12)', targetPeriod: '3~4월', done: false },
    { id: 'pt-5', category: '3b1b', title: '3Blue1Brown 선형대수: 벡터란 무엇인가 / 선형결합·생성·기저', targetPeriod: '출퇴근 보너스', done: false },
    { id: 'pt-6', category: '3b1b', title: '3Blue1Brown 선형대수: 선형변환과 행렬 / 행렬곱', targetPeriod: '출퇴근 보너스', done: false },
    { id: 'pt-7', category: '3b1b', title: '3Blue1Brown 선형대수: 내적(Dot Product)과 쌍대성 → 코사인 유사도 연결', targetPeriod: 'S4 전 필수', done: false },
  ],
  timerLogs: [],
  sprints: [
    {
      id: 1,
      title: 'Sprint 1',
      period: '10/24 (토) – 11/6 (금)',
      startDate: '2026-10-24',
      endDate: '2026-11-06',
      phase: 1,
      phaseName: 'Phase 1 · LLM 기본기',
      goal: '브라우저에서 스트리밍으로 답하는 내 첫 챗봇',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '저장소 공개 · 로컬에서 스트리밍 응답 동작 · README에 스크린샷과 배운 점 3줄',
      memo: "첫 스프린트의 목표는 '완벽한 앱'이 아니라 '리듬 만들기'입니다. 주말 오전 슬롯 4번을 지키면 성공입니다.",
      tasks: [
        { id: 's1-1', title: 'D-day 체크리스트 마무리 (일정 등록 · API 키 · 한도 · 저장소)', hours: 0.5, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's1-2', title: 'Next.js + TypeScript 프로젝트 세팅', hours: 0.5, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's1-3', title: '터미널 스크립트로 첫 API 호출', hours: 1, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's1-4', title: 'system 프롬프트 · temperature · max tokens를 바꿔 가며 결과 차이 기록', hours: 1, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's1-5', title: '[병행] 혼공머신 1장 앞부분 + 저자 유튜브 강의', hours: 1, slot: '1주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's1-6', title: '공식 문서의 프롬프트 엔지니어링 가이드 읽고 핵심 10줄 요약', hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's1-7', title: 'Vercel AI SDK로 스트리밍 채팅 페이지 구현', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's1-8', title: '대화 이력 유지 + README(스크린샷 포함)', hours: 2, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's1-9', title: '버퍼 — 밀린 일 처리', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's1-10', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 2,
      title: 'Sprint 2',
      period: '11/7 (토) – 11/20 (금)',
      startDate: '2026-11-07',
      endDate: '2026-11-20',
      phase: 1,
      phaseName: 'Phase 1 · LLM 기본기',
      goal: '툴을 호출하는 쇼핑 도우미 챗봇 v0.1',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: "'5만 원 이하 무선 이어폰 추천해줘'에 툴을 호출해 상품 카드로 답함 · 리뷰 요약이 JSON으로 나옴",
      memo: '툴 실행 상태 UI는 프론트엔드 강점이 바로 보이는 부분입니다. 포트폴리오 스크린샷용으로 공들여도 좋습니다.',
      tasks: [
        { id: 's2-1', title: 'Tool use(함수 호출) 문서 읽고 요청 → 툴 → 결과 → 응답 흐름을 그림으로 정리', hours: 1, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's2-2', title: '상품 mock API(JSON 상품 30개) 만들기', hours: 1, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's2-3', title: 'mock API를 첫 툴로 연결', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's2-4', title: "툴 실행 상태 UI — '검색 중…' 표시, 결과를 상품 카드로 렌더링", hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's2-5', title: '구조화 출력 — 리뷰 텍스트 → {장점, 단점, 한줄요약} JSON (zod 스키마)', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's2-6', title: '요청별 입력·출력 토큰과 비용 로깅', hours: 1, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's2-7', title: '[병행] 혼공머신 1장 마무리', hours: 1, slot: '2주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's2-8', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's2-9', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 3,
      title: 'Sprint 3',
      period: '11/21 (토) – 12/4 (금)',
      startDate: '2026-11-21',
      endDate: '2026-12-04',
      phase: 1,
      phaseName: 'Phase 1 · LLM 기본기',
      goal: '첫 공개 데모 + 블로그 1편 [M1]',
      milestoneTag: 'M1',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '배포 URL 공개 · 블로그 글 1편 발행 · README에 데모 링크',
      memo: "글은 잘 쓰는 것보다 '겪은 문제와 해결'이 구체적인 게 중요합니다. 실패 사례 10개가 그대로 글감이 됩니다.",
      tasks: [
        { id: 's3-1', title: '실패 사례 10개 수집 → 프롬프트 개선 · 프롬프트를 파일로 분리해 버전 관리', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's3-2', title: '스트리밍 중단 버튼 · 재시도 · 타임아웃 처리', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's3-3', title: 'Vercel 배포 · 환경 변수 · 간단한 요청 제한', hours: 1, slot: '1주 화', done: false, rolloverCount: 0 },
        { id: 's3-4', title: 'README에 데모 GIF · 링크 정리', hours: 1, slot: '1주 목', done: false, rolloverCount: 0 },
        { id: 's3-5', title: "블로그 글 #1 초안 — '프론트엔드 개발자의 첫 LLM 챗봇'", hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's3-6', title: '글 다듬어 발행', hours: 1, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's3-7', title: '[병행] 혼공머신 2장 앞부분', hours: 1, slot: '2주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's3-8', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's3-9', title: 'Phase 1 회고 — 스프린트 3개 돌아보기', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 4,
      title: 'Sprint 4',
      period: '12/5 (토) – 12/18 (금)',
      startDate: '2026-12-05',
      endDate: '2026-12-18',
      phase: 2,
      phaseName: 'Phase 2 · RAG',
      goal: '문서를 벡터로 저장하고 의미로 검색하기',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '질문을 입력하면 관련 문단 Top 5가 유사도 점수와 함께 나옴',
      memo: "여기서 처음으로 '수학이 코드가 되는' 경험을 합니다. 재미 점수를 특히 눈여겨보세요.",
      tasks: [
        { id: 's4-1', title: '임베딩 · 코사인 유사도 개념 정리 (3Blue1Brown 벡터 영상과 연결)', hours: 1, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's4-2', title: 'pgvector 세팅 (Docker 또는 Supabase)', hours: 1, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's4-3', title: '대상 문서 선정(자주 쓰는 라이브러리 공식 문서 등 공개 문서) · 로드 · 청킹', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's4-4', title: '임베딩 생성 · 저장', hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's4-5', title: '유사도 검색 API', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's4-6', title: '간단한 검색 UI', hours: 1, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's4-7', title: '[병행] 혼공머신 2장 마무리', hours: 1, slot: '2주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's4-8', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's4-9', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 5,
      title: 'Sprint 5',
      period: '12/19 (토) – 1/1 (금)',
      startDate: '2026-12-19',
      endDate: '2027-01-01',
      phase: 2,
      phaseName: 'Phase 2 · RAG',
      goal: '근거를 보여주는 Q&A (연말 라이트 스프린트 · 7h)',
      targetHours: 7,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '답변마다 근거 문단이 표시되고, 클릭하면 원문 위치로 이동',
      memo: '연말이라 평일과 2주 일요일은 비워 뒀습니다. 크리스마스와 연말은 가족 시간입니다.',
      tasks: [
        { id: 's5-1', title: "검색 결과를 컨텍스트로 넣어 답변 생성 + '근거가 없으면 모른다고 답하기'", hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's5-2', title: '출처 표시 UI — 답변 속 인용 번호 ↔ 원문 문단 하이라이트', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's5-3', title: '출처 UI 마무리 + README', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's5-4', title: '스프린트 회고 (연말 회고 겸)', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 6,
      title: 'Sprint 6',
      period: '1/2 (토) – 1/15 (금)',
      startDate: '2027-01-02',
      endDate: '2027-01-15',
      phase: 2,
      phaseName: 'Phase 2 · RAG',
      goal: 'RAG 품질을 숫자로 증명하기 [M2]',
      milestoneTag: 'M2',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: "'적중률 ○○% → ○○%' 같은 전후 비교 수치 · 블로그 글 2편째 발행",
      memo: "이직 면접에서 가장 강한 문장은 '이렇게 측정했고, 이만큼 올렸다'입니다. 이번 스프린트가 그 문장을 만듭니다.",
      tasks: [
        { id: 's6-1', title: '테스트 질문 20개 + 정답 근거 문단 표 작성 (작은 eval 셋)', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's6-2', title: '적중률 측정 스크립트 — Top 5 안에 정답 근거가 들어온 비율', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's6-3', title: '청크 크기 · 오버랩 3가지 조합 비교 실험', hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's6-4', title: '실험 결과를 표로 README에 정리 + 블로그 글 #2 초안', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's6-5', title: '글 발행', hours: 1, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's6-6', title: '[병행] 혼공머신 3장 앞부분', hours: 1, slot: '2주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's6-7', title: '버퍼 (여유가 있으면 하이브리드 검색 시도)', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's6-8', title: 'Phase 2 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 7,
      title: 'Sprint 7',
      period: '1/16 (토) – 1/29 (금)',
      startDate: '2027-01-16',
      endDate: '2027-01-29',
      phase: 3,
      phaseName: 'Phase 3 · 에이전트 · 평가 · 사내 제안',
      goal: '여러 툴을 쓰는 에이전트 + ★ 3개월 체크포인트',
      milestoneTag: '★ 체크포인트',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: "'이어폰 3개 비교해서 제일 싼 걸 장바구니에 넣어줘'가 여러 단계로 처리되고 과정이 화면에 보임",
      memo: '체크포인트 결과에 따라 S8부터 비중을 조정할 수 있습니다. 솔직하게 쓰세요.',
      tasks: [
        { id: 's7-1', title: '에이전트 개념 정리 + 툴 2개 추가 (스펙 비교 · 장바구니 mock)', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's7-2', title: '다단계 작업 처리 · 최대 스텝 제한 · 툴 실패 처리', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's7-3', title: "단계 진행 UI — '판단 → 툴 호출 → 결과'를 타임라인으로 표시", hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's7-4', title: '단계 진행 UI 마무리 + 사내 AI 아이디어 5개 메모 (영향도 · 데이터 접근성 · 리스크)', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's7-5', title: '★ 3개월 체크포인트 (별도 페이지)', hours: 2, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's7-6', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's7-7', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 8,
      title: 'Sprint 8',
      period: '1/30 (토) – 2/12 (금)',
      startDate: '2027-01-30',
      endDate: '2027-02-12',
      phase: 3,
      phaseName: 'Phase 3 · 에이전트 · 평가 · 사내 제안',
      goal: '평가(eval) 자동화 + 비용 대시보드',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '명령 하나로 eval이 돌고, 대시보드에서 모델별 점수 · 비용 · 속도를 비교할 수 있음',
      memo: '설 연휴가 이 스프린트 안에 있습니다. 연휴 주는 최소 유지 모드(주말 슬롯 하나)로 운영해도 괜찮습니다.',
      tasks: [
        { id: 's8-1', title: 'eval 러너 — 테스트 셋 자동 실행, 결과 · 점수 기록', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's8-2', title: 'LLM-as-judge 간단 버전 — 답변 품질을 모델로 채점', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's8-3', title: '[병행] 혼공머신 3장 마무리', hours: 2, slot: '1주 화·목', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's8-4', title: '비용 · 지연 시간 · 점수 대시보드 (프론트엔드 강점 활용)', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's8-5', title: '모델 2개 품질 · 비용 비교 + README', hours: 2, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's8-6', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's8-7', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 9,
      title: 'Sprint 9',
      period: '2/13 (토) – 2/26 (금)',
      startDate: '2027-02-13',
      endDate: '2027-02-26',
      phase: 3,
      phaseName: 'Phase 3 · 에이전트 · 평가 · 사내 제안',
      goal: '★ 사내 AI 기능 제안서 제출 [M3]',
      milestoneTag: 'M3',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '제안서와 데모를 실제로 누군가에게 보여 줌 (승인 여부와 무관)',
      memo: "6개월 중 가장 중요한 스프린트입니다. 거절돼도 '제안해 봤다'는 경험과 데모가 남습니다.",
      tasks: [
        { id: 's9-1', title: '아이디어 1개 선정 + 사내 보안 · 데이터 정책 확인 + 프로토타입 시작', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's9-2', title: '공개 데이터나 mock으로 프로토타입', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's9-3', title: '제안서 1장 — 문제 · 해결안 · 데모 · 예상 비용 · 리스크(개인정보, 환각) · 2주 PoC 계획', hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's9-4', title: '데모 다듬기 + 제안 미팅 준비', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's9-5', title: '블로그 글 #3 — eval 만들면서 배운 것 (짧게)', hours: 2, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's9-6', title: '팀장 또는 관련 조직에 제안 공유 (근무 시간 중 30분)', hours: 0.5, slot: '평일', done: false, rolloverCount: 0 },
        { id: 's9-7', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's9-8', title: 'Phase 3 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 10,
      title: 'Sprint 10',
      period: '2/27 (토) – 3/12 (금)',
      startDate: '2027-02-27',
      endDate: '2027-03-12',
      phase: 4,
      phaseName: 'Phase 4 · 실전 · 대학원 · 포트폴리오',
      goal: '대학원 후기 모집 조사 + 사내 PoC 착수',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '지원할 학교와 접수 마감일이 캘린더에 들어가 있음 · PoC 또는 통합 앱이 동작',
      memo: '접수 일정은 학교마다 다릅니다. 마감이 빠르면 S11의 서류 작업을 앞당기세요.',
      tasks: [
        { id: 's10-1', title: '야간 AI 대학원 2027 후기 모집 조사표 — 학교 · 접수일 · 학비 · 커리큘럼 · 수업 요일', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's10-2', title: '학위과정 여부 · 회사 학비 지원 확인 → 아내와 학비 · 수업 요일 상의 → 지원 학교 결정', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's10-3', title: 'PoC 진행(승인 시) 또는 쇼핑 도우미에 RAG + 에이전트 통합', hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's10-4', title: 'PoC / 통합 계속 (2주 토)', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's10-5', title: 'PoC / 통합 계속 (2주 일)', hours: 1, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's10-6', title: '[병행] 혼공머신 4장 앞부분', hours: 1, slot: '2주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's10-7', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's10-8', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 11,
      title: 'Sprint 11',
      period: '3/13 (토) – 3/26 (금)',
      startDate: '2027-03-13',
      endDate: '2027-03-26',
      phase: 4,
      phaseName: 'Phase 4 · 실전 · 대학원 · 포트폴리오',
      goal: '대학원 지원 서류 초안',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '학업계획서 초안 완성 · 데모 영상 1개',
      memo: "학업계획서에 '왜 AI인가'를 추상적으로 쓰지 말고, S1–S9에서 만든 것과 거기서 생긴 질문을 쓰세요.",
      tasks: [
        { id: 's11-1', title: '학업계획서 초안 — 지금까지 만든 프로젝트를 근거로', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's11-2', title: '학업계획서 · 지원 동기 다듬기', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's11-3', title: "구술 대비 — 'RAG가 뭔가요' 같은 질문에 2분 답변 연습", hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's11-4', title: 'PoC / 통합 마무리', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's11-5', title: '2분 데모 영상 녹화', hours: 2, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's11-6', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's11-7', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 12,
      title: 'Sprint 12',
      period: '3/27 (토) – 4/9 (금)',
      startDate: '2027-03-27',
      endDate: '2027-04-09',
      phase: 4,
      phaseName: 'Phase 4 · 실전 · 대학원 · 포트폴리오',
      goal: '포트폴리오 페이지 + 이력서 v1',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '포트폴리오 URL · 이력서 v1 · 블로그 4편',
      memo: "이력서 v1은 지금 바로 낼 이력서가 아니라 '현재 위치 확인용'입니다. 빈칸이 보이면 그게 다음 6개월 백로그입니다.",
      tasks: [
        { id: 's12-1', title: '포트폴리오 페이지 — 프로젝트 3개, 수치, 데모 링크', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's12-2', title: '포트폴리오 마무리 · 배포', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's12-3', title: "이력서 v1 — 'AI 제품 개발' 섹션 신설", hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's12-4', title: '블로그 글 #4 초안 — PoC(또는 통합 앱) 회고', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's12-5', title: '글 발행', hours: 1, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's12-6', title: '[병행] 혼공머신 4장 마무리', hours: 1, slot: '2주 일', done: false, isParallel: true, rolloverCount: 0 },
        { id: 's12-7', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's12-8', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
    {
      id: 13,
      title: 'Sprint 13',
      period: '4/10 (토) – 4/23 (금)',
      startDate: '2027-04-10',
      endDate: '2027-04-23',
      phase: 4,
      phaseName: 'Phase 4 · 실전 · 대학원 · 포트폴리오',
      goal: '대학원 지원 + 6개월 회고 [M4]',
      milestoneTag: 'M4',
      targetHours: 12,
      minMaintenanceWeek1: false,
      minMaintenanceWeek2: false,
      dod: '대학원 원서 제출 · 다음 6개월 계획 초안',
      memo: "여기까지 왔다면 이미 '프론트엔드 개발자'가 아니라 'AI 제품을 만들어 본 개발자'입니다.",
      tasks: [
        { id: 's13-1', title: '원서 제출 준비 — 서류 · 증명서 발급 (접수 일정에 맞춰 이동)', hours: 2, slot: '1주 토', done: false, rolloverCount: 0 },
        { id: 's13-2', title: 'AI 엔지니어 채용 공고 20개 수집 → 요구 역량 표', hours: 2, slot: '1주 일', done: false, rolloverCount: 0 },
        { id: 's13-3', title: '이력서 피드백 요청 — 현직 AI 엔지니어 1–2명 (커피챗) + 반영', hours: 2, slot: '1주 화·목', done: false, rolloverCount: 0 },
        { id: 's13-4', title: '공고 대비 내 갭 분석 → 다음 6개월 백로그 작성', hours: 2, slot: '2주 토', done: false, rolloverCount: 0 },
        { id: 's13-5', title: '6개월 회고 — 아내와 함께 6개월을 돌아보고 다음 6개월 시간 약속 다시 정하기', hours: 2, slot: '2주 일', done: false, rolloverCount: 0 },
        { id: 's13-6', title: '버퍼', hours: 1, slot: '2주 화', done: false, rolloverCount: 0 },
        { id: 's13-7', title: '스프린트 회고', hours: 1, slot: '2주 목', done: false, rolloverCount: 0 },
      ],
      retro: { keep: '', problem: '', tryText: '', funScore: null, actualHours: 0, goalAchieved: null, githubUrl: '' },
    },
  ],
};

export const SPRINT_SLOTS = [
  { key: '1주 토', label: '1주 토 (2h)', role: '플래닝 15분 + 구현' },
  { key: '1주 일', label: '1주 일 (2h)', role: '병행·구현' },
  { key: '1주 화', label: '1주 화 (1h)', role: '구현' },
  { key: '1주 목', label: '1주 목 (1h)', role: '구현' },
  { key: '2주 토', label: '2주 토 (2h)', role: '구현' },
  { key: '2주 일', label: '2주 일 (2h)', role: '병행·정리' },
  { key: '2주 화', label: '2주 화 (1h)', role: '버퍼 (밀린 일 처리)' },
  { key: '2주 목', label: '2주 목 (1h)', role: '스프린트 회고' },
];
