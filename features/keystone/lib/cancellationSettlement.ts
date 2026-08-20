type CancellationAuditEvidence = {
  metadataSnapshot?: unknown;
} | null | undefined;

export function cancellationSettlementStatus(
  cancellationAudit: CancellationAuditEvidence,
): 'no_show' | 'cancelled' {
  const metadata = cancellationAudit?.metadataSnapshot;
  return metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).source === 'no_show'
    ? 'no_show'
    : 'cancelled';
}
