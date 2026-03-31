"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowClockwise, CaretUp, CaretDown, ChartBar, Trash, DownloadSimple, Heart, Brain, Clock, Check, Warning, Gear } from "@/components/ui/icon";
import { showToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { WidgetRenderer } from "@/components/chat/WidgetRenderer";
import { AssistantAvatar } from "@/components/ui/AssistantAvatar";
import type { DashboardConfig, DashboardWidget } from "@/types/dashboard";
import type { TranslationKey } from "@/i18n";

const DASHBOARD_MIN_WIDTH = 320;
const DASHBOARD_MAX_WIDTH = 800;
const DASHBOARD_DEFAULT_WIDTH = 640;

interface AssistantSummary {
  configured: boolean;
  name: string;
  styleHint?: string;
  onboardingComplete: boolean;
  lastHeartbeatDate: string | null;
  heartbeatEnabled: boolean;
  memoryCount: number;
  recentDailyDates?: string[];
  fileHealth?: Record<string, boolean>;
}

export function DashboardPanel() {
  const { setDashboardPanelOpen, workingDirectory, isAssistantWorkspace } = usePanel();
  const { t } = useTranslation();
  const [width, setWidth] = useState(DASHBOARD_DEFAULT_WIDTH);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const initialLoadDone = useRef(false);
  const [assistantSummary, setAssistantSummary] = useState<AssistantSummary | null>(null);

  // Load assistant summary for assistant workspace dashboards
  useEffect(() => {
    if (!isAssistantWorkspace) { setAssistantSummary(null); return; }
    fetch('/api/workspace/summary')
      .then(r => r.ok ? r.json() : null)
      .then(data => setAssistantSummary(data))
      .catch(() => {});
  }, [isAssistantWorkspace]);

  const handleResize = useCallback((delta: number) => {
    setWidth((w) => Math.min(DASHBOARD_MAX_WIDTH, Math.max(DASHBOARD_MIN_WIDTH, w - delta)));
  }, []);

  // Load dashboard config
  const loadDashboard = useCallback(async () => {
    if (!workingDirectory) return;
    try {
      const res = await fetch(`/api/dashboard?dir=${encodeURIComponent(workingDirectory)}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setAutoRefresh(data.settings?.autoRefreshOnOpen ?? false);
      }
    } catch (e) {
      console.error('[DashboardPanel] Failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, [workingDirectory]);

  // Load on mount
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-refresh on open
  useEffect(() => {
    if (!initialLoadDone.current && config && autoRefresh && config.widgets.length > 0) {
      initialLoadDone.current = true;
      handleRefreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, autoRefresh]);

  // Poll for changes during streaming (MCP tools execute during streaming).
  // Also do a one-shot re-fetch 1s after streaming ends to catch the final state.
  const { activeStreamingSessions } = usePanel();
  const isAnyStreaming = activeStreamingSessions.size > 0;
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (!workingDirectory) return;
    if (isAnyStreaming) {
      wasStreamingRef.current = true;
      const knownCount = config?.widgets.length ?? 0;
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/dashboard?dir=${encodeURIComponent(workingDirectory)}`);
          if (res.ok) {
            const data = await res.json();
            if ((data.widgets?.length ?? 0) !== knownCount) {
              setConfig(data);
            }
          }
        } catch { /* ignore */ }
      }, 3000);
      return () => clearInterval(interval);
    } else if (wasStreamingRef.current) {
      // Streaming just ended — do a final fetch to catch any last-moment changes
      wasStreamingRef.current = false;
      loadDashboard();
    }
  }, [workingDirectory, isAnyStreaming, config?.widgets.length, loadDashboard]);

  // Cross-widget communication relay: scoped to dashboard panel only.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const { topic, data, sourceIframe } = (e as CustomEvent).detail || {};
      if (!panelRef.current) return;
      // Ignore events from iframes outside the dashboard panel
      if (sourceIframe && !panelRef.current.contains(sourceIframe)) return;
      const iframes = panelRef.current.querySelectorAll('iframe[title]');
      iframes.forEach(iframe => {
        if (iframe !== sourceIframe && (iframe as HTMLIFrameElement).contentWindow) {
          (iframe as HTMLIFrameElement).contentWindow!.postMessage(
            { type: 'widget:crossFilter', payload: { topic, data } },
            '*',
          );
        }
      });
    };
    window.addEventListener('widget-cross-publish', handler);
    return () => window.removeEventListener('widget-cross-publish', handler);
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (!workingDirectory || refreshingAll) return;
    setRefreshingAll(true);
    try {
      const res = await fetch('/api/dashboard/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDirectory }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (e) {
      console.error('[DashboardPanel] Refresh all failed:', e);
    } finally {
      setRefreshingAll(false);
    }
  }, [workingDirectory, refreshingAll]);

  const handleRefreshWidget = useCallback(async (widgetId: string) => {
    if (!workingDirectory || refreshingIds.has(widgetId)) return;
    setRefreshingIds(prev => new Set(prev).add(widgetId));
    try {
      const res = await fetch('/api/dashboard/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDirectory, widgetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (e) {
      console.error('[DashboardPanel] Refresh widget failed:', e);
    } finally {
      setRefreshingIds(prev => {
        const next = new Set(prev);
        next.delete(widgetId);
        return next;
      });
    }
  }, [workingDirectory, refreshingIds]);

  const handleDeleteWidget = useCallback(async (widgetId: string) => {
    if (!workingDirectory) return;
    try {
      const res = await fetch(
        `/api/dashboard?dir=${encodeURIComponent(workingDirectory)}&widgetId=${encodeURIComponent(widgetId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        // Notify chat widgets that a pin was removed
        // No need to notify chat Pin buttons — they are stateless triggers
      }
    } catch (e) {
      console.error('[DashboardPanel] Delete widget failed:', e);
    }
  }, [workingDirectory]);

  const handleMoveWidget = useCallback(async (widgetId: string, direction: 'up' | 'down' | 'top') => {
    if (!workingDirectory || !config) return;
    // Optimistic local update — avoids React DOM reorder which destroys iframes
    const widgets = [...config.widgets];
    const idx = widgets.findIndex(w => w.id === widgetId);
    if (idx === -1) return;
    if (direction === 'top' && idx > 0) {
      const [w] = widgets.splice(idx, 1);
      widgets.unshift(w);
    } else if (direction === 'up' && idx > 0) {
      [widgets[idx - 1], widgets[idx]] = [widgets[idx], widgets[idx - 1]];
    } else if (direction === 'down' && idx < widgets.length - 1) {
      [widgets[idx], widgets[idx + 1]] = [widgets[idx + 1], widgets[idx]];
    } else {
      return; // no change
    }
    setConfig({ ...config, widgets });
    // Persist absolute order (race-free — last write wins with correct final state)
    fetch('/api/dashboard', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory, widgetOrder: widgets.map(w => w.id) }),
    }).catch(e => console.error('[DashboardPanel] Move widget failed:', e));
  }, [workingDirectory, config]);

  const handleToggleAutoRefresh = useCallback(async () => {
    if (!workingDirectory) return;
    const newValue = !autoRefresh;
    setAutoRefresh(newValue);
    try {
      await fetch('/api/dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDirectory, settings: { autoRefreshOnOpen: newValue } }),
      });
    } catch (e) {
      console.error('[DashboardPanel] Toggle auto-refresh failed:', e);
      setAutoRefresh(!newValue); // revert on failure
    }
  }, [workingDirectory, autoRefresh]);

  const widgets = config?.widgets ?? [];

  // Stable render order: sort by ID so React never reorders DOM (preserves iframes).
  // Visual order controlled by CSS `order` based on position in config.widgets.
  const stableWidgets = useMemo(() => {
    const ids = widgets.map(w => w.id).sort();
    return ids.map(id => widgets.find(w => w.id === id)!);
  }, [widgets]);

  const orderMap = useMemo(() => {
    const m = new Map<string, number>();
    widgets.forEach((w, i) => m.set(w.id, i));
    return m;
  }, [widgets]);

  return (
    <div ref={panelRef} className="flex h-full shrink-0 overflow-hidden">
      <ResizeHandle side="left" onResize={handleResize} />
      <div
        className="flex h-full flex-1 flex-col overflow-hidden border-r border-border/40 bg-background"
        style={{ width }}
      >
        {/* Header */}
        <div className="flex h-10 shrink-0 items-center justify-between px-3">
          <div className="flex items-center gap-2">
            {isAssistantWorkspace && assistantSummary?.name ? (
              <AssistantAvatar name={assistantSummary.name} size={18} />
            ) : null}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isAssistantWorkspace && assistantSummary?.name
                ? assistantSummary.name
                : t('dashboard.title')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {widgets.length > 0 && (
              <>
                {/* Auto-refresh toggle */}
                <button
                  onClick={handleToggleAutoRefresh}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{t('dashboard.autoRefreshLabel')}</span>
                  <span className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${autoRefresh ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`pointer-events-none block h-3 w-3 rounded-full bg-background shadow-sm ring-0 transition-transform mt-0.5 ${autoRefresh ? 'translate-x-3.5 ml-0' : 'translate-x-0.5'}`} />
                  </span>
                </button>
                <div className="h-4 w-px bg-border/60 mx-1" />
                {/* Refresh all */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleRefreshAll}
                  disabled={refreshingAll}
                  title={t('dashboard.refresh')}
                >
                  <ArrowClockwise size={14} className={refreshingAll ? "animate-spin" : ""} />
                  <span className="sr-only">{t('dashboard.refresh')}</span>
                </Button>
              </>
            )}
            {/* Close button — always visible */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDashboardPanelOpen(false)}
            >
              <X size={14} />
              <span className="sr-only">{t('common.close')}</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : widgets.length === 0 ? (
            <div className="flex flex-col h-full px-3 pt-3">
              {isAssistantWorkspace && assistantSummary?.configured && (
                <AssistantStatusCard summary={assistantSummary} t={t} />
              )}
              {!(isAssistantWorkspace && assistantSummary?.configured) && (
                <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground">
                  <ChartBar size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">{t('dashboard.empty')}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-3">
              {/* Assistant status card — always first in assistant workspace */}
              {isAssistantWorkspace && assistantSummary?.configured && (
                <AssistantStatusCard summary={assistantSummary} t={t} />
              )}
              {stableWidgets.map((widget) => {
                const displayIdx = orderMap.get(widget.id) ?? 0;
                return (
                  <DashboardWidgetCard
                    key={widget.id}
                    widget={widget}
                    style={{ order: displayIdx }}
                    refreshing={refreshingAll || refreshingIds.has(widget.id)}
                    isFirst={displayIdx === 0}
                    isLast={displayIdx === widgets.length - 1}
                    onRefresh={() => handleRefreshWidget(widget.id)}
                    onDelete={() => handleDeleteWidget(widget.id)}
                    onMove={(dir) => handleMoveWidget(widget.id, dir)}
                  />
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function DashboardWidgetCard({ widget, refreshing, isFirst, isLast, style, onRefresh, onDelete, onMove }: {
  widget: DashboardWidget;
  refreshing: boolean;
  isFirst: boolean;
  isLast: boolean;
  style?: React.CSSProperties;
  onRefresh: () => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down' | 'top') => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="group/card relative rounded-lg overflow-hidden" style={style}>
      {/* Permanent title bar */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          className="text-xs font-medium text-foreground/70 truncate hover:text-foreground transition-colors text-left"
          onClick={() => window.dispatchEvent(new CustomEvent('dashboard-widget-drilldown', { detail: { title: widget.title, dataContract: widget.dataContract } }))}
          title={t('dashboard.drilldown')}
        >
          {widget.title}
        </button>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove('up')}
            disabled={isFirst}
            title={t('dashboard.moveUp')}
            className="h-5 w-5"
          >
            <CaretUp size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove('down')}
            disabled={isLast}
            title={t('dashboard.moveDown')}
            className="h-5 w-5"
          >
            <CaretDown size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            disabled={refreshing}
            title={t('dashboard.refreshWidget')}
            className="h-5 w-5"
          >
            <ArrowClockwise size={12} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={async () => {
              try {
                const { exportWidgetAsImage, downloadBlob } = await import('@/lib/dashboard-export');
                const blob = await exportWidgetAsImage(widget.widgetCode);
                downloadBlob(blob, `${widget.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_')}.png`);
              } catch (e) {
                console.error('[DashboardPanel] Export failed:', e);
                showToast({ type: 'error', message: 'Export failed' });
              }
            }}
            title={t('dashboard.exportWidget')}
            className="h-5 w-5"
          >
            <DownloadSimple size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title={t('dashboard.deleteWidget')}
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
          >
            <Trash size={12} />
          </Button>
        </div>
      </div>

      {/* Shimmer overlay during refresh */}
      {refreshing && (
        <div className="absolute inset-0 z-5 bg-background/30 backdrop-blur-[1px] flex items-center justify-center">
          <div className="text-xs text-muted-foreground">{t('dashboard.refreshing')}</div>
        </div>
      )}

      {/* Widget render */}
      <WidgetRenderer widgetCode={widget.widgetCode} isStreaming={false} title={widget.title} />
    </div>
  );
}

/** Built-in assistant status card — injected at the top of assistant workspace dashboards. */
function AssistantStatusCard({ summary, t }: {
  summary: AssistantSummary;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const router = useRouter();

  return (
    <div className="rounded-lg border border-primary/10 bg-primary/[0.03] p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AssistantAvatar name={summary.name || 'assistant'} size={24} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {summary.name || t('assistant.defaultName' as TranslationKey)}
          </div>
          {summary.styleHint && (
            <div className="text-[10px] text-muted-foreground italic truncate">
              {summary.styleHint}
            </div>
          )}
        </div>
      </div>

      {/* Status rows */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Heart size={12} className="text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">{t('assistant.panel.heartbeat' as TranslationKey)}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${summary.heartbeatEnabled ? 'bg-status-success' : 'bg-muted-foreground/30'}`} />
          <span className="text-foreground">
            {summary.heartbeatEnabled
              ? summary.lastHeartbeatDate || t('assistant.panel.enabled' as TranslationKey)
              : t('assistant.panel.disabled' as TranslationKey)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Brain size={12} className="text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">{t('assistant.panel.memories' as TranslationKey)}</span>
          <span className="text-foreground">{summary.memoryCount}</span>
        </div>
      </div>

      {/* File health */}
      {summary.fileHealth && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(summary.fileHealth).map(([key, exists]) => (
            <div key={key} className="flex items-center gap-1 text-[10px]">
              {exists ? (
                <Check size={10} className="text-status-success" />
              ) : (
                <Warning size={10} className="text-status-warning" />
              )}
              <span className={exists ? 'text-muted-foreground' : 'text-status-warning'}>
                {key}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Settings link */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-xs h-7 text-muted-foreground"
        onClick={() => router?.push('/settings?tab=assistant')}
      >
        <Gear size={12} />
        {t('assistant.panel.assistantSettings' as TranslationKey)}
      </Button>
    </div>
  );
}
