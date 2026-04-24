'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO, isPast, isFuture } from 'date-fns';
import { 
  User, 
  Calendar, 
  Loader2, 
  Search, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  LogOut,
  Mail,
  Phone,
  MapPin,
  ChevronRight,
  History,
  Star
} from 'lucide-react';

import { graphqlClient } from '@/lib/graphql-client';
import { GET_BOOKINGS_BY_EMAIL } from '@/lib/queries';
import { Booking } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Separator } from '@/components/ui/separator';

interface BookingsResponse {
  bookings: Booking[];
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case 'confirmed':
      return <Badge className="bg-[color:oklch(0.96_0.02_150)] text-[color:oklch(0.38_0.08_160)] border-0">Confirmed</Badge>;
    case 'pending':
      return <Badge className="bg-[color:oklch(0.97_0.02_82)] text-[color:oklch(0.38_0.06_70)] border-0">Pending</Badge>;
    case 'checked_in':
      return <Badge className="bg-[color:oklch(0.94_0.02_220)] text-[color:oklch(0.32_0.08_230)] border-0">Checked In</Badge>;
    case 'checked_out':
      return <Badge className="bg-[color:oklch(0.94_0.01_82)] text-[color:oklch(0.42_0.02_82)] border-0">Completed</Badge>;
    case 'cancelled':
      return <Badge className="bg-[color:oklch(0.97_0.02_20)] text-[color:oklch(0.38_0.08_25)] border-0">Cancelled</Badge>;
    case 'no_show':
      return <Badge className="bg-[color:oklch(0.96_0.03_45)] text-[color:oklch(0.34_0.08_45)] border-0">No Show</Badge>;
    default:
      return <Badge variant="outline" className="border-[color:oklch(0.88_0.01_82)] text-[color:oklch(0.42_0.03_58)]">{status || 'Unknown'}</Badge>;
  }
}

