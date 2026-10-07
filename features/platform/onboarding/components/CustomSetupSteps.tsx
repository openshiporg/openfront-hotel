'use client';

import React, { useState } from 'react';
import { Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataCard } from './DataCard';
import seedData from '@/features/platform/onboarding/lib/seed.json';
import { validateHotelOnboardingData } from '@/features/platform/onboarding/lib/hotelOnboardingSchema';

interface CustomSetupStepsProps {
  currentJson?: unknown;
  onJsonUpdate?: (newJson: Record<string, unknown>) => void;
}

function useCopyToClipboard(): [(text: string) => Promise<boolean>] {
  const copy = React.useCallback(async (text: string) => {
    if (!navigator?.clipboard) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);
  return [copy];
}

export function CustomSetupSteps({ currentJson, onJsonUpdate = () => {} }: CustomSetupStepsProps) {
  const [copy] = useCopyToClipboard();
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [customJson, setCustomJson] = useState(() => currentJson ? JSON.stringify(currentJson, null, 2) : '');
  const [jsonError, setJsonError] = useState('');

  const copyToClipboard = async (text: string, itemKey: string) => {
    if (!(await copy(text))) return;
    setCopiedItems((previous) => ({ ...previous, [itemKey]: true }));
    window.setTimeout(() => setCopiedItems((previous) => ({ ...previous, [itemKey]: false })), 2000);
  };

  const generateAIPrompt = () => `I need help customizing this Openfront Hotel onboarding JSON for a real property-shaped demonstration dataset.

First summarize the current property identity, room types and amenities, rooms, public rate plans and cancellation policies, seasonal rates, inventory, guests, reservations, payments, housekeeping, maintenance, loyalty, and disabled channel examples. Then ask what should change.

Preserve the exact top-level structure and stable keys. Use only values supported by the supplied JSON and do not invent real provider credentials, live channel state, regulatory claims, availability, rates, or completed business events. Keep dailyMetrics empty because reports are derived. When I am finished, return one complete JSON object suitable for direct paste into Openfront Hotel.`;

  const validateAndApplyJson = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(customJson);
    } catch {
      setJsonError('Invalid JSON format. Please check your syntax.');
      return;
    }
    const validation = validateHotelOnboardingData(parsed);
    if (!validation.success) {
      setJsonError(validation.errors.slice(0, 8).join('\n'));
      return;
    }
    onJsonUpdate(validation.data);
    setJsonError('');
  };

  const steps = [
    {
      number: 1,
      title: 'Copy Base Configuration',
      description: 'Start with the complete Hotel template and its canonical entity relationships.',
      content: <DataCard title="Hotel Onboarding Data" content={JSON.stringify(seedData, null, 2)} onCopy={copyToClipboard} copied={copiedItems.json || false} copyKey="json" />,
    },
    {
      number: 2,
      title: 'Copy AI Customization Prompt',
      description: 'Use this prompt with an AI assistant to reshape the sample property safely.',
      content: <DataCard title="AI Prompt" content={generateAIPrompt()} onCopy={copyToClipboard} copied={copiedItems.prompt || false} copyKey="prompt" />,
    },
    {
      number: 3,
      title: 'Customize the Property',
      description: 'Review identity, rooms, amenities, rates, policies, inventory, and PMS samples before applying anything.',
      content: (
        <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          <li>Keep room, room-type, guest, reservation, channel, and inventory references aligned.</li>
          <li>Keep monetary amounts, guest counts, stay dates, and inventory counts internally consistent.</li>
          <li>Leave providers and channels disabled unless they are configured later through their owned settings.</li>
        </ul>
      ),
    },
    {
      number: 4,
      title: 'Paste Your Custom JSON',
      description: 'Validate the complete JSON before reviewing and confirming the setup.',
      content: (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Custom Hotel Onboarding Data</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Paste hotel onboarding JSON from clipboard"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setCustomJson(text);
                  setJsonError('');
                } catch {
                  setJsonError('Clipboard access was unavailable. Paste into the editor manually.');
                }
              }}
              className="h-6 w-6 p-0 hover:bg-background/80"
            >
              <Clipboard className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </Button>
          </div>
          <Textarea
            aria-label="Custom hotel onboarding JSON"
            aria-invalid={Boolean(jsonError)}
            aria-describedby={jsonError ? 'custom-hotel-json-error' : undefined}
            value={customJson}
            onChange={(event) => { setCustomJson(event.target.value); setJsonError(''); }}
            className="min-h-[240px] resize-none rounded-none border-0 bg-transparent p-4 font-mono text-xs focus:outline-none"
          />
          {jsonError ? (
            <div className="px-4 pb-4">
              <p id="custom-hotel-json-error" role="alert" className="whitespace-pre-line rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">{jsonError}</p>
            </div>
          ) : null}
          <div className="flex items-center justify-end border-t bg-muted px-4 py-2">
            <Button type="button" size="sm" onClick={validateAndApplyJson} disabled={!customJson.trim()}>Apply Configuration</Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Custom Hotel Setup</Label>
        <p className="text-xs text-muted-foreground">Follow the shared custom setup path, with Hotel-specific validation at the same server boundary used by templates.</p>
      </div>
      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.number} className="relative">
            {index < steps.length - 1 ? <div className="absolute bottom-0 left-3 top-3 w-px bg-border" /> : null}
            <div className="relative mb-2 flex items-center space-x-3">
              <div className="z-10 inline-flex size-6 items-center justify-center rounded-sm border bg-background text-sm shadow-sm">{step.number}</div>
              <Label className="text-sm font-medium">{step.title}</Label>
            </div>
            <div className="pl-9 pb-6">
              <p className="mb-3 text-xs text-muted-foreground">{step.description}</p>
              {step.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
