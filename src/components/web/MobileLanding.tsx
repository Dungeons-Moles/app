/**
 * Mobile landing page shown to visitors on mobile browsers.
 * Full-screen parchment aesthetic matching the game's hand-drawn ink style.
 */
import React, { useState } from 'react';
import { APP_VERSION } from '../../constants/app';
import {
  VideoOverlay,
  isDemoRoute,
  navigateFromDemo,
  navigateToDemo,
} from './SocialSidebar';

const APK_RELEASE_URL = `https://github.com/Dungeons-Moles/app/releases/download/v${APP_VERSION}/dungeons-and-moles.apk`;

// Resolve require() assets to usable URIs for raw <img> tags
function resolveAsset(src: unknown): string {
  if (typeof src === 'string') return src;
  if (src && typeof src === 'object' && 'uri' in (src as Record<string, unknown>))
    return (src as { uri: string }).uri;
  return String(src);
}

const LOGO_URI = resolveAsset(require('../../../assets/branding/logo.webp'));
const BG_URI = resolveAsset(require('../../../assets/ui/backgrounds/loading-background.webp'));
const STAINS_URI = resolveAsset(require('../../../assets/ui/backgrounds/stains-background.webp'));

/* ── SVG Icons (ink-stroke style) ──────────────────────────── */

function DownloadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TvIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2l5 5 5-5" />
      <rect x="2" y="7" width="20" height="14" rx="2" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  );
}

/* ── Ink Button ─────────────────────────────────────────────── */

function InkButton({
  icon,
  label,
  href,
  onClick,
  sublabel,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  sublabel?: string;
  delay: number;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <a
      href={href}
      target={href ? '_blank' : undefined}
      rel={href ? 'noopener noreferrer' : undefined}
      onClick={(event) => {
        if (!onClick) return;
        event.preventDefault();
        onClick();
      }}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className="dm-ink-btn"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '15px 24px',
        borderRadius: 4,
        border: '1.8px solid #3d2b1f',
        background: pressed ? 'rgba(61,43,31,0.08)' : 'rgba(230,213,184,0.55)',
        color: '#3d2b1f',
        textDecoration: 'none',
        width: '100%',
        maxWidth: 320,
        boxSizing: 'border-box' as const,
        transition: 'background 0.15s ease, transform 0.1s ease',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        animation: `dm-ink-fadeUp 0.5s ease ${delay}s both`,
        boxShadow: '1px 2px 6px rgba(61,43,31,0.12)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.7 }}>
        {icon}
      </span>
      <span
        style={{
          fontFamily: "'IM Fell English', 'Georgia', serif",
          fontSize: 19,
          fontWeight: 400,
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        {label}
        {sublabel && (
          <span
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 12,
              opacity: 0.45,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
    </a>
  );
}

/* ── Separator ─────────────────────────────────────────────── */

function InkDivider({ delay }: { delay: number }) {
  return (
    <div
      style={{
        width: 120,
        height: 1,
        background: 'linear-gradient(90deg, transparent, #3d2b1f44, #3d2b1f66, #3d2b1f44, transparent)',
        margin: '6px 0 2px',
        animation: `dm-ink-fadeUp 0.5s ease ${delay}s both`,
      }}
    />
  );
}

/* ── Main Component ────────────────────────────────────────── */

export function MobileLanding() {
  const [demoOpen, setDemoOpen] = useState(isDemoRoute);

  React.useEffect(() => {
    const onPopState = () => setDemoOpen(isDemoRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <>
      {/* Google Fonts link for IM Fell English */}
      <link
        href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Parchment background */}
        <img
          src={BG_URI}
          alt=""
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
          }}
        />

        {/* Ink stain overlay (subtle) */}
        <img
          src={STAINS_URI}
          alt=""
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.06,
            mixBlendMode: 'multiply',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        {/* Vignette overlay */}
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(61,43,31,0.25) 100%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '48px 28px 36px',
            minHeight: '100vh',
            justifyContent: 'center',
            boxSizing: 'border-box' as const,
          }}
        >
          {/* Logo */}
          <img
            src={LOGO_URI}
            alt="Dungeons & Moles"
            style={{
              width: '94%',
              maxWidth: 372,
              height: 'auto',
              marginBottom: 14,
              animation: 'dm-ink-fadeUp 0.6s ease 0.1s both',
              filter: 'drop-shadow(0 2px 8px rgba(61,43,31,0.15))',
            }}
          />

          {/* Tagline */}
          <p
            style={{
              fontFamily: "'IM Fell English', 'Georgia', serif",
              fontStyle: 'italic',
              fontSize: 17,
              color: '#5c4033',
              textAlign: 'center',
              margin: '0 0 6px 0',
              lineHeight: 1.6,
              maxWidth: 300,
              animation: 'dm-ink-fadeUp 0.5s ease 0.25s both',
            }}
          >
            A roguelike dungeon crawler on Solana.
          </p>
          <p
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13,
              color: '#8a7a6a',
              textAlign: 'center',
              margin: '0 0 28px 0',
              animation: 'dm-ink-fadeUp 0.5s ease 0.3s both',
            }}
          >
            Play on desktop or download the APK.
            <br />
            Soon on Solana Seeker and PlaySolana PSG1.
          </p>

          <InkDivider delay={0.35} />

          {/* Links */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              marginTop: 20,
            }}
          >
            <InkButton
              icon={<DownloadIcon />}
              label="Download APK"
              sublabel={`v${APP_VERSION}`}
              href={APK_RELEASE_URL}
              delay={0.4}
            />
            <InkButton
              icon={<TvIcon />}
              label="Watch Demo"
              onClick={navigateToDemo}
              delay={0.5}
            />
            <InkButton
              icon={<XIcon />}
              label="Follow on X"
              href="https://x.com/DungeonsMoles"
              delay={0.6}
            />
            <InkButton
              icon={<DiscordIcon />}
              label="Join Discord"
              href="https://discord.gg/YqHTHA4B"
              delay={0.7}
            />
          </div>

          {/* Footer */}
          <p
            style={{
              fontFamily: "'IM Fell English', 'Georgia', serif",
              fontStyle: 'italic',
              fontSize: 18,
              color: '#8a7a6a',
              textAlign: 'center',
              marginTop: 32,
              animation: 'dm-ink-fadeUp 0.5s ease 0.8s both',
            }}
          >
            v{APP_VERSION}
          </p>
        </div>
      </div>

      {demoOpen && <VideoOverlay onClose={navigateFromDemo} />}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; height: 100%; overflow-x: hidden; }
        body { margin: 0 !important; padding: 0 !important; background: #e6d5b8; }
        -webkit-tap-highlight-color: transparent;

        @keyframes dm-ink-fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .dm-ink-btn:active {
          background: rgba(61,43,31,0.08) !important;
        }
      `}</style>
    </>
  );
}
