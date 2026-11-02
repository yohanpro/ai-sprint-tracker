import React, { useState } from 'react';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { IssueComment } from '../data/sprintPlan';

interface CommentSectionProps {
  comments: IssueComment[]; // 이 이슈의 삭제되지 않은 댓글 (시간순)
  onAdd: (body: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
}

const formatCommentTime = (iso: string): string =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// Cmd/Ctrl+Enter 등록 (한글 IME 조합 중 Enter는 무시)
const isSubmitShortcut = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean =>
  e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing;

export default function CommentSection({ comments, onAdd, onEdit, onDelete }: CommentSectionProps) {
  const [draft, setDraft] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const submitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft('');
  };

  const startEdit = (comment: IssueComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.body);
    setConfirmDeleteId(null);
  };

  const submitEdit = () => {
    const trimmed = editDraft.trim();
    if (!editingId || !trimmed) return;
    onEdit(editingId, trimmed);
    setEditingId(null);
  };

  return (
    <div className="space-y-2 pt-1">
      <label className="flex items-center gap-1.5 text-xs font-bold text-[#42526E]">
        <MessageSquare className="w-3.5 h-3.5" />⑤ 진행 로그 · 댓글 ({comments.length})
      </label>

      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="p-3 rounded-[3px] bg-[#F4F5F7] space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#6B778C]">
                <span>
                  {formatCommentTime(c.createdAt)}
                  {c.updatedAt !== c.createdAt && ' (수정됨)'}
                </span>
                {editingId !== c.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDeleteId === c.id ? (
                      <>
                        <span className="text-[#BF2600] font-semibold">삭제할까요?</span>
                        <button
                          onClick={() => {
                            onDelete(c.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-1.5 py-0.5 rounded-[3px] bg-[#DE350B] hover:bg-[#FF5630] text-white font-semibold"
                        >
                          삭제
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 rounded-[3px] hover:bg-[#EBECF0] text-[#42526E]"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(c)}
                          className="p-1 rounded-[3px] hover:bg-[#EBECF0] text-[#6B778C]"
                          aria-label="댓글 수정"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="p-1 rounded-[3px] hover:bg-[#EBECF0] text-[#6B778C]"
                          aria-label="댓글 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {editingId === c.id ? (
                <div className="space-y-1.5">
                  <textarea
                    rows={3}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (isSubmitShortcut(e)) {
                        e.preventDefault();
                        submitEdit();
                      }
                    }}
                    autoFocus
                    className="w-full p-2 rounded-[3px] border border-[#DFE1E6] focus:border-[#0052CC] bg-white text-xs sm:text-sm text-[#172B4D] outline-none leading-relaxed"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2.5 py-1 rounded-[3px] hover:bg-[#EBECF0] text-xs text-[#42526E]"
                    >
                      취소
                    </button>
                    <button
                      onClick={submitEdit}
                      disabled={!editDraft.trim()}
                      className="px-2.5 py-1 rounded-[3px] bg-[#0052CC] hover:bg-[#0065FF] disabled:opacity-40 text-white text-xs font-semibold"
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[#172B4D] leading-relaxed whitespace-pre-wrap break-words">
                  {c.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (isSubmitShortcut(e)) {
              e.preventDefault();
              submitDraft();
            }
          }}
          placeholder="오늘 시도한 것, 막힌 점, 다음에 할 일을 짧게 남겨두세요..."
          className="w-full p-3 rounded-[3px] border border-[#DFE1E6] focus:border-[#0052CC] text-xs sm:text-sm text-[#172B4D] outline-none leading-relaxed"
        />
        <div className="flex items-center justify-end gap-2">
          <span className="hidden sm:inline text-[11px] text-[#6B778C]">⌘/Ctrl + Enter</span>
          <button
            onClick={submitDraft}
            disabled={!draft.trim()}
            className="px-3 py-1.5 rounded-[3px] bg-[#0052CC] hover:bg-[#0065FF] disabled:opacity-40 text-white text-xs font-semibold"
          >
            댓글 등록
          </button>
        </div>
      </div>
    </div>
  );
}
