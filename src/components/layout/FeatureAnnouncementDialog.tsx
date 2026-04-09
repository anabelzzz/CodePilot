'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTranslation } from '@/hooks/useTranslation';

const ANNOUNCEMENT_KEY = 'codepilot:announcement:v0.48-agent-engine';

export function FeatureAnnouncementDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const isZh = t('nav.chats') === '对话';

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(ANNOUNCEMENT_KEY)) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setOpen(false);
    localStorage.setItem(ANNOUNCEMENT_KEY, '1');
  };

  const handleGoToSettings = () => {
    handleDismiss();
    router.push('/settings#cli');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isZh ? '新功能：独立 Agent 引擎 + OpenAI 支持' : 'New: Independent Agent Engine + OpenAI Support'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {isZh
              ? <>本次更新涉及底层架构变更，如遇问题请到 <a href="https://github.com/op7418/CodePilot/issues" target="_blank" rel="noopener noreferrer" className="underline font-medium">GitHub Issues</a> 反馈。</>
              : <>This update involves architectural changes. Report issues on <a href="https://github.com/op7418/CodePilot/issues" target="_blank" rel="noopener noreferrer" className="underline font-medium">GitHub Issues</a>.</>
            }
          </div>

          {isZh ? (
            <>
              <p>CodePilot 现在可以脱离 Claude Code CLI 独立运行了。</p>
              <div className="space-y-2 text-muted-foreground">
                <p><span className="text-foreground font-medium">AI SDK 引擎</span> — 无需安装 CLI，支持所有已配置的服务商</p>
                <p><span className="text-foreground font-medium">Claude Code 引擎</span> — 通过 CLI 驱动，获得完整的命令行能力</p>
              </div>
              <p>同时支持 <span className="font-medium">OpenAI 授权登录</span>，ChatGPT Plus/Pro 用户可在服务商设置中登录后直接使用 GPT-5.4 等模型。</p>
            </>
          ) : (
            <>
              <p>CodePilot can now run independently without the Claude Code CLI.</p>
              <div className="space-y-2 text-muted-foreground">
                <p><span className="text-foreground font-medium">AI SDK engine</span> — no CLI needed, works with all configured providers</p>
                <p><span className="text-foreground font-medium">Claude Code engine</span> — driven by CLI for full command-line capabilities</p>
              </div>
              <p>Also supports <span className="font-medium">OpenAI OAuth login</span> — ChatGPT Plus/Pro users can sign in under Providers to use GPT-5.4 and more.</p>
            </>
          )}
        </div>

        <DialogFooter className="gap-3">
          <Button variant="outline" size="sm" onClick={handleGoToSettings}>
            {isZh ? '前往设置' : 'Go to Settings'}
          </Button>
          <Button size="sm" onClick={handleDismiss}>
            {isZh ? '知道了' : 'Got it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
