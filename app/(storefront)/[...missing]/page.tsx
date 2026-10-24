import { notFound } from 'next/navigation';

// Unknown storefront paths get the storefront's own 404 page and chrome.
export default function MissingPage() {
  notFound();
}
