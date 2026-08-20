'use client';

import * as React from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageSquare,
  Send,
  Loader2,
  HelpCircle,
  Calendar,
  CreditCard,
  Accessibility,
  Utensils,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useHotelSettings } from '@/features/storefront/components/HotelSettingsProvider';
import { graphqlClient } from '@/lib/graphql-client';
import { safeGuestWorkflowFailure } from '@/features/storefront/lib/qa-workflows';

const SUBMIT_CONTACT_MESSAGE = `
  mutation SubmitHotelContactMessage(
    $name: String!
    $email: String!
    $phone: String
    $subject: String!
    $message: String!
    $idempotencyKey: String!
  ) {
    submitHotelContactMessage(
      name: $name
      email: $email
      phone: $phone
      subject: $subject
      message: $message
      idempotencyKey: $idempotencyKey
    ) { reference status replayed }
  }
`;

function getContactInfo(identity: ReturnType<typeof useHotelSettings>) {
  return [
  {
    icon: Phone,
    title: 'Phone',
    value: identity.phone,
    description: identity.hours,
    href: `tel:${identity.phone.replace(/\D/g, '')}`,
  },
  {
    icon: Mail,
    title: 'Email',
    value: identity.email,
    description: 'General inquiries',
    href: `mailto:${identity.email}`,
  },
  {
    icon: MapPin,
    title: 'Address',
    value: identity.address.line1,
    description: identity.address.line2,
    href: null,
  },
  {
    icon: Clock,
    title: 'Check-in / out',
    value: `${identity.checkIn} · ${identity.checkOut}`,
    description: 'Front desk always open',
    href: null,
  },
  ];
}

function getFaqs(identity: ReturnType<typeof useHotelSettings>) {
  return [
  {
    category: 'Reservations',
    icon: Calendar,
    questions: [
      {
        question: 'What is your cancellation policy?',
        answer:
          'Free cancellation is available up to 48 hours before check-in for most flexible rates. Prepaid and promotional rates may differ—check your confirmation for specific terms.',
      },
      {
        question: 'Can I modify my reservation?',
        answer:
          'Yes. Use booking lookup with your confirmation number, or contact the front desk to change dates or room type subject to availability.',
      },
      {
        question: 'What time is check-in and check-out?',
        answer: `Check-in is ${identity.checkIn} and check-out is ${identity.checkOut}. Early arrival and late departure may be available on request.`,
      },
    ],
  },
  {
    category: 'Payment',
    icon: CreditCard,
    questions: [
      {
        question: 'What payment methods do you accept?',
        answer:
          'Major credit and debit cards are accepted for direct bookings. Payment provider availability is shown at checkout.',
      },
      {
        question: 'Is a deposit required?',
        answer:
          'A valid card is required to confirm a reservation. Any incidental hold is released after departure per card network timing.',
      },
    ],
  },
  {
    category: 'Amenities',
    icon: Utensils,
    questions: [
      {
        question: 'Is breakfast included?',
        answer:
          'Breakfast inclusion depends on your rate plan. Bed & Breakfast and Family Escape packages in the live catalog include breakfast.',
      },
      {
        question: 'Is WiFi free?',
        answer: 'Yes. High-speed WiFi is complimentary throughout the property.',
      },
    ],
  },
  {
    category: 'Accessibility',
    icon: Accessibility,
    questions: [
      {
        question: 'Are accessible rooms available?',
        answer:
          'Yes. Request an accessible room when booking so the front desk can assign appropriate inventory.',
      },
      {
        question: 'Do you allow service animals?',
        answer: 'Service animals are welcome. Please note this in your reservation message.',
      },
    ],
  },
  ];
}

