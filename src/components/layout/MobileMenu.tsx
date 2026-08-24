"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicUser } from '@/lib/auth';
import { toPersianDigits } from '@/lib/persian-digits';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: PublicUser | null;
  /** Server-computed unread inbox count — shown as a badge next to
   *  «صندوق پیام‌ها» when there are unread messages. */
  unreadCount?: number;
  /** Profile destination — carries the originating topic path (`?next=`)
   *  when the menu was opened from a topic page, so the profile page can
   *  offer a «بازگشت به صفحه موضوع» return link. */
  profileHref?: string;
  /** Signed-out entry — when opened from a topic page, routes through login
   *  with the topic-aware profile URL as the return target, so the topic
   *  context survives the login round-trip. */
  loginHref?: string;
}

export default function MobileMenu({
  isOpen,
  onClose,
  user,
  unreadCount = 0,
  profileHref = '/profile',
  loginHref = '/login',
}: MobileMenuProps) {
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    onClose();
    router.push('/');
    router.refresh();
  }

  const menuItems = [
    ...(user
      ? [{ label: 'پروفایل من', href: profileHref, icon: '👤' }]
      : [{ label: 'ورود / ثبت‌نام', href: loginHref, icon: '🔑' }]),
    // Same wording and destination as the homepage «افزودن موضوع» button.
    { label: 'افزودن موضوع', href: '/add-topic', icon: '➕' },
    { label: 'صفحه‌های من', href: '/my-topics', icon: '📝' },
    { label: 'علاقه‌مندی‌ها', href: '/favorites', icon: '❤️' },
    ...(user ? [{ label: 'صندوق پیام‌ها', href: '/inbox', icon: '✉️' }] : []),
  ];

  return (
    <>
      {/* Viewport-sized clipping wrapper: keeps the off-canvas drawer (translated
          fully off-screen when closed) from creating horizontal page overflow. */}
      <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
        {/* Backdrop */}
        {isOpen && (
          <div
            className="pointer-events-auto absolute inset-0 bg-black/60"
            onClick={onClose}
            aria-hidden="true"
          />
        )}

        {/* Drawer - solid white background, highest z-index */}
        <div
          className={`pointer-events-auto absolute top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="منوی اصلی"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900">منو</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="بستن منو"
            >
              <svg
                className="w-6 h-6 text-gray-900"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Signed-in state */}
          {user && (
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {user.displayName || 'کاربر'}
                </p>
                <p dir="ltr" className="truncate text-xs text-gray-500">
                  {user.phoneNumber}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  user.phoneVerified
                    ? 'bg-emerald-600/10 text-emerald-700'
                    : 'bg-saffron-500/10 text-saffron-700'
                }`}
              >
                {user.phoneVerified ? 'شماره تأیید شده' : 'تأیید نشده'}
              </span>
            </div>
          )}

          {/* Nav */}
          <nav className="p-4 flex-1">
            <ul className="space-y-2">
              {menuItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-3 p-4 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
                  >
                    <span className="text-2xl transition-transform duration-200 group-hover:scale-110">
                      {item.icon}
                    </span>
                    <span className="text-base font-medium text-gray-900">
                      {item.label}
                    </span>
                    {/* Unread inbox badge — only for the signed-in inbox entry. */}
                    {item.href === '/inbox' && unreadCount > 0 && (
                      <span className="ms-auto grid min-w-6 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                        {toPersianDigits(unreadCount)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}

              {user && (
                <li>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-3 p-4 rounded-xl hover:bg-red-50 transition-all duration-200 text-start"
                  >
                    <span className="text-2xl">🚪</span>
                    <span className="text-base font-medium text-red-700">خروج</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
