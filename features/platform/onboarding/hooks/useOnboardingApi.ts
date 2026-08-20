import { SECTION_DEFINITIONS } from '../config/templates';
import { getItemsFromJsonData } from '../utils/dataUtils';
import { TemplateType, OnboardingStep } from './useOnboardingState';

const GRAPHQL_ENDPOINT = '/api/graphql';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: any;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: string, item: string) => void;
  setItemCompleted: (type: string, item: string) => void;
  setItemError: (type: string, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

const RUN_ONBOARDING = String.raw`
  mutation RunHotelOnboarding($template: String!, $data: JSON) {
    runHotelOnboarding(template: $template, data: $data) {
      success
      message
      createdCount
      updatedCount
      skippedCount
    }
  }
`;

export function useOnboardingApi({
  selectedTemplate,
  currentJsonData,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setIsLoading,
  resetOnboardingState,
}: OnboardingApiProps) {
  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Applying The Alder House setup atomically...');

    const sections = SECTION_DEFINITIONS.map((section) => ({
      type: section.type,
      items: getItemsFromJsonData(currentJsonData, section.type),
    }));
    for (const section of sections) {
      for (const item of section.items) setItemLoading(section.type, item);
    }

    try {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: RUN_ONBOARDING,
          variables: { template: selectedTemplate, data: selectedTemplate === 'custom' ? currentJsonData : null },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.errors?.length) {
        throw new Error(
          payload?.errors?.map((error: { message?: string }) => error.message).join('\n') ||
            `Onboarding request failed with ${response.status}.`
        );
      }
      if (!payload?.data?.runHotelOnboarding?.success) {
        throw new Error('Hotel onboarding did not complete.');
      }

      for (const section of sections) {
        for (const item of section.items) setItemCompleted(section.type, item);
      }
      setProgress(payload.data.runHotelOnboarding.message);
      setStep('done');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown onboarding error.';
      const first = sections.find((section) => section.items.length)?.items[0];
      const firstSection = sections.find((section) => section.items.length);
      if (first && firstSection) setItemError(firstSection.type, first, message);
      setError(message);
      console.error('Error during onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return { runOnboarding };
}
