"use client";

import React, { useState, useEffect } from 'react';
import BrandMark from './BrandMark';
import HamburgerButton from './HamburgerButton';
import MobileMenu from './MobileMenu';
import type { PublicUser } from '@/lib/auth';

export default function SiteHeader({ user }: { user: PublicUser | null }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, []);

  const handleToggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleCloseMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* Header - contains ONLY the top bar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4">
          <div className="relative flex items-center h-16">
            <HamburgerButton isOpen={isMenuOpen} onClick={handleToggleMenu} />
            <div className="absolute left-1/2 -translate-x-1/2">
              <BrandMark />
            </div>
          </div>
        </div>
      </header>

      {/* MobileMenu - rendered OUTSIDE the header to avoid stacking context issues */}
      <MobileMenu isOpen={isMenuOpen} onClose={handleCloseMenu} user={user} />
    </>
  );
}