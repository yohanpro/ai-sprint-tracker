import { SprintData, SprintTask } from '../data/sprintPlan';
import { getTaskGuide } from '../data/taskGuides';

const SLOT_OFFSET_DAYS: Record<string, { dayOffset: number; startHour: number; weekdayKo: string }> = {
  '1주 토': { dayOffset: 0, startHour: 8, weekdayKo: '토' },
  '1주 일': { dayOffset: 1, startHour: 8, weekdayKo: '일' },
  '1주 화': { dayOffset: 3, startHour: 21, weekdayKo: '화' },
  '1주 목': { dayOffset: 5, startHour: 21, weekdayKo: '목' },
  '2주 토': { dayOffset: 7, startHour: 8, weekdayKo: '토' },
  '2주 일': { dayOffset: 8, startHour: 8, weekdayKo: '일' },
  '2주 화': { dayOffset: 10, startHour: 21, weekdayKo: '화' },
  '2주 목': { dayOffset: 12, startHour: 21, weekdayKo: '목' },
};

export interface TaskScheduleInfo {
  start: Date;
  end: Date;
  dateLabel: string; // 예: 2026-10-24 (토) 08:00~10:00
}

export function getTaskSchedule(sprint: SprintData, task: SprintTask): TaskScheduleInfo {
  const [y, m, d] = sprint.startDate.split('-').map(Number);
  const slotMeta = SLOT_OFFSET_DAYS[task.slot] || { dayOffset: 0, startHour: 8, weekdayKo: '토' };

  const start = new Date(y, m - 1, d + slotMeta.dayOffset, slotMeta.startHour, 0, 0);
  const durationMinutes = Math.max(30, Math.round(task.hours * 60));
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const startTimeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endTimeStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

  return {
    start,
    end,
    dateLabel: `${dateStr} (${slotMeta.weekdayKo}) ${startTimeStr}~${endTimeStr}`,
  };
}

