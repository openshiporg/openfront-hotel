"use client";

import { Sparkles, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebarWithSide } from "@/components/ui/sidebar";
import { useChatMode } from "../DashboardLayout";

export function AiChatSidebar() {
  const { toggleSidebar } = useSidebarWithSide("right");
  const { user } = useChatMode();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <h3 className="font-medium text-muted-foreground">AI Assistant</h3>
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 py-8">
        <div className="mx-auto w-full max-w-sm rounded-xl border bg-background p-5 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </div>
          <h4 className="mb-2 font-semibold">Assistant temporarily paused</h4>
          <p className="mb-4 text-sm text-muted-foreground">
            We disabled the dashboard AI panel while stabilizing the hotel repo build.
          </p>
          <div className="rounded-lg border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <Wrench className="h-4 w-4" />
              Current focus
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>Hotel schema cleanup</li>
              <li>Canonical onboarding parity</li>
              <li>Guest booking flow normalization</li>
            </ul>
          </div>
          {user?.name ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Thanks, {user.name}. The assistant can be re-enabled after the SDK wiring is updated.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
