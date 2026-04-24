'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Hotel, Key, Calendar, MapPin, Wifi, Coffee, Star, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { SearchWidget } from '@/components/booking/SearchWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_ROOM_TYPES } from '@/lib/queries';
import { RoomType } from '@/lib/types';

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1920&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1920&auto=format&fit=crop',
];

const TESTIMONIALS = [
  {
    name: 'Sarah Johnson',
    rating: 5,
    text: 'Absolutely wonderful stay! The room was spotless, the staff was incredibly friendly, and the location was perfect.',
    date: 'November 2024',
  },
  {
    name: 'Michael Chen',
    rating: 5,
    text: 'Best hotel experience in the city. The amenities were top-notch and the service exceeded all expectations.',
    date: 'October 2024',
  },
  {
    name: 'Emma Williams',
    rating: 5,
    text: 'A perfect blend of luxury and comfort. Will definitely be returning on my next visit to the city.',
    date: 'October 2024',
  },
];

export default function Home() {
  const [currentHeroImage, setCurrentHeroImage] = React.useState(0);
  const [featuredRooms, setFeaturedRooms] = React.useState<RoomType[]>([]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroImage((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const fetchFeaturedRooms = async () => {
      try {
        const data = await graphqlClient.request<{ roomTypes: RoomType[] }>(GET_ROOM_TYPES);
        setFeaturedRooms(data.roomTypes.slice(0, 3));
      } catch (err) {
        console.error('Error fetching featured rooms:', err);
      }
    };

    fetchFeaturedRooms();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-white/95 dark:bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hotel className="h-8 w-8" />
            <span className="text-2xl font-bold">Grand Hotel</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/rooms" className="text-sm font-medium hover:underline">
              Rooms
            </Link>
            <Link href="/amenities" className="text-sm font-medium hover:underline">
              Amenities
            </Link>
            <Link href="/location" className="text-sm font-medium hover:underline">
              Location
            </Link>
            <Link href="/bookings/lookup" className="text-sm font-medium hover:underline">
              My Bookings
            </Link>
            <Link href="/dashboard" className="text-sm font-medium hover:underline">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section with Background Carousel */}
      <section className="relative h-[600px] overflow-hidden">
        {HERO_IMAGES.map((image, index) => (
          <div
            key={image}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              currentHeroImage === index ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Image
              src={image}
              alt={`Hero ${index + 1}`}
              fill
              className="object-cover"
              priority={index === 0}
            />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        ))}

        <div className="relative h-full flex items-center">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-12 text-white">
              <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">
                Welcome to Grand Hotel
              </h1>
              <p className="text-2xl mb-8 drop-shadow">
                Experience luxury and comfort in the heart of the city
              </p>
            </div>

            {/* Search Widget */}
            <div className="max-w-5xl mx-auto">
              <SearchWidget />
            </div>
          </div>
        </div>

        {/* Hero Navigation Dots */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2">
          {HERO_IMAGES.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentHeroImage(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                currentHeroImage === index
                  ? 'bg-white w-8'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Featured Rooms Section */}
      {featuredRooms.length > 0 && (
        <section className="py-16 bg-slate-50 dark:bg-slate-950">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Featured Rooms</h2>
              <p className="text-lg text-muted-foreground">
                Discover our most popular accommodations
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {featuredRooms.map((room) => (
                <Card key={room.id} className="overflow-hidden hover:shadow-xl transition-shadow">
                  <div className="relative h-48 bg-slate-200 dark:bg-slate-800">
                    <Image
                      src={`https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=400&auto=format&fit=crop&q=80`}
                      alt={room.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <CardHeader>
                    <CardTitle>{room.name}</CardTitle>
                    <CardDescription>
                      Up to {room.maxOccupancy} guests • {room.squareFeet ? `${room.squareFeet} sq ft` : 'Spacious'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-3xl font-bold">${room.baseRate}</span>
                      <span className="text-muted-foreground">/night</span>
                    </div>
                    {room.amenities && room.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {room.amenities.slice(0, 3).map((amenity) => (
                          <Badge key={amenity} variant="secondary" className="text-xs">
                            {amenity}
                          </Badge>
                        ))}
                        {room.amenities.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{room.amenities.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Button asChild className="w-full">
                      <Link href={`/rooms/${room.id}`}>View Details</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            <div className="text-center mt-12">
              <Button asChild size="lg" variant="outline">
                <Link href="/rooms">
                  View All Rooms
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Why Choose Us</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
                <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Prime Location</h3>
              <p className="text-muted-foreground">
                Located in the heart of the city, close to all major attractions and business centers.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
                <Wifi className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Modern Amenities</h3>
              <p className="text-muted-foreground">
                Free WiFi, flat-screen TVs, premium bedding, and more in every room.
              </p>
            </div>
            <div className="text-center p-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
                <Coffee className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Exceptional Service</h3>
              <p className="text-muted-foreground">
                24/7 front desk, room service, concierge, and personalized attention to every guest.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 bg-slate-50 dark:bg-slate-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">What Our Guests Say</h2>
            <p className="text-lg text-muted-foreground">
              Real experiences from real guests
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {TESTIMONIALS.map((testimonial, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <CardTitle className="text-lg">{testimonial.name}</CardTitle>
                  <CardDescription>{testimonial.date}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground italic">"{testimonial.text}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Special Offers Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-12 text-white text-center">
            <Tag className="h-12 w-12 mx-auto mb-4" />
            <h2 className="text-4xl font-bold mb-4">Special Offer</h2>
            <p className="text-xl mb-2">Book 3 nights or more and save 20%</p>
            <p className="text-blue-100 mb-8">
              Valid for bookings made in the next 30 days. Use code: STAY3SAVE20
            </p>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/rooms">
                Book Now
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Location Section */}
      <section className="py-16 bg-slate-50 dark:bg-slate-950">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-4">Perfect Location</h2>
              <p className="text-lg text-muted-foreground mb-6">
                Situated in the vibrant heart of the city, Grand Hotel offers unparalleled access to cultural landmarks, shopping districts, and business centers. Whether you're here for business or leisure, everything you need is within reach.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  <span>5 minutes from downtown</span>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  <span>Walking distance to major attractions</span>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  <span>Easy access to public transportation</span>
                </li>
              </ul>
              <Button asChild variant="outline" size="lg">
                <Link href="/location">
                  View on Map
                </Link>
              </Button>
            </div>
            <div className="relative h-[400px] rounded-lg overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop"
                alt="Hotel Location"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-50 dark:bg-slate-900 py-16">
        <div className="container mx-auto px-4 text-center">
          <Key className="h-12 w-12 mx-auto mb-4 text-blue-600" />
          <h2 className="text-3xl font-bold mb-4">Ready to Book Your Stay?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Browse our selection of luxurious rooms and find the perfect accommodation for you.
          </p>
          <Link
            href="/rooms"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-8 py-3 text-lg font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Calendar className="mr-2 h-5 w-5" />
            View All Rooms
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2024 Grand Hotel. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