export default function AccountPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = React.useState('');
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [guestInfo, setGuestInfo] = React.useState<{ email: string; name: string } | null>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem('openfront_guest_context');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.email) {
          setEmail(parsed.email);
          setGuestInfo({ email: parsed.email, name: parsed.name || 'Guest' });
          setIsLoggedIn(true);
          fetchBookings(parsed.email);
        }
      } catch (e) {}
    }
  }, []);

  const fetchBookings = async (guestEmail: string) => {
    setLoading(true);
    try {
      const data = await graphqlClient.request<BookingsResponse>(GET_BOOKINGS_BY_EMAIL, {
        email: guestEmail,
      });
      setBookings(data.bookings || []);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      toast({
        title: 'Error',
        description: 'Failed to load your reservations.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: 'Email Required',
        description: 'Please enter your email address.',
        variant: 'destructive',
      });
      return;
    }

    await fetchBookings(email);
    
    if (bookings.length > 0 || true) {
      const firstName = bookings[0]?.guestName?.split(' ')[0] || 'Guest';
      
      localStorage.setItem('openfront_guest_context', JSON.stringify({
        email,
        name: bookings[0]?.guestName || firstName,
      }));

      setGuestInfo({ email, name: firstName });
      setIsLoggedIn(true);
      toast({
        title: 'Welcome Back!',
        description: 'You are now logged in.',
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('openfront_guest_context');
    setIsLoggedIn(false);
    setBookings([]);
    setGuestInfo(null);
    setEmail('');
    toast({
      title: 'Logged Out',
      description: 'You have been logged out successfully.',
    });
  };

  const upcomingBookings = bookings.filter(
    (b) => isFuture(parseISO(b.checkInDate)) && b.status !== 'cancelled'
  );
  const pastBookings = bookings.filter(
    (b) => isPast(parseISO(b.checkOutDate)) || b.status === 'checked_out'
  );
  const cancelledBookings = bookings.filter((b) => b.status === 'cancelled');

  if (!isLoggedIn) {
    return (
      <div className="hotel-page min-h-screen">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-md">
            <Card className="hotel-surface rounded-[2rem] border-0 bg-transparent shadow-none">
              <CardHeader className="text-center">
                <div className="hotel-surface mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-white">
                  <User className="h-10 w-10 text-[color:oklch(0.34_0.08_45)]" />
                </div>
                <CardTitle className="hotel-title text-3xl font-semibold">Guest access</CardTitle>
                <CardDescription className="text-[color:oklch(0.42_0.03_58)]">
                  Enter your email to manage your stay and view history
                </CardDescription>
              </CardHeader>
              <CardContent className="hotel-surface space-y-6 rounded-[2rem] p-8">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-[color:oklch(0.31_0.03_58)]">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 rounded-[1rem] border-[color:oklch(0.88_0.01_82)] bg-white/50 focus:bg-white"
                      required
                    />
                  </div>
                  <Button type="submit" className="h-12 w-full rounded-full bg-[color:oklch(0.34_0.08_45)] text-white hover:bg-[color:oklch(0.3_0.08_42)]" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Locating profile...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Find my reservations
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-8 border-t border-[color:oklch(0.88_0.01_82)] pt-8">
                  <p className="mb-4 text-center text-sm text-[color:oklch(0.46_0.03_58)]">
                    Only have a confirmation number?
                  </p>
                  <Button variant="outline" className="h-12 w-full rounded-full border-[color:oklch(0.82_0.02_75)] text-[color:oklch(0.38_0.03_58)] hover:bg-white/60" asChild>
                    <Link href="/bookings/lookup">
                      Search confirmation number
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hotel-page min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="hotel-kicker mb-1">Guest portal</div>
              <h1 className="hotel-title text-4xl font-semibold text-[color:oklch(0.22_0.02_58)]">Welcome back, {guestInfo?.name}</h1>
              <p className="text-[color:oklch(0.42_0.03_58)]">{guestInfo?.email}</p>
            </div>
            <Button variant="outline" onClick={handleLogout} className="h-10 rounded-full border-[color:oklch(0.82_0.02_75)] text-[color:oklch(0.38_0.03_58)] hover:bg-white/60">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>

          <div className="mb-10 grid gap-6 md:grid-cols-3">
            <Card className="hotel-surface rounded-[2rem] border-0 p-6 shadow-none">
              <CardContent className="p-0">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-[color:oklch(0.95_0.02_220)]">
                    <Calendar className="h-6 w-6 text-[color:oklch(0.32_0.08_230)]" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[color:oklch(0.22_0.02_58)]">{upcomingBookings.length}</p>
                    <p className="text-sm font-medium text-[color:oklch(0.46_0.03_58)]">Upcoming stays</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hotel-surface rounded-[2rem] border-0 p-6 shadow-none">
              <CardContent className="p-0">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-[color:oklch(0.96_0.02_150)]">
                    <CheckCircle2 className="h-6 w-6 text-[color:oklch(0.38_0.08_160)]" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[color:oklch(0.22_0.02_58)]">{pastBookings.length}</p>
                    <p className="text-sm font-medium text-[color:oklch(0.46_0.03_58)]">Completed stays</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hotel-surface rounded-[2rem] border-0 p-6 shadow-none">
              <CardContent className="p-0">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-[color:oklch(0.97_0.02_82)]">
                    <Star className="h-6 w-6 text-[color:oklch(0.38_0.06_70)]" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[color:oklch(0.22_0.02_58)]">{bookings.length}</p>
                    <p className="text-sm font-medium text-[color:oklch(0.46_0.03_58)]">Lifetime visits</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="mb-8 h-12 gap-2 rounded-full border border-[color:oklch(0.88_0.01_82)] bg-white/40 p-1">
              <TabsTrigger value="upcoming" className="rounded-full px-6 data-[state=active]:bg-[color:oklch(0.34_0.08_45)] data-[state=active]:text-white">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="past" className="rounded-full px-6 data-[state=active]:bg-[color:oklch(0.34_0.08_45)] data-[state=active]:text-white">
                Past history
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="rounded-full px-6 data-[state=active]:bg-[color:oklch(0.34_0.08_45)] data-[state=active]:text-white">
                Cancelled
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : upcomingBookings.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No upcoming reservations</h3>
                    <p className="text-muted-foreground mb-4">
                      Ready to plan your next getaway?
                    </p>
                    <Button asChild>
                      <Link href="/rooms">Browse Rooms</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {upcomingBookings.map((booking) => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="past">
              {pastBookings.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No past stays</h3>
                    <p className="text-muted-foreground">
                      Your completed stays will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {pastBookings.map((booking) => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cancelled">
              {cancelledBookings.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <XCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No cancelled reservations</h3>
                    <p className="text-muted-foreground">
                      Cancelled bookings will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {cancelledBookings.map((booking) => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <Card className="hotel-surface rounded-[1.75rem] border-0 p-1 shadow-none transition-transform hover:scale-[1.01] active:scale-[0.99]">
      <CardContent className="p-6">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-[color:oklch(0.24_0.02_58)]">
                Confirmation: {booking.confirmationNumber}
              </h3>
              {getStatusBadge(booking.status)}
            </div>
            <div className="grid grid-cols-2 gap-6 text-sm md:grid-cols-4">
              <div>
                <p className="mb-1 text-[color:oklch(0.46_0.03_58)]">Check-in</p>
                <p className="font-semibold text-[color:oklch(0.31_0.03_58)]">
                  {format(parseISO(booking.checkInDate), 'MMM dd, yyyy')}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[color:oklch(0.46_0.03_58)]">Check-out</p>
                <p className="font-semibold text-[color:oklch(0.31_0.03_58)]">
                  {format(parseISO(booking.checkOutDate), 'MMM dd, yyyy')}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[color:oklch(0.46_0.03_58)]">Duration</p>
                <p className="font-semibold text-[color:oklch(0.31_0.03_58)]">{booking.numberOfNights} night{booking.numberOfNights !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="mb-1 text-[color:oklch(0.46_0.03_58)]">Total value</p>
                <p className="font-semibold text-[color:oklch(0.31_0.03_58)]">
                  ${(booking.totalAmount || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
          <Button variant="outline" className="h-10 rounded-full border-[color:oklch(0.82_0.02_75)] px-6 text-[color:oklch(0.38_0.03_58)] hover:bg-white/60" asChild>
            <Link href={`/booking/${booking.id}`}>
              View reservation
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
