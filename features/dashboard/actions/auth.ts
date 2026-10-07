'use server';

import { cookies } from 'next/headers';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { redirect } from 'next/navigation';
import { removeAuthToken } from '@/features/dashboard/lib/cookies';
import { revalidatePath } from 'next/cache';
import { getGraphQLEndpoint } from '@/features/dashboard/lib/getBaseUrl';
import { safeDashboardReturnPath } from '@/features/dashboard/lib/safeDashboardReturnPath';
import { safeGraphQLError } from '@/features/dashboard/lib/safeGraphQLError';
import { createBoundedGraphqlFetch } from '@/features/keystone/lib/boundedGraphqlFetch';
import { hotelResetActionSecret } from '@/features/keystone/lib/hotelResetActionSecret';

const boundedGraphqlFetch = createBoundedGraphqlFetch(8_000);

// Define types for GraphQL responses
interface RedeemTokenResponse {
  redeemUserPasswordResetToken?: {
    code: string;
    message: string;
  } | null;
}

export async function signIn(prevState: { message: string | null, formData: { email: string, password: string } }, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const from = safeDashboardReturnPath(formData.get('from'));
  let challengeRequired = false;

  const query = `
    mutation($email: String!, $password: String!) {
      authenticate: authenticateUserWithPassword(email: $email, password: $password) {
        ... on UserAuthenticationWithPasswordSuccess {
          sessionToken
          item {
            id
            name
            email
          }
        }
        ... on UserAuthenticationWithPasswordFailure {
          message
        }
      }
    }
  `;

  try {
    const response = await keystoneClient(query, { email, password });

    if (!response.success) {
      return {
        message: `Authentication failed: ${response.error}`,
        formData: { email, password: '' }
      };
    }

    // If we have a message, it's an authentication failure
    if (response.data?.authenticate?.message) {
      return {
        message: response.data.authenticate.message,
        formData: { email, password: '' }
      };
    }

    // Check if we have a sessionToken in the response
    if (!response.data?.authenticate?.sessionToken) {
      return {
        message: 'An unexpected error occurred',
        formData: { email, password: '' }
      };
    }

    // Set the auth token cookie
    const cookieStore = await cookies();
    cookieStore.set('keystonejs-session', response.data.authenticate.sessionToken, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      httpOnly: true,
      maxAge: 60 * 60 * 12,
    });
    const mfa = await keystoneClient<any>('query { hotelMfaStatus }');
    if (!mfa.success || !mfa.data?.hotelMfaStatus) { cookieStore.delete('keystonejs-session'); throw new Error('Unable to verify authentication status. Sign in again.'); }
    const status = JSON.parse(mfa.data.hotelMfaStatus);
    challengeRequired = status.challengeRequired === true;
    if (!challengeRequired && !status.authenticated) { cookieStore.delete('keystonejs-session'); throw new Error('Authentication is not permitted.'); }
  } catch (error) {
    return {
      message: safeGraphQLError(error).message,
      formData: { email, password: '' }
    };
  }

  // Validate and sanitize the from URL to prevent open redirect vulnerabilities

  // Redirect must be outside of try/catch
  redirect(challengeRequired ? `/dashboard/signin/mfa?from=${encodeURIComponent(from)}` : from);
}

export async function signUp(prevState: { message: string | null, formData: { email: string, password: string } }, formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = email.split('@')[0]; // Simple name derivation

    // Create user
    const createQuery = `
      mutation($email: String!, $name: String!, $password: String!) {
        createUser(data: { email: $email, name: $name, password: $password }) {
          id
          email
          name
        }
      }
    `;

    const response = await keystoneClient(createQuery, { email, name, password });

    if (!response.success) {
      return {
        message: `Failed to create user: ${response.error}`,
        formData: { email, password: '' }
      };
    }

    // Sign them in after creation
    return signIn({ message: null, formData: { email, password: '' } }, formData);
  } catch (error) {
    return {
      message: safeGraphQLError(error).message,
      formData: {
        email: formData.get('email') as string,
        password: ''
      }
    };
  }
}

