import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  Expand,
  Flame,
  Monitor,
  Moon,
  Palette,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';

type Accent = 'ember' | 'sage' | 'lilac' | 'sky';
type Preferences = {
  is24Hour: boolean;
  showSeconds: boolean;
  showDate: boolean;
  accent: Accent;
  ambient: boolean;
  alwaysOnTop: boolean;
};

declare global {
  interface Window {
    stillDesktop?: {
      getInfo: () => Promise<{ platform: string; version: string; packaged: boolean; screensaverAvailable: boolean }>;
      toggleFullscreen: () => Promise<boolean>;
      startScreensaver: () => Promise<void>;
      installScreensaver: () => Promise<{ ok: boolean; message: string }>;
      openScreensaverSettings: () => Promise<void>;
      setAlwaysOnTop: (enabled: boolean) => Promise<boolean>;
      setPreventSleep: (enabled: boolean) => Promise<boolean>;
      onFullscreenChange: (callback: (value: boolean) => void) => () => void;
    };
  }
}

const defaults: Preferences = {
  is24Hour: false,
  showSeconds: true,
  showDate: true,
  accent: 'ember',
  ambient: true,
  alwaysOnTop: false,
};

const accentColors: Record<Accent, { name: string; color: string }> = {
  ember: { name: 'Ember', color: '#d77854' },
  sage: { name: 'Sage', color: '#8ca57b' },
  lilac: { name: 'Lilac', color: '#a38bc6' },
  sky: { name: 'Sky', color: '#73a4b8' },
};

function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem('still-preferences');
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
  } catch {
    return defaults;
  }
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function FlipDigit({ value, index }: { value: string; index: number }) {
  return (
    <span className="digit-wrap" aria-hidden="true">
      <span className="digit-card" key={`${value}-${index}`}>
        <span className="digit-card__top" />
        <span className="digit-card__bottom" />
        <span className="digit-card__value">{value}</span>
        <span className="digit-card__shine" />
      </span>
    </span>
  );
}

