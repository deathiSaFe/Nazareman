'use client';

import { useEffect, useState } from 'react';
import { ActivityAreaPicker } from '@/components/add-topic/ActivityAreaPicker';
import type { ActivityAreaValue, PageData } from '@/types/topic';

type SuggestionKind =
  | 'FIELD_CHANGE'
  | 'CLOSED'
  | 'MOVED'
  | 'MISSING_INFO'
  | 'PHOTO'
  | 'GENERAL';

type SuggestionStatus = 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';

interface OwnSuggestion {
  id: string;
  kind: SuggestionKind;
  changes: Record<string, unknown> | null;
  note: string | null;
  status: SuggestionStatus;
  decisionNote: string | null;
  createdAt: string;
}

const KIND_LABELS: Record<SuggestionKind, string> = {
  FIELD_CHANGE: 'اصلاح اطلاعات',
  CLOSED: 'این مکان بسته شده',
  MOVED: 'تغییر مکان',
  MISSING_INFO: 'اطلاعات ناقص است',
  PHOTO: 'پیشنهاد تصویر',
  GENERAL: 'سایر',
};

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  PENDING_REVIEW: 'در انتظار بررسی',
  CHANGES_REQUESTED: 'نیاز به اصلاح',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
};

const FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'name', label: 'نام صفحه' },
  { key: 'description', label: 'معرفی' },
  { key: 'workingHours', label: 'ساعات کاری' },
  { key: 'imageUrl', label: 'تصویر' },
  { key: 'address', label: 'آدرس' },
];