export default function ContactPage() {
  const identity = useHotelSettings();
  const contactInfo = getContactInfo(identity);
  const faqs = getFaqs(identity);
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [submissionStatus, setSubmissionStatus] = React.useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubjectChange = (value: string) => {
    setFormData({ ...formData, subject: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      const message = 'Select a subject and fill in every required field.';
      setSubmissionStatus({ kind: 'error', message });
      toast({ title: 'Missing information', description: message, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    setSubmissionStatus(null);
    try {
      const response = await graphqlClient.request<{
        submitHotelContactMessage: { reference: string; status: string };
      }>(SUBMIT_CONTACT_MESSAGE, {
        ...formData,
        phone: formData.phone || null,
        idempotencyKey: crypto.randomUUID(),
      });
      const acknowledgement = `Message queued for the front desk. Reference ${response.submitHotelContactMessage.reference}.`;
      setSubmissionStatus({ kind: 'success', message: acknowledgement });
      toast({ title: 'Message queued for the front desk', description: acknowledgement });
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch {
      const failure = safeGuestWorkflowFailure('contact');
      setSubmissionStatus({ kind: 'error', message: failure });
      toast({ title: 'Message was not accepted', description: failure, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <section className="lodging-container py-16 md:py-24">
        <div className="lodging-grid-break border-b border-[var(--lodging-rule)] pb-10">
          <h1 className="lodging-display min-w-0">Contact the house.</h1>
          <p className="lodging-lead min-w-0">
            Reservations, modifications, and pre-arrival requests go to the property team—not a call center.
          </p>
        </div>
      </section>

      <section className="lodging-container pb-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contactInfo.map((info) => {
            const Icon = info.icon;
            const card = (
              <div className="lodging-surface h-full p-6">
                <Icon className="mb-5 h-5 w-5 text-[var(--lodging-accent-deep)]" />
                <p className="lodging-eyebrow mb-2">{info.title}</p>
                <p className="font-medium text-[var(--lodging-ink)]">{info.value}</p>
                <p className="mt-2 text-sm text-[var(--lodging-ink-faint)]">{info.description}</p>
              </div>
            );
            return info.href ? (
              <a key={info.title} href={info.href} className="block transition-opacity hover:opacity-85">
                {card}
              </a>
            ) : (
              <div key={info.title}>{card}</div>
            );
          })}
        </div>
      </section>

      <section className="lodging-container pb-20">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="lodging-surface p-6 md:p-8">
            <div className="mb-6 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[var(--lodging-accent-deep)]" />
              <h2 className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">Send a message</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name *</Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleInputChange} required className="rounded-none border-[var(--lodging-rule)]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} required className="rounded-none border-[var(--lodging-rule)]" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange} className="rounded-none border-[var(--lodging-rule)]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <select
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={(event) => handleSubjectChange(event.target.value)}
                    required
                    className="lodging-select rounded-none border-[var(--lodging-rule)]"
                  >
                    <option value="" disabled>Select a topic</option>
                    <option value="reservation">Reservation inquiry</option>
                    <option value="modification">Modify booking</option>
                    <option value="cancellation">Cancellation request</option>
                    <option value="billing">Billing question</option>
                    <option value="feedback">Feedback</option>
                    <option value="group">Group booking</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea id="message" name="message" value={formData.message} onChange={handleInputChange} rows={5} required className="rounded-none border-[var(--lodging-rule)]" />
              </div>
              {submissionStatus ? (
                <p
                  role={submissionStatus.kind === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={submissionStatus.kind === 'error' ? 'border-l-2 border-[var(--lodging-danger)] pl-4 text-sm text-[var(--lodging-danger)]' : 'border-l-2 border-[var(--lodging-accent)] pl-4 text-sm text-[var(--lodging-accent-deep)]'}
                >
                  {submissionStatus.message}
                </p>
              ) : null}
              <Button type="submit" className="lodging-button h-12 w-full rounded-none border-0 bg-[var(--lodging-night)] hover:bg-[var(--lodging-accent-deep)]" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send message
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="lodging-surface p-6 md:p-8">
            <div className="mb-6 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-[var(--lodging-accent-deep)]" />
              <h2 className="lodging-title text-[clamp(1.5rem,2.5vw,2rem)]">Common questions</h2>
            </div>
            {faqs.map((category) => (
              <div key={category.category} className="mb-6 last:mb-0">
                <div className="mb-3 flex items-center gap-2">
                  <category.icon className="h-4 w-4 text-[var(--lodging-accent-deep)]" />
                  <h3 className="font-medium text-[var(--lodging-ink)]">{category.category}</h3>
                </div>
                <Accordion type="single" collapsible className="w-full">
                  {category.questions.map((faq, index) => (
                    <AccordionItem key={index} value={`${category.category}-${index}`} className="border-[var(--lodging-rule)]">
                      <AccordionTrigger className="text-left text-sm hover:no-underline">{faq.question}</AccordionTrigger>
                      <AccordionContent className="text-sm leading-6 text-[var(--lodging-ink-muted)]">{faq.answer}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--lodging-rule)] bg-[var(--lodging-paper-2)]">
        <div className="lodging-container py-14 text-center">
          <h2 className="lodging-title">Need help before arrival?</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--lodging-ink-muted)] leading-7">
            The front desk is available around the clock for urgent stay matters.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <a href={`tel:${identity.phone.replace(/\D/g, '')}`} className="lodging-button">
              <Phone className="h-4 w-4" />
              Call front desk
            </a>
            <a href={`mailto:${identity.email}`} className="lodging-button-ghost">
              <Mail className="h-4 w-4" />
              Email concierge
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
