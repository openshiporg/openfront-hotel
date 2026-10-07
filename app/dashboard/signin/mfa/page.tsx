import MfaForm from '@/features/dashboard/screens/SignInPage/MfaForm';

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <MfaForm from={(await searchParams).from || '/dashboard'} />;
}
