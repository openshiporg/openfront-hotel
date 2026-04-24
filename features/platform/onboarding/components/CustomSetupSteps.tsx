import React, { useState } from 'react';
import { ArrowLeft, Check, Clipboard, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataCard } from './DataCard';
import seedData from '@/features/platform/onboarding/lib/seed.json';

interface CustomSetupStepsProps {
  currentJson?: any;
  onJsonUpdate?: (newJson: any) => void;
  onBack?: () => void;
}

function useCopyToClipboard(): [string | null, (text: string) => Promise<boolean>] {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copy = React.useCallback(async (text: string) => {
    if (!navigator?.clipboard) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      return true;
    } catch {
      setCopiedText(null);
      return false;
    }
  }, []);

  return [copiedText, copy];
}

function getCompleteSetupJson() {
  return seedData;
}

export function CustomSetupSteps({ onJsonUpdate = () => {}, onBack }: CustomSetupStepsProps) {
  const [, copy] = useCopyToClipboard();
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [customJson, setCustomJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [jsonApplied, setJsonApplied] = useState(false);

  const completeJson = getCompleteSetupJson();

  const copyToClipboard = async (text: string, itemKey: string) => {
    const success = await copy(text);
    if (success) {
      setCopiedItems((prev) => ({ ...prev, [itemKey]: true }));
      setTimeout(() => {
        setCopiedItems((prev) => ({ ...prev, [itemKey]: false }));
      }, 2000);
    }
  };

  const generateAIPrompt = () => {
    return `I need help customizing my hotel onboarding JSON for Openfront Hotel.

Your first response should briefly summarize the current setup:
- room types
- rooms
- rate plans
- seasonal rates
- guests
- sample reservations
- availability snapshots
- daily metrics

Then ask what should change for this property.

When I am done, return one complete JSON object that keeps the same overall structure and is valid for direct paste into Openfront Hotel onboarding.`;
  };

  const validateAndApplyJson = () => {
    try {
      const parsed = JSON.parse(customJson);
      const requiredKeys = ['roomTypes', 'rooms', 'ratePlans', 'guests', 'bookings', 'inventory'];
      const missingKeys = requiredKeys.filter((key) => !Array.isArray(parsed[key]));

      if (missingKeys.length > 0) {
        setJsonError(`Missing required keys: ${missingKeys.join(', ')}`);
        return;
      }

      onJsonUpdate(parsed);
      setJsonApplied(true);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON format. Please check your syntax.');
    }
  };

  const steps = [
    {
      number: 1,
      title: 'Copy Base Hotel Configuration',
      description: 'Start with the default hotel demo dataset.',
      content: (
        <DataCard
          title="Hotel Onboarding Data"
          content={JSON.stringify(completeJson, null, 2)}
          onCopy={copyToClipboard}
          copied={copiedItems.json || false}
          copyKey="json"
        />
      ),
    },
    {
      number: 2,
      title: 'Copy AI Customization Prompt',
      description: 'Use this with any AI assistant to reshape the hotel demo data.',
      content: (
        <DataCard
          title="AI Prompt"
          content={generateAIPrompt()}
          onCopy={copyToClipboard}
          copied={copiedItems.prompt || false}
          copyKey="prompt"
        />
      ),
    },
    {
      number: 3,
      title: 'Paste Your Custom JSON',
      description: 'Paste the final hotel onboarding JSON here.',
      content: (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              Custom Hotel Onboarding Data
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setCustomJson(text);
                  setJsonError('');
                } catch {
                  // ignore clipboard failure
                }
              }}
              className="h-6 w-6 p-0 hover:bg-background/80"
            >
              <Clipboard className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
          <div className="bg-background">
            <Textarea
              placeholder="Paste your customized hotel JSON configuration here..."
              value={customJson}
              onChange={(e) => {
                setCustomJson(e.target.value);
                setJsonError('');
              }}
              className="min-h-[220px] resize-none rounded-none border-0 bg-transparent p-4 font-mono text-xs focus:outline-none"
            />
          </div>
          {jsonError && (
            <div className="px-4 pb-4">
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2">
                <p className="text-xs text-destructive">{jsonError}</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end border-t bg-muted px-4 py-2">
            <Button size="sm" onClick={validateAndApplyJson} disabled={!customJson.trim()}>
              Apply Configuration
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {jsonApplied && onBack && (
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setJsonApplied(false);
              onBack();
            }}
            className="h-8 px-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Custom Setup
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Custom Hotel Setup</Label>
        <p className="text-xs text-muted-foreground">
          Build a property-specific demo dataset without leaving the canonical onboarding flow.
        </p>
      </div>

      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.number} className="relative">
            {index < steps.length - 1 && (
              <div className="absolute bottom-0 left-3 top-3 w-[1px] bg-border"></div>
            )}
            <div className="relative mb-2 flex items-center space-x-3">
              <div className="z-10 inline-flex size-6 items-center justify-center rounded-sm border border-border bg-background text-sm text-foreground shadow-sm">
                {step.number}
              </div>
              <Label className="text-sm font-medium text-foreground">{step.title}</Label>
            </div>
            <div className="pl-9">
              <div className="pb-6">
                <p className="mb-3 text-xs text-muted-foreground">{step.description}</p>
                {step.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
