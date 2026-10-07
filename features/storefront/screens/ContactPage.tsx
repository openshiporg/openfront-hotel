'use client';

import * as React from 'react';
import Link from 'next/link';
import { useHotelSettings } from '../components/HotelSettingsProvider';
import { graphqlClient } from '@/lib/graphql-client';
import { operationAttempt } from '@/lib/operationAttempt';

const SUBMIT_CONTACT_MESSAGE = `mutation SubmitHotelContactMessage($name: String!, $email: String!, $phone: String, $subject: String!, $message: String!, $idempotencyKey: String!) { submitHotelContactMessage(name: $name, email: $email, phone: $phone, subject: $subject, message: $message, idempotencyKey: $idempotencyKey) { reference status replayed } }`;
const topics = [{ value: 'reservation', label: 'Planning a stay' }, { value: 'modification', label: 'Change or arrival request' }, { value: 'cancellation', label: 'Cancellation question' }, { value: 'billing', label: 'Payment, statement or refund' }, { value: 'accessibility', label: 'Accessibility requirements' }, { value: 'group', label: 'Multiple rooms' }, { value: 'feedback', label: 'Feedback' }, { value: 'other', label: 'Something else' }];
const emptyForm = { name: '', email: '', phone: '', subject: '', message: '' };
export default function ContactPage() {
  const identity = useHotelSettings();
  const [form, setForm] = React.useState(emptyForm);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const [error, setError] = React.useState('');
  const [receipt, setReceipt] = React.useState<{ reference: string; status: string; } | null>(null);
  React.useEffect(() => {
    const requested = (new URLSearchParams(window.location.search).get('subject') || '').trim().toLowerCase();
    const aliases: Record<string, string> = { 'room requirements': 'reservation', 'stay requirements': 'reservation', 'arrival question': 'modification' };
    const subject = aliases[requested] || requested;
    if (topics.some(topic => topic.value === subject)) setForm(previous => ({ ...previous, subject }));
  }, []);
  const update = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const payload = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null, subject: form.subject, message: form.message.trim() };
    if (!payload.name || !payload.email || !payload.subject || !payload.message) { setError('Complete the required fields, including your message.'); return; }
    pendingRef.current = true; setPending(true); setError('');
    try {
      const attempt = await operationAttempt('contact', payload);
      const result = await graphqlClient.request<{ submitHotelContactMessage: { reference: string; status: string; }; }>(SUBMIT_CONTACT_MESSAGE, { ...payload, idempotencyKey: attempt.key });
      if (!result.submitHotelContactMessage?.reference) throw new Error('Missing acknowledgement');
      setReceipt(result.submitHotelContactMessage);
      setForm(emptyForm);
      attempt.complete();
    } catch {
      setError('We could not confirm that your message was accepted. Your details are still here; retrying the same message uses the same request reference. You can also contact the property directly.');
    } finally { pendingRef.current = false; setPending(false); }
  }
  return <main className="lodging-container py-12 md:py-16">
    <header className="hotel-page-head">
      <p className="lodging-eyebrow">A little help from the house</p>
      <h1 className="lodging-display">Let’s make your stay easier.</h1>
      <p className="lodging-lead">Ask about your arrival, a reservation or a detail that matters to you. For an existing stay, the guest portal keeps your dates and statement close at hand.</p>
    </header>
    <nav aria-label="Guest help" className="hotel-subnav">
      <Link href="/bookings/lookup">Manage a reservation</Link>
      <Link href="/location">Plan your arrival</Link>
      <Link href="/policies">Rates & policies</Link>
    </nav>
    <div className="grid gap-10 py-10 lg:grid-cols-[.8fr_1.2fr]">
      <aside className="space-y-8">
        <div>
          <p className="lodging-eyebrow mb-3">Contact {identity.name}</p>
          <h2 className="lodging-headline">Direct to the property.</h2>
        </div>
        <dl className="space-y-6">
          {identity.phone && <div>
            <dt className="lodging-label mb-2">Telephone</dt>
            <dd>
              <a className="lodging-link" href={`tel:${identity.phone.replace(/[^+\d]/g, '')}`}>{identity.phone}</a>
            </dd>
          </div>}
          {identity.email && <div>
            <dt className="lodging-label mb-2">Email</dt>
            <dd className="break-words">
              <a className="lodging-link" href={`mailto:${identity.email}`}>{identity.email}</a>
            </dd>
          </div>}
          {identity.hours && <div>
            <dt className="lodging-label mb-2">Published hours</dt>
            <dd>{identity.hours}</dd>
          </div>}
          {identity.address.line1 && <div>
            <dt className="lodging-label mb-2">Find us</dt>
            <dd>{identity.address.line1}<br />{identity.address.line2}</dd>
          </div>}
        </dl>
        {!identity.phone && !identity.email && <p className="hotel-notice">Direct contact details have not been published. You can send an inquiry using this form.</p>}
        <div className="border-t border-[var(--lodging-rule)] pt-6 space-y-4">
          <h3 className="lodging-title">Before you write</h3>
          <p className="text-sm leading-7">A message requests assistance; it does not change or cancel a reservation. For cancellations, verify your booking to review its current policy and refund estimate.</p>
          <p className="text-sm leading-7">For accessibility, transport or room arrangements, describe what you need and ask the property to confirm suitability before booking.</p>
        </div>
      </aside>
      <section className="lodging-surface p-6 md:p-8">
        <h2 className="lodging-title mb-6">Send the house a note</h2>
        {receipt ? <div role="status" className="space-y-5">
          <p className="lodging-eyebrow">Request recorded</p>
          <p className="lodging-headline">Thank you for getting in touch.</p>
          <p>Reference <strong className="break-all">{receipt.reference}</strong>
          </p>
          <p className="hotel-notice">Delivery status: {receipt.status.replaceAll('_', ' ')}. Your inquiry is recorded; this is not confirmation that a staff member has read it or approved a request.</p>
          <button type="button" onClick={() => setReceipt(null)} className="lodging-button-ghost">Write another message</button>
        </div> : <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={pending} className="space-y-5">
            <legend className="sr-only">Your message and contact details</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="lodging-label">Name *</label>
                <input id="contact-name" name="name" autoComplete="name" required maxLength={160} value={form.name} onChange={update} className="lodging-input mt-2" />
              </div>
              <div>
                <label htmlFor="contact-email" className="lodging-label">Email *</label>
                <input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update} className="lodging-input mt-2" />
              </div>
            </div>
            <div>
              <label htmlFor="contact-phone" className="lodging-label">Telephone <span className="font-normal">(optional)</span>
              </label>
              <input id="contact-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={update} className="lodging-input mt-2" />
            </div>
            <div>
              <label htmlFor="contact-subject" className="lodging-label">What can we help with? *</label>
              <select id="contact-subject" name="subject" required value={form.subject} onChange={update} className="lodging-select mt-2">
                <option value="">Choose a topic</option>{topics.map(topic => <option key={topic.value} value={topic.value}>{topic.label}</option>)}</select>
            </div>
            <div>
              <label htmlFor="contact-message" className="lodging-label">Message *</label>
              <textarea id="contact-message" name="message" required maxLength={4000} value={form.message} onChange={update} rows={6} aria-describedby="contact-privacy" className="lodging-textarea mt-2" />
              <p id="contact-privacy" className="mt-2 text-sm text-[var(--lodging-ink-muted)]">Include your reservation reference if relevant. Please do not send payment card details or identity documents.</p>
            </div>
          </fieldset>
          {error && <p role="alert" className="hotel-notice">{error}</p>}
          <button type="submit" disabled={pending} className="lodging-button w-full">{pending ? 'Recording your message…' : 'Send message'}</button>
        </form>}
      </section>
    </div>
  </main>;
}
