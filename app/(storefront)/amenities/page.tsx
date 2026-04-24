import { Wifi, Coffee, Dumbbell, Utensils, Car, Waves, Sparkles, Shield, Clock, HeartPulse } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const amenities = [
  {
    category: 'Connectivity',
    icon: Wifi,
    items: [
      'High-speed WiFi throughout the property',
      'Business center with computers and printers',
      'Meeting rooms with video conferencing',
      '24/7 tech support'
    ]
  },
  {
    category: 'Dining',
    icon: Utensils,
    items: [
      'On-site restaurant with international cuisine',
      'Rooftop bar with city views',
      'Room service available 24/7',
      'Complimentary breakfast buffet',
      'Coffee shop and bakery'
    ]
  },
  {
    category: 'Wellness & Fitness',
    icon: Dumbbell,
    items: [
      'State-of-the-art fitness center',
      'Indoor heated swimming pool',
      'Spa and wellness center',
      'Yoga and meditation classes',
      'Personal training sessions available'
    ]
  },
  {
    category: 'Recreation',
    icon: Waves,
    items: [
      'Outdoor terrace and lounge',
      'Game room with billiards and arcade',
      'Library and reading room',
      'Seasonal rooftop pool'
    ]
  },
  {
    category: 'Services',
    icon: Sparkles,
    items: [
      'Concierge service',
      'Valet parking',
      'Dry cleaning and laundry',
      'Luggage storage',
      'Tour and ticket assistance',
      'Airport shuttle service'
    ]
  },
  {
    category: 'Safety & Security',
    icon: Shield,
    items: [
      '24-hour security',
      'Electronic key card access',
      'In-room safe',
      'Fire safety systems',
      'First aid available'
    ]
  },
  {
    category: 'Convenience',
    icon: Clock,
    items: [
      '24-hour front desk',
      'Multilingual staff',
      'ATM on-site',
      'Currency exchange',
      'Newspaper delivery',
      'Wake-up service'
    ]
  },
  {
    category: 'Accessibility',
    icon: HeartPulse,
    items: [
      'Wheelchair accessible',
      'Elevator access to all floors',
      'Accessible parking',
      'Service animal friendly',
      'Braille signage'
    ]
  }
];

export default function AmenitiesPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Hotel Amenities</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Discover our comprehensive range of facilities and services designed to make your stay comfortable and memorable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {amenities.map((amenity) => {
              const Icon = amenity.icon;
              return (
                <Card key={amenity.category}>
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900">
                        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <CardTitle>{amenity.category}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {amenity.items.map((item, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-8 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 border-none">
            <CardHeader>
              <CardTitle className="text-center text-2xl">Pet-Friendly Accommodations</CardTitle>
              <CardDescription className="text-center">
                We welcome your furry friends! Additional pet fee applies.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                Please contact our front desk for pet policies and accommodations.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
