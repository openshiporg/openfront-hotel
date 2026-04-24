import { useEffect, useState } from 'react';
import { getSeedForTemplate } from '../utils/dataUtils';
import seedData from '../lib/seed.json';

export type OnboardingStep = 'template' | 'progress' | 'done';
export type TemplateType = 'full' | 'minimal' | 'custom';

export interface OnboardingState {
  step: OnboardingStep;
  selectedTemplate: TemplateType;
  currentJsonData: any;
  customJsonApplied: boolean;
  progressMessage: string;
  loadingItems: Record<string, string[]>;
  completedItems: Record<string, string[]>;
  error: string | null;
  itemErrors: Record<string, Record<string, string>>;
  isLoading: boolean;
}

const initialItemsState = {
  roomTypes: [],
  rooms: [],
  ratePlans: [],
  seasonalRates: [],
  guests: [],
  bookings: [],
  inventory: [],
  dailyMetrics: [],
};

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>({
    step: 'template',
    selectedTemplate: 'minimal',
    currentJsonData: null,
    customJsonApplied: false,
    progressMessage: '',
    loadingItems: { ...initialItemsState },
    completedItems: { ...initialItemsState },
    error: null,
    itemErrors: {},
    isLoading: false,
  });

  useEffect(() => {
    const templateData = getSeedForTemplate(state.selectedTemplate, seedData);
    setState((prev) => ({
      ...prev,
      currentJsonData: templateData,
      customJsonApplied: false,
    }));
  }, [state.selectedTemplate]);

  const setStep = (step: OnboardingStep) => {
    setState((prev) => ({ ...prev, step }));
  };

  const setSelectedTemplate = (template: TemplateType) => {
    setState((prev) => ({ ...prev, selectedTemplate: template }));
  };

  const setCurrentJsonData = (data: any) => {
    setState((prev) => ({ ...prev, currentJsonData: data }));
  };

  const setCustomJsonApplied = (applied: boolean) => {
    setState((prev) => ({ ...prev, customJsonApplied: applied }));
  };

  const setIsLoading = (loading: boolean) => {
    setState((prev) => ({ ...prev, isLoading: loading }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  };

  const setProgress = (message: string) => {
    setState((prev) => ({ ...prev, progressMessage: message }));
  };

  const setItemLoading = (type: string, item: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: [...(prev.loadingItems[type] || []), item],
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: prev.itemErrors[type]
          ? { ...prev.itemErrors[type], [item]: undefined as any }
          : {},
      },
    }));
  };

  const setItemCompleted = (type: string, item: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: (prev.loadingItems[type] || []).filter((i) => i !== item),
      },
      completedItems: {
        ...prev.completedItems,
        [type]: Array.from(new Set([...(prev.completedItems[type] || []), item])),
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: prev.itemErrors[type]
          ? { ...prev.itemErrors[type], [item]: undefined as any }
          : {},
      },
    }));
  };

  const setItemError = (type: string, item: string, errorMessage: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: (prev.loadingItems[type] || []).filter((i) => i !== item),
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: {
          ...(prev.itemErrors[type] || {}),
          [item]: errorMessage,
        },
      },
    }));
  };

  const resetOnboardingState = () => {
    setState((prev) => ({
      ...prev,
      error: null,
      itemErrors: {},
      loadingItems: { ...initialItemsState },
      completedItems: { ...initialItemsState },
    }));
  };

  return {
    ...state,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setIsLoading,
    setError,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    resetOnboardingState,
  };
}