function formatIcsLocalDateTime(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T` +
    `${pad(dt.getHours())}${pad(dt.getMinutes())}00`
  );
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildTaskDescription(sprint: SprintData, task: SprintTask): string {
  const guide = getTaskGuide(task.id);
  const lines: string[] = [
    `[${sprint.title}] ${sprint.goal}`,
    `슬롯: ${task.slot} (${task.hours}h)`,
  ];
  if (guide) {
    lines.push('', `■ 핵심 요약: ${guide.summary}`);
    lines.push(`■ 완료 기준: ${guide.deliverable}`);
    if (guide.steps.length > 0) {
      lines.push('', '■ 실행 단계:');
      guide.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
  }
  lines.push('', '🔗 트래커 열기: https://yohanpro.github.io/ai-sprint-tracker/');
  return lines.join('\n');
}

/**
 * 구글 캘린더 개별 태스크 원클릭 등록 URL 생성
 */
export function getGoogleCalendarTaskUrl(sprint: SprintData, task: SprintTask): string {
  const { start, end } = getTaskSchedule(sprint, task);
  const dates = `${formatIcsLocalDateTime(start)}/${formatIcsLocalDateTime(end)}`;
  const title = `[AI ${sprint.title}] ${task.title}`;
  const details = buildTaskDescription(sprint, task);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details,
    ctz: 'Asia/Seoul',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * 구글 캘린더 주간 고정 루틴(화·목 밤 1h / 토·일 아침 2h) 반복 일정 등록 URL
 */
export function getGoogleCalendarRoutineUrl(type: 'weekday' | 'weekend'): string {
  if (type === 'weekday') {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: '🔥 [AI 전환 스프린트] 평일 집중 공부 (화·목 1시간)',
      dates: '20261027T210000/20261027T220000',
      recur: 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270424T235959Z',
      details:
        'AI 엔지니어 전환 6개월 로드맵 평일 1시간 루틴입니다.\n트래커: https://yohanpro.github.io/ai-sprint-tracker/',
      ctz: 'Asia/Seoul',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: '🚀 [AI 전환 스프린트] 주말 골든타임 몰입 (토·일 2시간)',
    dates: '20261024T080000/20261024T100000',
    recur: 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU;UNTIL=20270424T235959Z',
    details:
      'AI 엔지니어 전환 6개월 로드맵 주말 오전 2시간 집중 블록입니다 (10시 이후는 온전히 가족 시간!).\n트래커: https://yohanpro.github.io/ai-sprint-tracker/',
    ctz: 'Asia/Seoul',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function triggerIcsDownload(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 6개월 주간 반복 루틴 (화·목 21~22시, 토·일 08~10시 + 10분 전 푸시 알림) .ics 다운로드
 */
export function downloadWeeklyRoutineIcs(): void {
  const nowStamp = formatIcsLocalDateTime(new Date()) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Sprint Tracker//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // 주말 토·일 08:00~10:00 반복 일정
    'BEGIN:VEVENT',
    'UID:ai-sprint-weekend-routine@yohanpro.github.io',
    `DTSTAMP:${nowStamp}`,
    'DTSTART;TZID=Asia/Seoul:20261024T080000',
    'DTEND;TZID=Asia/Seoul:20261024T100000',
    'RRULE:FREQ=WEEKLY;BYDAY=SA,SU;UNTIL=20270424T235959Z',
    'SUMMARY:🚀 [AI 전환 스프린트] 주말 오전 2시간 골든타임 (08:00~10:00)',
    'DESCRIPTION:주말 오전 2시간 AI 실습 몰입 블록입니다. 10시 이후는 가족 시간!\\nhttps://yohanpro.github.io/ai-sprint-tracker/',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'DESCRIPTION:10분 뒤 AI 전환 스프린트 주말 골든타임(2h)이 시작됩니다!',
    'END:VALARM',
    'END:VEVENT',
    // 평일 화·목 21:00~22:00 반복 일정
    'BEGIN:VEVENT',
    'UID:ai-sprint-weekday-routine@yohanpro.github.io',
    `DTSTAMP:${nowStamp}`,
    'DTSTART;TZID=Asia/Seoul:20261027T210000',
    'DTEND;TZID=Asia/Seoul:20261027T220000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270424T235959Z',
    'SUMMARY:🔥 [AI 전환 스프린트] 평일 1시간 집중 블록 (21:00~22:00)',
    'DESCRIPTION:평일 화·목 밤 1시간 AI 스프린트 공부 시간입니다.\\nhttps://yohanpro.github.io/ai-sprint-tracker/',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'DESCRIPTION:10분 뒤 AI 전환 스프린트 평일 1시간 루틴이 시작됩니다!',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  triggerIcsDownload('ai-sprint-weekly-routine.ics', lines.join('\r\n'));
}

/**
 * 특정 스프린트(또는 전체 스프린트)의 세부 태스크들을 실제 날짜/시간 + 10분 전 알림(.ics)으로 다운로드
 */
export function downloadSprintsTasksIcs(sprints: SprintData[], filename: string): void {
  const nowStamp = formatIcsLocalDateTime(new Date()) + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Sprint Tracker//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  sprints.forEach((sp) => {
    // 같은 슬롯에 여러 태스크가 있으면 시간이 겹치지 않게 순차 배치
    const slotCursorMinutes: Record<string, number> = {};

    sp.tasks.forEach((task) => {
      const [y, m, d] = sp.startDate.split('-').map(Number);
      const slotMeta = SLOT_OFFSET_DAYS[task.slot] || { dayOffset: 0, startHour: 8, weekdayKo: '토' };
      const offsetMin = slotCursorMinutes[task.slot] || 0;
      const durationMin = Math.max(30, Math.round(task.hours * 60));
      slotCursorMinutes[task.slot] = offsetMin + durationMin;

      const start = new Date(y, m - 1, d + slotMeta.dayOffset, slotMeta.startHour, 0, 0);
      start.setMinutes(start.getMinutes() + offsetMin);
      const end = new Date(start.getTime() + durationMin * 60 * 1000);

      const summary = escapeIcsText(`[S${sp.id}] ${task.title} (${task.hours}h)`);
      const desc = escapeIcsText(buildTaskDescription(sp, task));

      lines.push(
        'BEGIN:VEVENT',
        `UID:ai-sprint-s${sp.id}-${task.id}@yohanpro.github.io`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART;TZID=Asia/Seoul:${formatIcsLocalDateTime(start)}`,
        `DTEND;TZID=Asia/Seoul:${formatIcsLocalDateTime(end)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${desc}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT10M',
        'ACTION:DISPLAY',
        `DESCRIPTION:10분 뒤 [${sp.title}] ${escapeIcsText(task.title)} 시작 시간입니다!`,
        'END:VALARM',
        'END:VEVENT'
      );
    });
  });

  lines.push('END:VCALENDAR');
  triggerIcsDownload(filename, lines.join('\r\n'));
}
