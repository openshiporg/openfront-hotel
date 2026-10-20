'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleCheck, Clock, Mail, MapPin, Phone, Send } from 'lucide-react';
import { useHotelSettings } from '../components/HotelSettingsProvider';
import { Notice } from '../components/ui';
import { graphqlClient } from '@/lib/graphql-client';
import { operationAttempt } from '@/lib/operationAttempt';

const SUBMIT_CONTACT_MESSAGE = `mutation SubmitHotelContactMessage($name: String!, $email: String!, $phone: String, $subject: String!, $message: String!, $idempotencyKey: String!) { submitHotelContactMessage(name: $name, email: $email, phone: $phone, subject: $subject, message: $message, idempotencyKey: $idempotencyKey) { reference status replayed } }`;
const topics = [{ value: 'reservation', label: 'Planning a stay' }, { value: 'modification', label: 'Change or arrival request' }, { value: 'cancellation', label: 'Cancellation question' }, { value: 'billing', label: 'Payment, statement or refund' }, { value: 'accessibility', label: 'Accessibility requirements' }, { value: 'group', label: 'Multiple rooms' }, { value: 'account', label: 'Account access' }, { value: 'feedback', label: 'Feedback' }, { value: 'other', label: 'Something else' }];
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
  const phone = identity.phone.replace(/[^+\d]/g, '');
  return <div className="sf-wrap sf-section--tight">
    <div className="sf-checkout sf-checkout--even">
      <aside className="sf-stack" style={{ '--stack': '22px' } as React.CSSProperties}>
        <p className="sf-eyebrow">A little help from the house</p>
        <h1 className="sf-h1">Let’s make your stay <em>easier.</em></h1>
        <p className="sf-lead">Ask about your arrival, a reservation or a detail that matters to you. For an existing stay, your guest account keeps your dates and statement close at hand.</p>
        <div className="sf-stack" style={{ '--stack': '10px', marginTop: 28 } as React.CSSProperties}>
          {phone && <a className="sf-action" href={`tel:${phone}`}><Phone aria-hidden="true" /><span>{identity.phone}<small>Call the property</small></span></a>}
          {identity.email && <a className="sf-action" href={`mailto:${identity.email}`} style={{ overflowWrap: 'anywhere' }}><Mail aria-hidden="true" /><span>{identity.email}<small>Email the property</small></span></a>}
          {identity.hours && <div className="sf-action" style={{ cursor: 'default' }}><Clock aria-hidden="true" /><span>{identity.hours}<small>Published hours</small></span></div>}
          {identity.address.line1 && <Link className="sf-action" href="/location"><MapPin aria-hidden="true" /><span>{identity.address.line1}<small>{identity.address.line2 || 'Location & arrival'}</small></span></Link>}
          {!identity.phone && !identity.email && identity.inquiriesAvailable && <Notice tone="info">Direct contact details have not been published. You can send an inquiry using this form.</Notice>}
        </div>
        <div className="sf-panel sf-pad sf-stack" style={{ '--stack': '10px' } as React.CSSProperties}>
          <h2 className="sf-h4">Before you write</h2>
          <p className="sf-muted sf-small">A message requests assistance; it does not change or cancel a reservation. For cancellations, verify your booking to review its current policy and refund estimate.</p>
          <p className="sf-muted sf-small">For accessibility, transport or room arrangements, describe what you need and ask the property to confirm suitability before booking.</p>
          <div className="sf-row" style={{ gap: '4px 20px' }}><Link href="/bookings/lookup" className="sf-link">Manage a reservation</Link><Link href="/policies" className="sf-link">Rates & policies</Link></div>
        </div>
      </aside>

      <section className="sf-float sf-pad-lg" aria-labelledby="contact-form-title">
        <h2 id="contact-form-title" className="sf-h2" style={{ marginBottom: 24 }}>Send the house <em>a note.</em></h2>
        {!identity.inquiriesAvailable ? <div role="status" className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
          <p className="sf-h3">Messages can’t be sent from this page right now.</p>
          <p className="sf-muted">{identity.phone ? 'Please call the property instead.' : 'The property has not set up a contact address yet. Please try again later.'}</p>
          {phone && <a className="sf-btn sf-btn--ghost" href={`tel:${phone}`} style={{ width: 'fit-content' }}><Phone aria-hidden="true" />Call {identity.phone}</a>}
        </div> : receipt ? <div role="status" className="sf-stack" style={{ '--stack': '16px' } as React.CSSProperties}>
          <span className="sf-state__icon"><CircleCheck aria-hidden="true" /></span>
          <p className="sf-eyebrow">Request recorded</p>
          <p className="sf-h3">Thank you for getting in touch.</p>
          <p>Reference <span className="sf-code" style={{ paddingRight: 14 }}>{receipt.reference}</span></p>
          <Notice tone="info">Delivery status: {receipt.status.replaceAll('_', ' ')}. Your inquiry is recorded; this is not confirmation that a staff member has read it or approved a request.</Notice>
          <button type="button" onClick={() => setReceipt(null)} className="sf-btn sf-btn--ghost" style={{ width: 'fit-content' }}>Write another message</button>
        </div> : <form onSubmit={submit} className="sf-stack" style={{ '--stack': '20px' } as React.CSSProperties}>
          <fieldset disabled={pending} className="sf-formgrid">
            <legend className="sf-sr">Your message and contact details</legend>
            <label className="sf-field" htmlFor="contact-name"><span className="sf-label">Name</span><input id="contact-name" name="name" autoComplete="name" required maxLength={160} value={form.name} onChange={update} className="sf-input" /></label>
            <label className="sf-field" htmlFor="contact-email"><span className="sf-label">Email</span><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update} className="sf-input" /></label>
            <label className="sf-field" htmlFor="contact-phone"><span className="sf-label">Telephone <small>(optional)</small></span><input id="contact-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={update} className="sf-input" /></label>
            <label className="sf-field" htmlFor="contact-subject"><span className="sf-label">What can we help with?</span>
              <select id="contact-subject" name="subject" required value={form.subject} onChange={update} className="sf-select">
                <option value="">Choose a topic</option>{topics.map(topic => <option key={topic.value} value={topic.value}>{topic.label}</option>)}</select>
            </label>
            <label className="sf-field sf-span" htmlFor="contact-message"><span className="sf-label">Message</span>
              <textarea id="contact-message" name="message" required maxLength={4000} value={form.message} onChange={update} rows={6} aria-describedby="contact-privacy" className="sf-textarea" />
              <span id="contact-privacy" className="sf-hint">Include your reservation reference if relevant. Please do not send payment card details or identity documents.</span>
            </label>
          </fieldset>
          {error && <Notice tone="danger" role="alert">{error}</Notice>}
          <button type="submit" disabled={pending} className="sf-btn sf-btn--lg sf-btn--block"><Send aria-hidden="true" />{pending ? 'Recording your message…' : 'Send message'}</button>
          <p className="sf-fine">All fields are required unless marked optional.</p>
        </form>}
      </section>
    </div>
  </div>;
}
