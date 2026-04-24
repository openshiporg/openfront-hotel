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
  Utensils
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const contactInfo = [
  {
    icon: Phone,
    title: 'Phone',
    value: '+1 (555) 123-4567',
    description: '24/7 Front Desk',
    href: 'tel:+15551234567',
  },
  {
    icon: Mail,
    title: 'Email',
    value: 'info@grandhotel.com',
    description: 'General Inquiries',
    href: 'mailto:info@grandhotel.com',
  },
  {
    icon: MapPin,
    title: 'Address',
    value: '123 Main Street',
    description: 'Downtown, Metropolitan City',
    href: 'https://maps.google.com',
  },
  {
    icon: Clock,
    title: 'Hours',
    value: '24/7',
    description: 'Front desk always open',
    href: null,
  },
];

const faqs = [
  {
    category: 'Reservations',
    icon: Calendar,
    questions: [
      {
        question: 'What is your cancellation policy?',
        answer: 'Free cancellation is available up to 48 hours before check-in for most rates. Prepaid and special offer rates may have different cancellation policies. Please check your confirmation email for specific terms.',
      },
      {
        question: 'Can I modify my reservation?',
        answer: 'Yes, you can modify your reservation through our website or by contacting the front desk. Modifications are subject to availability and may affect the rate.',
      },
      {
        question: 'What time is check-in and check-out?',
        answer: 'Check-in time is 3:00 PM and check-out time is 11:00 AM. Early check-in and late check-out may be available upon request and subject to availability.',
      },
    ],
  },
  {
    category: 'Payment',
    icon: CreditCard,
    questions: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards (Visa, MasterCard, American Express, Discover), debit cards, and cash. We also accept mobile payments including Apple Pay and Google Pay.',
      },
      {
        question: 'Is a deposit required?',
        answer: 'A valid credit card is required at check-in. A security deposit may be placed on your card, which will be released within 3-5 business days after check-out.',
      },
    ],
  },
  {
    category: 'Amenities',
    icon: Utensils,
    questions: [
      {
        question: 'Is breakfast included?',
        answer: 'Breakfast inclusion depends on your rate plan. Some rates include complimentary breakfast buffet. You can also purchase breakfast separately at our restaurant.',
      },
      {
        question: 'Do you have a gym and pool?',
        answer: 'Yes, we have a state-of-the-art fitness center and an indoor heated pool. Both are available to all guests 24/7.',
      },
      {
        question: 'Is WiFi free?',
        answer: 'Yes, high-speed WiFi is complimentary throughout the property for all guests.',
      },
    ],
  },
  {
    category: 'Accessibility',
    icon: Accessibility,
    questions: [
      {
        question: 'Are your rooms wheelchair accessible?',
        answer: 'Yes, we have accessible rooms available with roll-in showers, grab bars, and wider doorways. Please request an accessible room when booking.',
      },
      {
        question: 'Do you allow service animals?',
        answer: 'Yes, service animals are welcome at our hotel at no additional charge. Please let us know in advance so we can accommodate your needs.',
      },
    ],
  },
];

export default function ContactPage() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubjectChange = (value: string) => {
    setFormData({
      ...formData,
      subject: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast({
      title: 'Message Sent!',
      description: 'We will get back to you within 24 hours.',
    });

    setFormData({
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    });

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Contact & Support</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Have questions? We're here to help. Reach out to us anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4 mb-12">
            {contactInfo.map((info) => {
              const Icon = info.icon;
              const content = (
                <Card className="text-center h-full hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                    </div>
                    <h3 className="font-semibold mb-1">{info.title}</h3>
                    <p className="text-blue-600 dark:text-blue-400 font-medium">
                      {info.value}
                    </p>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                  </CardContent>
                </Card>
              );

              if (info.href) {
                return (
                  <a key={info.title} href={info.href} className="block">
                    {content}
                  </a>
                );
              }
              return <div key={info.title}>{content}</div>;
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Send Us a Message
                </CardTitle>
                <CardDescription>
                  Fill out the form below and we'll respond within 24 hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="john@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject *</Label>
                      <Select value={formData.subject} onValueChange={handleSubjectChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a topic" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reservation">Reservation Inquiry</SelectItem>
                          <SelectItem value="modification">Modify Booking</SelectItem>
                          <SelectItem value="cancellation">Cancellation Request</SelectItem>
                          <SelectItem value="billing">Billing Question</SelectItem>
                          <SelectItem value="feedback">Feedback</SelectItem>
                          <SelectItem value="group">Group Booking</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      placeholder="How can we help you?"
                      rows={5}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  Frequently Asked Questions
                </CardTitle>
                <CardDescription>
                  Quick answers to common questions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {faqs.map((category) => (
                  <div key={category.category} className="mb-6 last:mb-0">
                    <div className="flex items-center gap-2 mb-3">
                      <category.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="font-semibold">{category.category}</h4>
                    </div>
                    <Accordion type="single" collapsible className="w-full">
                      {category.questions.map((faq, index) => (
                        <AccordionItem key={index} value={`${category.category}-${index}`}>
                          <AccordionTrigger className="text-left text-sm">
                            {faq.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 border-none">
            <CardContent className="py-8">
              <div className="text-center max-w-2xl mx-auto">
                <h3 className="text-2xl font-bold mb-4">Need Immediate Assistance?</h3>
                <p className="text-muted-foreground mb-6">
                  Our front desk is available 24/7 to assist you with any urgent matters.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild>
                    <a href="tel:+15551234567">
                      <Phone className="mr-2 h-5 w-5" />
                      Call Front Desk
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <a href="mailto:urgent@grandhotel.com">
                      <Mail className="mr-2 h-5 w-5" />
                      Email Support
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
