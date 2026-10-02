import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FolderOpen, Minus, Monitor, Moon, Plus, RotateCcw, Settings, Sun, X } from "lucide-react";
import { CursorStyle, DimLevel, Preferences, WindowMaterial } from "../types";
import { ResolvedTheme, schemePreview, TERMINAL_SCHEMES } from "../theme";
import { Theme } from "../ThemeContext";
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_PREFERENCES, FONT_SIZE_MAX, FONT_SIZE_MIN } from "../hooks/useLayout";
import { KEYS } from "../keymap";
import { IconButton, Kbd, Overlay, PANEL_CLASS } from "./ui";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  preferences: Preferences;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
  showPaneHeaders: boolean;
  onShowPaneHeadersChange: (show: boolean) => void;
  startDirectory: string;
  onStartDirectoryChange: (dir: string) => void;
  /** アクティブペインの現在のディレクトリ（「ここを使う」ボタン用） */
  currentDirectory?: string;
  resolvedTheme: ResolvedTheme;
  /** Mica が使える環境（Windows 11）か */
  micaSupported: boolean;
}

/** 日本語グリフなどを補うために、どのプリセットにも後ろに付けるフォールバック */
const FONT_FALLBACK = '"Noto Sans JP", "BIZ UDGothic", "Meiryo", "Yu Gothic", Consolas, monospace';
const FONT_PRESETS = ["Cascadia Mono", "Cascadia Code", "JetBrains Mono", "Fira Code", "Source Code Pro", "Consolas", "BIZ UDGothic", "MS Gothic"];

/**
 * ローカルにフォントがインストールされているかを、汎用フォントとの描画幅の差で判定する。
 * （document.fonts.check はローカルフォントの有無を正しく返さないため）
 */