function FlipGroup({ value, label }: { value: string; label: string }) {
  return (
    <div className="flip-group">
      <div className="flip-group__digits" aria-label={`${value} ${label}`}>
        {value.split('').map((digit, index) => <FlipDigit key={`${label}-${index}-${digit}`} value={digit} index={index} />)}
      </div>
      <span className="flip-group__label">{label}</span>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button className={`switch ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function App() {
  const isScreensaver = window.location.hash === '#screensaver';
  const [now, setNow] = useState(new Date());
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(() => window.location.hash === '#settings');
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusTotalSeconds, setFocusTotalSeconds] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState('');
  const closeSettingsButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('still-preferences', JSON.stringify(preferences));
    document.documentElement.style.setProperty('--accent', accentColors[preferences.accent].color);
  }, [preferences]);

  useEffect(() => {
    if (!focusRunning) return;
    const interval = window.setInterval(() => {
      setFocusTotalSeconds((total) => {
        if (total <= 1) {
          setFocusRunning(false);
          setToast('Focus complete. Nice work.');
          window.setTimeout(() => setToast(''), 3200);
          return 0;
        }
        return total - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [focusRunning]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    closeSettingsButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (!window.stillDesktop?.onFullscreenChange) return;
    return window.stillDesktop.onFullscreenChange(setIsFullscreen);
  }, []);

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const hours = preferences.is24Hour ? now.getHours() : (now.getHours() % 12 || 12);
  const timeValues = useMemo(() => ({
    hours: pad(hours),
    minutes: pad(now.getMinutes()),
    seconds: pad(now.getSeconds()),
  }), [hours, now]);

  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(preferences.showSeconds ? { second: '2-digit' } : {}),
    hour12: !preferences.is24Hour,
  }).format(now);
  const dayProgress = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400 * 100;

  const runDesktopAction = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) {
        setToast(success);
        window.setTimeout(() => setToast(''), 3200);
      }
    } catch {
      setToast('That action is available in the Windows app.');
      window.setTimeout(() => setToast(''), 3200);
    }
  }, []);

  const toggleFullscreen = () => {
    if (window.stillDesktop) {
      void runDesktopAction(async () => {
        const value = await window.stillDesktop!.toggleFullscreen();
        setIsFullscreen(value);
      });
      return;
    }
    const request = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
    void Promise.resolve(request).catch(() => {
      setToast('Full screen is not available in this browser.');
      window.setTimeout(() => setToast(''), 3200);
    });
  };

  const resetFocus = () => {
    setFocusRunning(false);
    setFocusTotalSeconds(25 * 60);
  };

  const focusMinutes = Math.floor(focusTotalSeconds / 60);
  const focusSeconds = focusTotalSeconds % 60;

  return (
    <main className={`app-shell accent-${preferences.accent} ${preferences.ambient ? 'ambient-on' : ''} ${isFullscreen ? 'is-fullscreen' : ''} ${isScreensaver ? 'saver-mode' : ''}`}>
      <div className="ambient-glow ambient-glow--one" />
      <div className="ambient-glow ambient-glow--two" />
      {!isScreensaver && <header className="topbar">
        <button className="brand" onClick={() => setSettingsOpen(false)} aria-label="Still home">
          <span className="brand-mark"><span /></span>
          <span>still</span>
        </button>
        <div className="topbar__right">
          <div className="status-label"><span className="status-dot" /> local time</div>
          <button className="icon-button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings size={18} strokeWidth={1.8} /></button>
        </div>
      </header>}

      <section className="clock-stage">
        <div className="clock-intro">
          <span className="eyebrow"><Sparkles size={13} /> your time, your way</span>
          <h1>A quieter kind<br /><em>of clock.</em></h1>
          <p>Make space for the moment you’re in.</p>
        </div>

        <div className="clock-display" role="timer" aria-label={timeLabel}>
          <FlipGroup value={timeValues.hours} label={preferences.is24Hour ? 'hours' : 'hour'} />
          <span className="time-separator"><i /><i /></span>
          <FlipGroup value={timeValues.minutes} label="minutes" />
          {preferences.showSeconds && <><span className="time-separator time-separator--small"><i /><i /></span><FlipGroup value={timeValues.seconds} label="seconds" /></>}
          {!preferences.is24Hour && <span className="meridiem">{now.getHours() >= 12 ? 'PM' : 'AM'}</span>}
        </div>

        <div className="date-row">
          {preferences.showDate && <><span className="date-row__line" /><span>{dateLabel}</span><span className="date-row__line" /></>}
        </div>
      </section>

      {!isScreensaver && <section className="utility-panel">
        <div className="day-progress"><span style={{ width: `${dayProgress}%` }} /></div>
        <div className="utility-panel__content">
          <div className="micro-stat"><span className="micro-stat__icon"><Clock3 size={15} /></span><span><strong>{Math.round(dayProgress)}%</strong> of today, gently gone</span></div>
          <div className="utility-actions">
            <button className={`utility-button ${focusOpen ? 'selected' : ''}`} onClick={() => setFocusOpen((open) => !open)}><Flame size={16} /> focus mode</button>
            <button className="utility-button" onClick={toggleFullscreen}><Expand size={16} /> {isFullscreen ? 'exit full screen' : 'full screen'}</button>
          </div>
        </div>
      </section>}

      {!isScreensaver && <footer className="footer-note"><span>designed for slower moments</span><span className="footer-note__rule" /><span>still / 01</span></footer>}

      {focusOpen && !isScreensaver && <section className="focus-card" aria-label="Focus timer">
        <div className="focus-card__head"><div><span className="eyebrow">focus mode</span><h2>One thing at a time.</h2></div><button className="close-small" aria-label="Close focus mode" onClick={() => setFocusOpen(false)}><X size={16} /></button></div>
        <div className="focus-timer">{pad(focusMinutes)}<small>:</small>{pad(focusSeconds)}</div>
        <div className="focus-actions"><button className="primary-button" onClick={() => setFocusRunning((running) => !running)}><Play size={15} fill="currentColor" /> {focusRunning ? 'pause' : 'begin focus'}</button><button className="reset-button" onClick={resetFocus}><RotateCcw size={15} /> reset</button></div>
      </section>}

      {settingsOpen && !isScreensaver && <div className="settings-backdrop" onClick={() => setSettingsOpen(false)}>
        <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
          <div className="settings-panel__top"><button ref={closeSettingsButton} className="back-button" onClick={() => setSettingsOpen(false)}><ArrowLeft size={17} /> close</button><span className="panel-kicker">preferences</span></div>
          <div className="settings-heading"><span className="settings-icon"><Palette size={20} /></span><h2 id="settings-title">Make it yours.</h2><p>A few small choices for a better kind of time.</p></div>
          <div className="settings-list">
            <div className="setting-row"><div><strong>24-hour time</strong><span>Use a full-day clock</span></div><Switch checked={preferences.is24Hour} onChange={(value) => updatePreference('is24Hour', value)} label="24-hour time" /></div>
            <div className="setting-row"><div><strong>Show seconds</strong><span>Keep the little moments visible</span></div><Switch checked={preferences.showSeconds} onChange={(value) => updatePreference('showSeconds', value)} label="Show seconds" /></div>
            <div className="setting-row"><div><strong>Show date</strong><span>A gentle reminder of today</span></div><Switch checked={preferences.showDate} onChange={(value) => updatePreference('showDate', value)} label="Show date" /></div>
            <div className="setting-row"><div><strong>Ambient glow</strong><span>A warmer room for your clock</span></div><Switch checked={preferences.ambient} onChange={(value) => updatePreference('ambient', value)} label="Ambient glow" /></div>
            <div className="setting-row"><div><strong>Always on top</strong><span>Keep Still above other windows</span></div><Switch checked={preferences.alwaysOnTop} onChange={(value) => { updatePreference('alwaysOnTop', value); if (window.stillDesktop) void window.stillDesktop.setAlwaysOnTop(value); }} label="Always on top" /></div>
          </div>
          <div className="color-setting"><span><strong>Accent color</strong><small>Choose your atmosphere</small></span><div className="color-options">{Object.entries(accentColors).map(([key, accent]) => <button key={key} className={`color-swatch ${preferences.accent === key ? 'selected' : ''}`} style={{ backgroundColor: accent.color }} aria-label={accent.name} aria-pressed={preferences.accent === key} onClick={() => updatePreference('accent', key as Accent)} />)}</div></div>
          <div className="settings-divider" />
          <div className="windows-tools"><div className="windows-tools__heading"><Monitor size={18} /><div><strong>Windows mode</strong><span>Turn your quiet clock into a screensaver.</span></div></div><button className="outline-button" onClick={() => runDesktopAction(() => window.stillDesktop?.startScreensaver() ?? Promise.reject(), 'Screensaver preview opened.')}>preview screensaver <ChevronDown size={15} /></button><button className="text-button" onClick={() => runDesktopAction(async () => { const result = await window.stillDesktop?.installScreensaver(); if (!result) throw new Error('Open Still in the Windows app to install its screensaver.'); if (!result.ok) throw new Error(result.message); }, 'Still is ready in Windows screensaver settings.')}>install as screensaver <span>↗</span></button><button className="text-button" onClick={() => runDesktopAction(() => window.stillDesktop?.openScreensaverSettings() ?? Promise.reject(), 'Windows screensaver settings opened.')}>open Windows settings <span>↗</span></button></div>
          <p className="settings-footnote"><Moon size={13} /> Still can be a screensaver, but Windows keeps its secure lock screen separate.</p>
        </aside>
      </div>}

      {toast && <div className="toast" role="status"><span className="status-dot" />{toast}</div>}
    </main>
  );
}

export default App;
