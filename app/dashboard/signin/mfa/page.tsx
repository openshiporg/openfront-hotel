import MfaForm from '@/features/platform/guest-governance/MfaForm';

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <MfaForm from={(await searchParams).from || '/dashboard'} />;
}
