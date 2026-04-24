'use client';

import React from 'react';
import { AlertCircle, ArrowUpRight, Building2, CircleCheck, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge-button';
import { CustomSetupSteps } from './CustomSetupSteps';
import { SectionRenderer } from './SectionRenderer';
import { HOTEL_TEMPLATES, SECTION_DEFINITIONS } from '../config/templates';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingApi } from '../hooks/useOnboardingApi';
import { getItemsFromJsonData } from '../utils/dataUtils';

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const templateIcons = {
  minimal: Package,
  full: Building2,
  custom: CircleCheck,
} as const;

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ isOpen, onClose }) => {
  const onboardingState = useOnboardingState();
  const {
    step,
    selectedTemplate,
    currentJsonData,
    customJsonApplied,
    progressMessage,
    loadingItems,
    completedItems,
    error,
    itemErrors,
    isLoading,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setError,
    setIsLoading,
    resetOnboardingState,
  } = onboardingState;

  const { runOnboarding } = useOnboardingApi({
    selectedTemplate,
    currentJsonData,
    completedItems,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setStep,
    setError,
    setIsLoading,
    resetOnboardingState,
  });

  if (!isOpen) return null;

  const displayNames: Record<string, string[]> = SECTION_DEFINITIONS.reduce((acc, section) => {
    acc[section.type] = currentJsonData
      ? getItemsFromJsonData(currentJsonData, section.type)
      : section.getItemsFn(selectedTemplate);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-[95vw] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="mb-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Hotel onboarding</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row">
          <div className="order-1 flex flex-col lg:order-none lg:w-80 lg:justify-between lg:border-r">
            <div className="flex-1">
              <div className="p-4 sm:p-6">
                <div className="flex items-center space-x-3">
                  <div className="inline-flex shrink-0 items-center justify-center rounded-sm bg-muted p-3">
                    <Building2 className="size-5 text-foreground" aria-hidden={true} />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium text-foreground">Hotel setup</h3>
                    <p className="text-sm text-muted-foreground">
                      {step === 'done'
                        ? 'Your hotel demo is ready'
                        : selectedTemplate === 'custom'
                          ? 'Use a custom hotel JSON seed'
                          : 'Create linked PMS and booking demo data'}
                    </p>
                  </div>
                </div>

                <Separator className="my-4" />

                {step === 'done' ? (
                  <>
                    <h4 className="mb-2 text-sm font-medium text-foreground">Setup complete</h4>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Your {selectedTemplate === 'minimal' ? 'basic' : 'complete'} hotel demo dataset is now ready.
                    </p>
                    <div className="mb-4 flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-500">
                      <CircleCheck className="h-4 w-4 fill-emerald-500 text-background" />
                      <span>Onboarding complete</span>
                    </div>

                    <div className="space-y-3 text-sm">
                      {SECTION_DEFINITIONS.map((section) => {
                        const items = displayNames[section.type] || [];
                        if (!items.length) return null;
                        return (
                          <div key={section.type} className="flex items-center space-x-2 text-muted-foreground">
                            <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                            <span className="font-medium">
                              {items.length} {section.label.toLowerCase()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : !isLoading ? (
                  <>
                    <h4 className="mb-4 text-sm font-medium text-foreground">Setup type</h4>

                    <div className="block lg:hidden">
                      <Select
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as 'minimal' | 'full' | 'custom')}
                      >
                        <SelectTrigger className="h-auto w-full py-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['minimal', 'full', 'custom'] as const).map((template) => (
                            <SelectItem key={template} value={template}>
                              <div className="flex flex-col items-start text-left">
                                <span className="font-medium">{HOTEL_TEMPLATES[template].name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {HOTEL_TEMPLATES[template].description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="hidden lg:block">
                      <RadioGroup
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as 'minimal' | 'full' | 'custom')}
                        className="space-y-4"
                      >
                        {(['minimal', 'full', 'custom'] as const).map((template) => {
                          const Icon = templateIcons[template];
                          const active = selectedTemplate === template;

                          return (
                            <div
                              key={template}
                              className={`cursor-pointer rounded-md border p-4 transition-colors ${
                                active
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'hover:border-blue-200'
                              }`}
                              onClick={() => setSelectedTemplate(template)}
                            >
                              <div className="flex gap-4">
                                <div className="mt-[3px] flex-shrink-0">
                                  <Icon
                                    className={`h-5 w-5 ${
                                      active ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                                    }`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <RadioGroupItem value={template} id={template} className="sr-only" />
                                  <Label htmlFor={template} className="cursor-pointer">
                                    <div className="mb-1 text-base font-medium">
                                      {HOTEL_TEMPLATES[template].name}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {HOTEL_TEMPLATES[template].description}
                                    </div>
                                  </Label>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground">
                      Creating {selectedTemplate === 'minimal' ? 'basic' : 'complete'} setup
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{progressMessage}</p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-auto hidden flex-col border-t lg:flex">
              {error && !isLoading && step !== 'done' && (
                <Badge color="rose" className="rounded-none gap-3 border-b text-sm">
                  <AlertCircle className="size-4 sm:size-7" />
                  <span className="text-xs sm:text-sm">
                    There was a problem creating the hotel demo data. Review the first failed section and retry.
                  </span>
                </Badge>
              )}

              <div className="flex items-center justify-between p-4">
                {step === 'done' ? (
                  <div className="flex w-full flex-col gap-2 sm:flex-row">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        Close
                      </Button>
                    </DialogClose>
                    <Button asChild className="w-full sm:w-auto">
                      <a href="/rooms" target="_blank" rel="noopener noreferrer">
                        Browse storefront rooms
                        <ArrowUpRight className="ml-1.5 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="flex w-full flex-col gap-2 sm:flex-row">
                    <DialogClose asChild>
                      <Button type="button" variant="ghost" disabled={isLoading} className="w-full sm:w-auto">
                        Cancel
                      </Button>
                    </DialogClose>
                    {isLoading ? (
                      <Button disabled className="w-full sm:w-auto">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </Button>
                    ) : (
                      <Button onClick={runOnboarding} className="w-full sm:w-auto">
                        Confirm
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="order-2 max-h-[60vh] flex-1 overflow-y-auto p-4 sm:p-6 lg:order-none lg:max-h-[70vh]">
            {selectedTemplate === 'custom' && step === 'template' && !customJsonApplied ? (
              <CustomSetupSteps
                currentJson={currentJsonData}
                onJsonUpdate={(newJsonData) => {
                  setCurrentJsonData(newJsonData);
                  setCustomJsonApplied(true);
                }}
                onBack={() => setCustomJsonApplied(false)}
              />
            ) : (
              <SectionRenderer
                sections={SECTION_DEFINITIONS}
                selectedTemplate={selectedTemplate}
                isLoading={isLoading}
                loadingItems={loadingItems}
                completedItems={completedItems}
                itemErrors={itemErrors}
                error={error}
                step={step}
                currentJsonData={currentJsonData}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col border-t lg:hidden">
          {error && !isLoading && step !== 'done' && (
            <Badge color="rose" className="rounded-none gap-3 border-b text-sm">
              <AlertCircle className="size-4 sm:size-7" />
              <span className="text-xs sm:text-sm">
                There was a problem creating the hotel demo data. Review the first failed section and retry.
              </span>
            </Badge>
          )}

          <div className="flex items-center justify-between p-4">
            {step === 'done' ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="flex-1">
                    Close
                  </Button>
                </DialogClose>
                <Button asChild className="flex-1">
                  <a href="/rooms" target="_blank" rel="noopener noreferrer">
                    Browse storefront rooms
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={isLoading} className="flex-1">
                    Cancel
                  </Button>
                </DialogClose>
                {isLoading ? (
                  <Button disabled className="flex-1">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </Button>
                ) : (
                  <Button onClick={runOnboarding} className="flex-1">
                    Confirm
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingDialog;