export async function signOut() {
  try {
    const query = `
      mutation {
        endSession
      }
    `;

    const response = await keystoneClient(query);

    // Always remove the auth token cookie, even if the mutation fails
    // This ensures the user is signed out locally
    await removeAuthToken();

    // CRITICAL: Clear Next.js router cache to prevent stale data
    revalidatePath("/", "layout");

    if (!response.success) {
      console.error('Failed to sign out');
      // Still redirect even if server logout fails, since we cleared the cookie
    }
  } catch {
    // Still remove the cookie even if there's an error
    await removeAuthToken();
    // Clear cache even on error
    revalidatePath("/", "layout");
    console.error('Logout failed after local session cleanup');
  }
  
  // Always redirect after logout attempt
  redirect("/dashboard/signin");
}

export async function createInitialUser(prevState: { message: string | null, formData: { name: string, email: string, password: string } }, formData: FormData) {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const listKey = "User";

  const query = `
    mutation($data: CreateInitial${listKey}Input!) {
      authenticate: createInitial${listKey}(data: $data) {
        ... on ${listKey}AuthenticationWithPasswordSuccess {
          item {
            id
          }
        }
      }
    }
  `;

  try {
    const response = await keystoneClient(query, {
      data: { name, email, password }
    });

    if (!response.success) {
      return {
        message: `Failed to create initial user: ${response.error}`,
        formData: { name, email, password: '' }
      };
    }

    return {
      data: response.data,
      formData: { name, email, password: '' }
    };
  } catch (error) {
    return {
      message: safeGraphQLError(error).message,
      formData: { name, email, password: '' }
    };
  }
}

export async function resetPassword(prevState: { message: string | null, success: string | null, formData: { email: string, password: string } }, formData: FormData, mode: 'reset' | 'request') {
  const email = formData.get('email') as string;

  if (mode === 'reset') {
    const password = formData.get('password') as string;
    const token = formData.get('token') as string;

    const query = `
      mutation($email: String!, $password: String!, $token: String!) {
        redeemUserPasswordResetToken: redeemHotelPasswordResetToken(
          email: $email
          token: $token
          password: $password
        ) {
          code
          message
        }
      }
    `;

    try {
      const response = await keystoneClient<RedeemTokenResponse>(query, { email, password, token });

      if (!response.success) {
        return {
          message: `Password reset failed: ${response.error}`,
          formData: { email, password: '' }
        };
      }

      if (response.data?.redeemUserPasswordResetToken?.code) {
        return {
          message: response.data.redeemUserPasswordResetToken.message,
          formData: { email, password: '' }
        };
      }

      return {
        success: 'Password has been reset. You can now sign in.',
        formData: { email, password: '' }
      };
    } catch (error) {
      return {
        message: safeGraphQLError(error).message,
        formData: { email, password: '' }
      };
    }
  } else {
    const generic = {
      success: 'If an eligible account exists, password reset instructions will be sent.',
      formData: { email, password: '' },
    };
    const startedAt = Date.now();
    try {
      const endpoint = await getGraphQLEndpoint();
      await boundedGraphqlFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hotel-reset-action': hotelResetActionSecret() },
        body: JSON.stringify({
          query: 'mutation($email:String!){sendUserPasswordResetLink(email:$email)}',
          variables: { email: String(email || '').trim().toLowerCase() },
        }),
        cache: 'no-store',
      });
    } catch {
      // Account existence and delivery state are intentionally not exposed.
    }
    const remaining = 400 - (Date.now() - startedAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    return generic;
  }
}

export async function getAuthenticatedUser() {
  const query = `
    query AuthenticatedUser {
      hotelOperatorCapabilities {
        canAccessDashboard
        canManageRooms
        canManageBookings
        canManageHousekeeping
        canManageGuests
        canManagePayments
        canManageOnboarding
        canManageAudit
        canManageIntegrations
        canManageGuestPrivacy canApproveHotelExceptions
      }
      authenticatedItem {
        ... on User {
          id
          email
          name
          onboardingStatus
        }
      }
    }
  `;

  const response = await keystoneClient(query);

  return response;
}

export async function getAuthHeaders() {
  'use server';
  const cookieStore = await cookies();
  const keystoneCookie = cookieStore.get('keystonejs-session')?.value;
  return keystoneCookie ? {
    Cookie: `keystonejs-session=${keystoneCookie}`
  } : {};
}