function currentValue(page: PageData, field: string): string {
  switch (field) {
    case 'name':
      return page.name;
    case 'description':
      return page.description ?? '';
    case 'workingHours':
      return page.workingHours ?? '';
    case 'imageUrl':
      return page.imageUrl ?? '';
    case 'address':
      return page.address ?? '';
    default:
      return '';
  }
}

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[14px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

export function SuggestionPanel({
  topicId,
  page,
}: {
  topicId: string;
  page: PageData;
}) {
  const [suggestions, setSuggestions] = useState<OwnSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState<SuggestionKind>('FIELD_CHANGE');
  const [field, setField] = useState('description');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [activity, setActivity] = useState<ActivityAreaValue>({ scope: 'NATIONAL' });

  const [editingId, setEditingId] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/topics/${encodeURIComponent(topicId)}/suggestions`)
      .then((response) => response.json().catch(() => null))
      .then((payload) => {
        if (!cancelled) {
          setSuggestions((payload?.suggestions as OwnSuggestion[]) ?? []);
        }
      })
      .catch(() => {
        // non-fatal — the panel still renders the form
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [topicId]);

  function resetForm() {
    setKind('FIELD_CHANGE');
    setField('description');
    setValue('');
    setNote('');
    setActivity({ scope: 'NATIONAL' });
    setEditingId(null);
  }

  function startEdit(suggestion: OwnSuggestion) {
    setEditingId(suggestion.id);
    setKind(suggestion.kind);
    setNote(suggestion.note ?? '');

    const changes = suggestion.changes ?? {};
    if (suggestion.kind === 'FIELD_CHANGE') {
      const keys = Object.keys(changes);
      const first = keys[0] ?? 'description';
      setField(first);
      setValue(typeof changes[first] === 'string' ? (changes[first] as string) : '');
      setActivity({ scope: 'NATIONAL' });
    } else if (suggestion.kind === 'PHOTO') {
      setValue(typeof changes.imageUrl === 'string' ? (changes.imageUrl as string) : '');
    } else if (suggestion.kind === 'MOVED') {
      setActivity({
        scope: (changes.scope as ActivityAreaValue['scope']) ?? 'NATIONAL',
        provinceSlug: typeof changes.provinceSlug === 'string' ? changes.provinceSlug : undefined,
        citySlug: typeof changes.citySlug === 'string' ? changes.citySlug : undefined,
        address: typeof changes.address === 'string' ? changes.address : undefined,
      });
    }
  }

  function buildChanges(): Record<string, unknown> {
    switch (kind) {
      case 'FIELD_CHANGE':
        return { [field]: value.trim() };
      case 'MOVED': {
        const changes: Record<string, unknown> = {};
        if (activity.scope) changes.scope = activity.scope;
        if (activity.provinceSlug) changes.provinceSlug = activity.provinceSlug;
        if (activity.citySlug) changes.citySlug = activity.citySlug;
        if (activity.address) changes.address = activity.address;
        return changes;
      }
      case 'PHOTO':
        return { imageUrl: value.trim() };
      default:
        return {};
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const payload = {
      kind,
      changes: buildChanges(),
      note: note.trim(),
    };

    try {
      const url = editingId
        ? `/api/topics/${encodeURIComponent(topicId)}/suggestions/${editingId}`
        : `/api/topics/${encodeURIComponent(topicId)}/suggestions`;

      const response = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? 'ثبت پیشنهاد ممکن نشد.');
        return;
      }

      setMessage(
        editingId
          ? 'پیشنهاد اصلاح‌شده برای بررسی ارسال شد.'
          : 'پیشنهاد شما ثبت شد و پس از بررسی مدیر در صفحه اعمال خواهد شد.'
      );
      resetForm();
      await reloadList();
    } catch {
      setError('ثبت پیشنهاد ممکن نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  async function reloadList() {
    try {
      const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}/suggestions`);
      const payload = await response.json().catch(() => null);
      setSuggestions((payload?.suggestions as OwnSuggestion[]) ?? []);
    } catch {
      // non-fatal
    }
  }

  return (
    <div className="space-y-4">
      {loading ? null : suggestions.length > 0 ? (
        <div className="divide-y divide-ink-900/[0.06] rounded-2xl bg-ink-900/[0.02] p-4 ring-1 ring-ink-900/[0.06]">
          <p className="mb-2 text-[12px] font-bold text-ink-500">پیشنهادهای شما</p>
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-800">
                  {KIND_LABELS[suggestion.kind]}
                </span>
                <span className="rounded-full bg-ink-900/5 px-3 py-0.5 text-[11px] font-bold text-ink-600">
                  {STATUS_LABELS[suggestion.status]}
                </span>
              </div>

              {suggestion.note && (
                <p className="mt-1 text-[13px] leading-6 text-ink-600">{suggestion.note}</p>
              )}

              {suggestion.decisionNote &&
                (suggestion.status === 'CHANGES_REQUESTED' || suggestion.status === 'REJECTED') && (
                  <p
                    className={`mt-1 text-[12px] leading-6 ${
                      suggestion.status === 'REJECTED' ? 'text-red-600' : 'text-saffron-700'
                    }`}
                  >
                    {suggestion.status === 'REJECTED' ? 'دلیل رد: ' : 'پیام مدیر: '}
                    {suggestion.decisionNote}
                  </p>
                )}

              {suggestion.status === 'CHANGES_REQUESTED' && (
                <button
                  type="button"
                  onClick={() => startEdit(suggestion)}
                  className="mt-2 rounded-full bg-white px-4 py-1.5 text-[12px] font-bold text-turquoise-700 ring-1 ring-turquoise-200 transition-colors hover:bg-turquoise-50"
                >
                  اصلاح و ارسال مجدد
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-[13px] font-bold text-ink-900">
            {editingId ? 'اصلاح پیشنهاد' : 'پیشنهاد جدید'}
          </span>
          <p className="text-[12px] leading-6 text-ink-500">
            پیشنهاد شما پس از بررسی مدیر منتشر خواهد شد.
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-[13px] font-bold text-ink-900">نوع پیشنهاد</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SuggestionKind)}
            className={inputClass}
          >
            {(Object.keys(KIND_LABELS) as SuggestionKind[]).map((item) => (
              <option key={item} value={item}>
                {KIND_LABELS[item]}
              </option>
            ))}
          </select>
        </label>

        {kind === 'FIELD_CHANGE' && (
          <>
            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-ink-900">بخش</span>
              <select
                value={field}
                onChange={(event) => setField(event.target.value)}
                className={inputClass}
              >
                {FIELD_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl bg-ink-900/[0.02] p-3 ring-1 ring-ink-900/[0.06]">
              <span className="block text-[12px] font-bold text-ink-500">مقدار فعلی</span>
              <p className="mt-1 whitespace-pre-line break-words text-[13px] leading-6 text-ink-700">
                {currentValue(page, field) || '—'}
              </p>
            </div>

            <label className="block">
              <span className="mb-2 block text-[13px] font-bold text-ink-900">مقدار پیشنهادی</span>
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={3}
                className={`${inputClass} resize-y leading-7`}
              />
            </label>
          </>
        )}

        {kind === 'PHOTO' && (
          <label className="block">
            <span className="mb-2 block text-[13px] font-bold text-ink-900">
              نشانی تصویر پیشنهادی
            </span>
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://..."
              dir="ltr"
              className={inputClass}
            />
          </label>
        )}

        {kind === 'MOVED' && (
          <div className="space-y-2">
            <span className="block text-[13px] font-bold text-ink-900">محل جدید</span>
            <ActivityAreaPicker value={activity} onChange={setActivity} />
          </div>
        )}

        {(kind === 'CLOSED' ||
          kind === 'MOVED' ||
          kind === 'MISSING_INFO' ||
          kind === 'GENERAL' ||
          (kind === 'FIELD_CHANGE' && true)) && (
          <label className="block">
            <span className="mb-2 block text-[13px] font-bold text-ink-900">توضیح شما</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder={
                kind === 'CLOSED'
                  ? 'مثلاً: این فروشگاه دیگر فعالیت نمی‌کند.'
                  : kind === 'MOVED'
                    ? 'مثلاً: این مکان به آدرس جدید منتقل شده است.'
                    : kind === 'MISSING_INFO'
                      ? 'مثلاً: شماره تماس این مجموعه در صفحه نیست.'
                      : kind === 'GENERAL'
                        ? 'توضیح پیشنهاد خود را بنویسید.'
                        : 'توضیح اضافه (اختیاری)'
              }
              className={`${inputClass} resize-y leading-7`}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-[13px] font-bold text-red-700">
            {error}
          </p>
        )}

        {message && (
          <p role="status" className="rounded-xl bg-turquoise-600/10 p-3 text-[13px] font-bold text-turquoise-700">
            {message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 rounded-full bg-turquoise-600 px-6 py-3 text-[14px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all duration-200 hover:bg-turquoise-700 disabled:opacity-50"
          >
            {submitting
              ? 'در حال ارسال...'
              : editingId
                ? 'ارسال مجدد برای بررسی'
                : 'ثبت پیشنهاد'}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={submitting}
              className="rounded-full bg-white px-6 py-3 text-[14px] font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-50"
            >
              انصراف
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