function isFontInstalled(name: string): boolean {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return true;
  const sample = "mmmmmmmmmmlli1O0WW@#";
  return ["monospace", "serif", "sans-serif"].some((generic) => {
    ctx.font = `16px ${generic}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `16px "${name}", ${generic}`;
    return ctx.measureText(sample).width !== base;
  });
}

function primaryFont(fontFamily: string): string {
  return fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <Overlay open={open} onClose={onClose} align="center" label="Settings">
      <div className={`${PANEL_CLASS} flex max-h-[84vh] max-w-[720px] flex-col`}>
        <div className="flex items-center gap-2 border-b border-border-dim px-5 py-3">
          <Settings size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-tx-primary">Settings</span>
          <span className="ml-auto flex items-center gap-2 text-[11px] text-tx-muted">
            Changes are saved automatically <Kbd keys={KEYS.settings} />
          </span>
          <IconButton label="Close" shortcut="Esc" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <SettingsBody {...props} />
        </div>
      </div>
    </Overlay>
  );
}

function SettingsBody({
  theme,
  onThemeChange,
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  preferences,
  onPreferencesChange,
  showPaneHeaders,
  onShowPaneHeadersChange,
  startDirectory,
  onStartDirectoryChange,
  currentDirectory,
  resolvedTheme,
  micaSupported,
}: SettingsPanelProps) {
  const installed = useMemo(() => new Map(FONT_PRESETS.map((f) => [f, isFontInstalled(f)])), []);
  const [customFont, setCustomFont] = useState(fontFamily);
  const [dir, setDir] = useState(startDirectory);
  useEffect(() => setCustomFont(fontFamily), [fontFamily]);
  useEffect(() => setDir(startDirectory), [startDirectory]);

  const current = primaryFont(fontFamily);
  const commitDir = (value: string) => {
    if (value.trim() && value.trim() !== startDirectory) onStartDirectoryChange(value.trim());
  };

  return (
    <div className="space-y-6">
      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-3">
          <ThemeCard label="Midnight" icon={<Moon size={13} />} active={theme === "dark"} onClick={() => onThemeChange("dark")} variant="dark" />
          <ThemeCard label="Daylight" icon={<Sun size={13} />} active={theme === "light"} onClick={() => onThemeChange("light")} variant="light" />
          <ThemeCard label="Follow system" icon={<Monitor size={13} />} active={theme === "system"} onClick={() => onThemeChange("system")} variant="split" />
        </div>
      </Section>

      <Section title="Terminal font">
        <div className="flex flex-wrap gap-1.5">
          {FONT_PRESETS.map((font) => {
            const available = installed.get(font);
            return (
              <button
                key={font}
                type="button"
                onClick={() => onFontFamilyChange(`"${font}", ${FONT_FALLBACK}`)}
                title={available ? font : `${font} (not installed — a fallback font will be used)`}
                className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                  current === font
                    ? "border-accent bg-accent-dim text-tx-primary"
                    : "border-border-strong text-tx-secondary hover:border-tx-muted"
                } ${available ? "" : "opacity-45"}`}
                style={{ fontFamily: `"${font}", monospace` }}
              >
                {font}
              </button>
            );
          })}
        </div>
        <Row label="Custom font-family" hint="Any CSS font-family list">
          <input
            value={customFont}
            onChange={(e) => setCustomFont(e.target.value)}
            onBlur={() => customFont.trim() && onFontFamilyChange(customFont)}
            onKeyDown={(e) => {
              if (!e.nativeEvent.isComposing && e.key === "Enter") onFontFamilyChange(customFont);
            }}
            spellCheck={false}
            className="h-8 w-full min-w-0 rounded-md border border-border-strong bg-bg-main px-2.5 font-mono text-[12px] text-tx-primary outline-none focus:border-accent"
          />
        </Row>
        <Row label="Size">
          <div className="flex items-center gap-1">
            <IconButton label="Decrease font size" shortcut={KEYS.fontDown} disabled={fontSize <= FONT_SIZE_MIN} onClick={() => onFontSizeChange(fontSize - 1)}>
              <Minus size={13} />
            </IconButton>
            <span className="w-12 text-center font-mono text-[13px] tabular-nums text-tx-primary">{fontSize}px</span>
            <IconButton label="Increase font size" shortcut={KEYS.fontUp} disabled={fontSize >= FONT_SIZE_MAX} onClick={() => onFontSizeChange(fontSize + 1)}>
              <Plus size={13} />
            </IconButton>
          </div>
        </Row>
        <Row label="Line height">
          <Segmented
            value={String(preferences.lineHeight)}
            options={[
              { value: "1.15", label: "Compact" },
              { value: "1.3", label: "Normal" },
              { value: "1.5", label: "Relaxed" },
            ]}
            onChange={(v) => onPreferencesChange({ lineHeight: Number(v) })}
          />
        </Row>
        <FontPreview
          fontFamily={fontFamily}
          fontSize={fontSize}
          lineHeight={preferences.lineHeight}
          cursorStyle={preferences.cursorStyle}
          scheme={schemePreview(preferences.colorScheme, resolvedTheme)}
        />
      </Section>

      <Section title="Terminal colors">
        <div className="grid grid-cols-3 gap-2">
          {TERMINAL_SCHEMES.map((scheme) => {
            const preview = schemePreview(scheme.id, resolvedTheme);
            const active = preferences.colorScheme === scheme.id;
            const adaptive = scheme.id === "elecxterm" || (scheme.dark && scheme.light);
            return (
              <button
                key={scheme.id}
                type="button"
                onClick={() => onPreferencesChange({ colorScheme: scheme.id })}
                aria-pressed={active}
                className={`overflow-hidden rounded-lg border text-left transition-shadow ${
                  active ? "border-accent shadow-[0_0_0_3px_var(--accent-dim)]" : "border-border-strong hover:border-tx-muted"
                }`}
              >
                <div className="px-2.5 py-2 font-mono text-[11px]" style={{ background: preview.background, color: preview.foreground }}>
                  <div className="truncate">
                    <span style={{ color: preview.colors[1] }}>~</span> <span style={{ color: preview.colors[3] }}>git</span> log
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    {preview.colors.map((color, i) => (
                      <span key={i} className="h-2 w-2 rounded-full" style={{ background: color }} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border-dim px-2.5 py-1 text-[11.5px] text-tx-secondary">
                  <span className="truncate">{scheme.name.replace(" (follows UI)", "")}</span>
                  {adaptive && <span className="text-[10px] text-tx-muted" title="Switches with the light / dark theme">◐</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Cursor">
        <Row label="Style">
          <Segmented<CursorStyle>
            value={preferences.cursorStyle}
            options={[
              { value: "bar", label: "▏ Bar" },
              { value: "block", label: "█ Block" },
              { value: "underline", label: "▁ Underline" },
            ]}
            onChange={(cursorStyle) => onPreferencesChange({ cursorStyle })}
          />
        </Row>
        <Row label="Blink">
          <Toggle checked={preferences.cursorBlink} onChange={(cursorBlink) => onPreferencesChange({ cursorBlink })} label="Cursor blink" />
        </Row>
      </Section>

      <Section title="Panes">
        <Row label="Pane headers" hint="Title, directory and actions above each pane">
          <Toggle checked={showPaneHeaders} onChange={onShowPaneHeadersChange} label="Show pane headers" />
        </Row>
        <Row label="Dim inactive panes" hint="Makes the focused pane stand out">
          <Segmented<DimLevel>
            value={preferences.dimInactive}
            options={[
              { value: "off", label: "Off" },
              { value: "subtle", label: "Subtle" },
              { value: "strong", label: "Strong" },
            ]}
            onChange={(dimInactive) => onPreferencesChange({ dimInactive })}
          />
        </Row>
      </Section>

      <Section title="Window">
        <Row
          label="Background material"
          hint={micaSupported ? "Mica lets your wallpaper tint the title bar and gaps" : "Mica requires Windows 11"}
        >
          <Segmented<WindowMaterial>
            value={micaSupported ? preferences.windowMaterial : "solid"}
            options={
              micaSupported
                ? [
                    { value: "solid", label: "Solid" },
                    { value: "mica", label: "Mica" },
                    { value: "tabbed", label: "Mica Alt" },
                  ]
                : [{ value: "solid", label: "Solid" }]
            }
            onChange={(windowMaterial) => onPreferencesChange({ windowMaterial })}
          />
        </Row>
      </Section>

      <Section title="Notifications">
        <Row label="Long-running commands" hint="Notify when a command finishes in a pane you are not looking at">
          <Segmented
            value={String(preferences.notifyAfterSeconds)}
            options={[
              { value: "0", label: "Off" },
              { value: "5", label: "5s" },
              { value: "10", label: "10s" },
              { value: "30", label: "30s" },
              { value: "60", label: "1m" },
            ]}
            onChange={(v) => onPreferencesChange({ notifyAfterSeconds: Number(v) })}
          />
        </Row>
      </Section>

      <Section title="Startup">
        <Row label="Start directory" hint="Where new tabs open. Splits open in the current pane's directory.">
          <div className="flex w-full min-w-0 gap-1.5">
            <input
              value={dir}
              placeholder="Home directory"
              onChange={(e) => setDir(e.target.value)}
              onBlur={() => commitDir(dir)}
              onKeyDown={(e) => {
                if (!e.nativeEvent.isComposing && e.key === "Enter") commitDir(dir);
              }}
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-bg-main px-2.5 font-mono text-[12px] text-tx-primary outline-none focus:border-accent placeholder:text-tx-muted"
            />
            {currentDirectory && (
              <button
                type="button"
                onClick={() => {
                  setDir(currentDirectory);
                  commitDir(currentDirectory);
                }}
                title={currentDirectory}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-[12px] text-tx-secondary hover:border-accent hover:text-tx-primary"
              >
                <FolderOpen size={13} /> Use current
              </button>
            )}
          </div>
        </Row>
      </Section>

      <div className="flex justify-end border-t border-border-dim pt-4">
        <button
          type="button"
          onClick={() => {
            onFontFamilyChange(DEFAULT_FONT_FAMILY);
            onFontSizeChange(DEFAULT_FONT_SIZE);
            onPreferencesChange(DEFAULT_PREFERENCES);
            onShowPaneHeadersChange(true);
          }}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-tx-muted hover:bg-tx-primary/[0.06] hover:text-tx-primary"
        >
          <RotateCcw size={12} /> Reset terminal settings
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-tx-muted">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-44 shrink-0">
        <div className="text-[12.5px] text-tx-primary">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-tx-muted">{hint}</div>}
      </div>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-border-strong bg-bg-main p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1 text-[12px] transition-colors ${
            value === opt.value ? "bg-accent text-accent-contrast shadow-sm" : "text-tx-secondary hover:text-tx-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-accent" : "bg-border-strong"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150 ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function ThemeCard({
  label,
  icon,
  active,
  onClick,
  variant,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  variant: "dark" | "light" | "split";
}) {
  const dark = { bg: "#0b0e14", chrome: "#07090e", line: "#2b3242", text: "#8b9cff" };
  const light = { bg: "#ffffff", chrome: "#eef0f4", line: "#cdd3dd", text: "#3b5bdb" };
  const mini = (c: typeof dark, clip?: string) => (
    <div className="absolute inset-0" style={{ background: c.bg, clipPath: clip }}>
      <div className="h-3" style={{ background: c.chrome }} />
      <div className="space-y-1 p-2">
        <div className="h-1 w-3/4 rounded" style={{ background: c.text }} />
        <div className="h-1 w-1/2 rounded" style={{ background: c.line }} />
        <div className="h-1 w-2/3 rounded" style={{ background: c.line }} />
      </div>
    </div>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`overflow-hidden rounded-lg border text-left transition-shadow ${
        active ? "border-accent shadow-[0_0_0_3px_var(--accent-dim)]" : "border-border-strong hover:border-tx-muted"
      }`}
    >
      <div className="relative h-16">
        {variant === "light" ? mini(light) : mini(dark)}
        {variant === "split" && mini(light, "polygon(100% 0, 100% 100%, 0 100%)")}
      </div>
      <div className="flex items-center gap-1.5 border-t border-border-dim px-2.5 py-1.5 text-[12px] text-tx-secondary">
        {icon} {label}
      </div>
    </button>
  );
}

/** 選択中のフォント・サイズ・行間・カーソルを端末風に試し表示する */
function FontPreview({
  fontFamily,
  fontSize,
  lineHeight,
  cursorStyle,
  scheme,
}: {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  scheme: { background: string; foreground: string; colors: string[] };
}) {
  const cursor =
    cursorStyle === "block" ? "bg-accent/80 w-[0.6em]" : cursorStyle === "underline" ? "w-[0.6em] border-b-2 border-accent" : "w-[2px] bg-accent";
  return (
    <div
      className="overflow-hidden rounded-lg border border-border-strong px-3 py-2"
      style={{ fontFamily, fontSize, lineHeight, background: scheme.background, color: scheme.foreground }}
    >
      <div>
        <span style={{ color: scheme.colors[1] }}>C:\Users\you\projects</span>&gt; git status
      </div>
      <div>
        <span style={{ color: scheme.colors[0] }}>modified:</span> src/App.tsx <span style={{ color: scheme.colors[3] }}>0O 1lI {"{}"} =&gt;</span> 日本語 ✓ ─│┼
      </div>
      <div className="flex items-center">
        <span style={{ color: scheme.colors[1] }}>C:\Users\you\projects</span>&gt;
        <span className={`ml-1 inline-block h-[1.1em] ${cursor}`} />
      </div>
    </div>
  );
}
