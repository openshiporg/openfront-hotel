'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';

export async function updateOnboardingStatus(status: OnboardingStatus) {
  try {
    const query = `
      mutation UpdateOnboardingStatus($where: UserWhereUniqueInput!, $data: UserUpdateInput!) {
        updateUser(where: $where, data: $data) {
          id
          onboardingStatus
        }
      }
    `;

    const authResponse = await keystoneClient<{ authenticatedItem?: { id: string } }>(`
      query CurrentOnboardingUser {
        authenticatedItem {
          ... on User {
            id
          }
        }
      }
    `);

    if (!authResponse.success) {
      return { success: false, error: authResponse.error };
    }

    const userId = authResponse.data?.authenticatedItem?.id;

    if (!userId) {
      return { success: false, error: 'You must be signed in to update onboarding status.' };
    }

    const response = await keystoneClient(query, {
      where: { id: userId },
      data: { onboardingStatus: status }
    });

    if (!response.success) {
      return { success: false, error: response.error };
    }

    // Revalidate dashboard pages to reflect the change
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/(admin)');

    return { success: true, data: response.data?.updateUser };
  } catch (error) {
    console.error('Error updating onboarding status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
  }
}

export async function dismissOnboarding() {
  return updateOnboardingStatus('dismissed');
}

export async function startOnboarding() {
  return updateOnboardingStatus('in_progress');
}

export async function completeOnboarding() {
  return updateOnboardingStatus('completed');
}
