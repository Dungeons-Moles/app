/**
 * Web-only social sidebar with X, Discord, and Video links.
 * Renders fixed-position icons outside the PSG1 simulator shell.
 * Only visible on viewports larger than the PSG1 native resolution.
 */
import React, { useState, useEffect, useCallback } from 'react';

import { APP_VERSION } from '../../constants/app';

const PSG1_W = 1240;
const PSG1_H = 1080;
const APK_RELEASE_URL = `https://github.com/Dungeons-Moles/app/releases/download/v${APP_VERSION}/dungeons-and-moles.apk`;

/* ── SVG Icons ─────────────────────────────────────────────── */

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

/* ── Social Button ─────────────────────────────────────────── */

function SocialButton({
  icon,
  href,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  label: string;
}) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (href) window.open(href, '_blank', 'noopener');
    if (onClick) onClick();
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        border: `1.5px solid ${hovered ? '#d4a843' : '#3d3a9e'}`,
        background: hovered ? 'rgba(212, 168, 67, 0.12)' : 'rgba(26, 22, 54, 0.9)',
        color: hovered ? '#d4a843' : '#8b85b0',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.25s ease',
        boxShadow: hovered
          ? '0 0 18px rgba(212, 168, 67, 0.25), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.4)',
        padding: 0,
        outline: 'none',
      }}
    >
      {icon}
    </button>
  );
}

/* ── Main Export ────────────────────────────────────────────── */

export function SocialSidebar() {
  const [muted, setMuted] = useState(false);
  const [visible, setVisible] = useState(
    () => window.innerWidth > PSG1_W || window.innerHeight > PSG1_H
  );

  useEffect(() => {
    const onResize = () => {
      setVisible(window.innerWidth > PSG1_W || window.innerHeight > PSG1_H);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Listen for mute state from AudioContext
  useEffect(() => {
    const onMuteState = (e: Event) => {
      setMuted((e as CustomEvent).detail.muted);
    };
    window.addEventListener('dm-mute-state', onMuteState);
    return () => window.removeEventListener('dm-mute-state', onMuteState);
  }, []);

  const toggleMute = useCallback(() => {
    window.dispatchEvent(new Event('dm-toggle-mute'));
  }, []);

  return (
    <>
      {visible && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            zIndex: 9999,
            animation: 'dm-sidebar-fadeIn 0.6s ease 0.8s both',
          }}
        >
          <SocialButton
            icon={muted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
            onClick={toggleMute}
            label={muted ? 'Unmute' : 'Mute'}
          />
          <SocialButton
            icon={
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>APK</span>
                <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{APP_VERSION}</span>
              </span>
            }
            href={APK_RELEASE_URL}
            label="Download APK"
          />
          <SocialButton icon={<XIcon />} href="https://x.com/DungeonsMoles" label="Follow on X" />
          <SocialButton
            icon={<DiscordIcon />}
            href="https://discord.gg/YqHTHA4B"
            label="Join Discord"
          />
        </div>
      )}

      <style>{`
        @keyframes dm-sidebar-fadeIn {
          from { opacity: 0; transform: translateY(-50%) translateX(12px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
      `}</style>
    </>
  );
}
