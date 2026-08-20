export function assertNewOperatorPostingAllowed(folioStatus: string): void {
  if (folioStatus !== 'open') {
    throw new Error('Closed or voided folios cannot accept new operator postings.');
  }
}
