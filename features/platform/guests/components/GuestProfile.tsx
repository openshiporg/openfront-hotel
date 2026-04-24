'use client';

import React from 'react';
import Link from 'next/link';
import { format, parseISO, differenceInDays, isPast, isFuture } from 'date-fns';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Star, 
  Award, 
  CreditCard,
  Clock,
  MessageSquare,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Edit,
  Send,
  Plus,
  Briefcase,
  Shield,
  Heart
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface GuestPreferences {
  pillowType?: string;
  floorPreference?: string;
  smokingPreference?: string;
  bedType?: string;
  earlyCheckIn?: boolean;
  lateCheckOut?: boolean;
  specialDiet?: string;
  accessibility?: string[];
}

export interface GuestBooking {
  id: string;
  confirmationNumber: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  totalAmount: number;
  roomType?: string;
  specialRequests?: string;
}

export interface GuestDocument {
  id: string;
  type: string;
  documentNumber: string;
  expiryDate?: string;
  isVerified: boolean;
}

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  loyaltyNumber?: string;
  loyaltyTier?: string;
  loyaltyPoints?: string;
  preferences?: GuestPreferences;
  idType?: string;
  idNumber?: string;
  nationality?: string;
  isVip?: boolean;
  isBlacklisted?: boolean;
  specialNotes?: string;
  lastStayAt?: string;
  totalStays?: string;
  totalSpent?: string;
  bookings?: GuestBooking[];
  documents?: GuestDocument[];
  createdAt?: string;
}

interface GuestProfileProps {
  guest: Guest;
  onEdit?: () => void;
  onSendEmail?: () => void;
  onNewReservation?: () => void;
  onAddNote?: () => void;
}

function getLoyaltyTierColor(tier?: string) {
  switch (tier) {
    case 'diamond':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'platinum':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'gold':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'silver':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'bronze':
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'confirmed':
      return <Badge className="bg-green-100 text-green-700">Confirmed</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>;
    case 'checked_in':
      return <Badge className="bg-blue-100 text-blue-700">Checked In</Badge>;
    case 'checked_out':
      return <Badge className="bg-gray-100 text-gray-700">Completed</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>;
    case 'no_show':
      return <Badge className="bg-orange-100 text-orange-700">No Show</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function GuestProfile({ 
  guest, 
  onEdit, 
  onSendEmail, 
  onNewReservation,
  onAddNote 
}: GuestProfileProps) {
  const initials = `${guest.firstName?.charAt(0) || ''}${guest.lastName?.charAt(0) || ''}`.toUpperCase();
  
  const upcomingBookings = guest.bookings?.filter(
    (b) => isFuture(parseISO(b.checkInDate)) && !['cancelled', 'no_show'].includes(b.status)
  ) || [];
  
  const pastBookings = guest.bookings?.filter(
    (b) => isPast(parseISO(b.checkOutDate)) || b.status === 'checked_out'
  ) || [];
  
  const cancelledBookings = guest.bookings?.filter(
    (b) => ['cancelled', 'no_show'].includes(b.status)
  ) || [];

  const totalNights = pastBookings.reduce((acc, booking) => {
    const nights = differenceInDays(parseISO(booking.checkOutDate), parseISO(booking.checkInDate));
    return acc + nights;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            {/* Avatar & Basic Info */}
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20 text-2xl">
                <AvatarFallback className={cn(
                  guest.isVip ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                )}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-bold">
                    {guest.firstName} {guest.lastName}
                  </h2>
                  {guest.isVip && (
                    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                      <Star className="h-3 w-3 mr-1" />
                      VIP
                    </Badge>
                  )}
                  {guest.isBlacklisted && (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Blacklisted
                    </Badge>
                  )}
                </div>
                
                {guest.loyaltyTier && (
                  <Badge className={cn('mb-2', getLoyaltyTierColor(guest.loyaltyTier))}>
                    <Award className="h-3 w-3 mr-1" />
                    {guest.loyaltyTier.charAt(0).toUpperCase() + guest.loyaltyTier.slice(1)} Member
                    {guest.loyaltyNumber && ` • ${guest.loyaltyNumber}`}
                  </Badge>
                )}
                
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <a href={`mailto:${guest.email}`} className="flex items-center gap-2 hover:text-foreground">
                    <Mail className="h-4 w-4" />
                    {guest.email}
                  </a>
                  {guest.phone && (
                    <a href={`tel:${guest.phone}`} className="flex items-center gap-2 hover:text-foreground">
                      <Phone className="h-4 w-4" />
                      {guest.phone}
                    </a>
                  )}
                  {guest.company && (
                    <span className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      {guest.company}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 md:ml-auto">
              {onNewReservation && (
                <Button onClick={onNewReservation}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Reservation
                </Button>
              )}
              {onSendEmail && (
                <Button variant="outline" onClick={onSendEmail}>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
              )}
              {onEdit && (
                <Button variant="outline" onClick={onEdit}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              {onAddNote && (
                <Button variant="outline" onClick={onAddNote}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{guest.totalStays || pastBookings.length}</p>
              <p className="text-sm text-muted-foreground">Total Stays</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{totalNights}</p>
              <p className="text-sm text-muted-foreground">Total Nights</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold">
                {guest.totalSpent 
                  ? formatCurrency(parseFloat(guest.totalSpent))
                  : formatCurrency(pastBookings.reduce((acc, b) => acc + (b.totalAmount || 0), 0))
                }
              </p>
              <p className="text-sm text-muted-foreground">Lifetime Value</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{guest.loyaltyPoints || '0'}</p>
              <p className="text-sm text-muted-foreground">Loyalty Points</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Details */}
      <Tabs defaultValue="stays">
        <TabsList>
          <TabsTrigger value="stays">Stay History</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/* Stay History Tab */}
        <TabsContent value="stays" className="space-y-4">
          {upcomingBookings.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Stays
              </h3>
              <div className="space-y-3">
                {upcomingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            </div>
          )}
          
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Past Stays
            </h3>
            {pastBookings.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No past stays recorded
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pastBookings.slice(0, 10).map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
                {pastBookings.length > 10 && (
                  <Button variant="outline" className="w-full">
                    View All {pastBookings.length} Stays
                  </Button>
                )}
              </div>
            )}
          </div>

          {cancelledBookings.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-5 w-5" />
                Cancelled / No-Shows
              </h3>
              <div className="space-y-3">
                {cancelledBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Guest Preferences
              </CardTitle>
              <CardDescription>
                Saved preferences for personalized service
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Room Preferences</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pillow Type</span>
                      <span>{guest.preferences?.pillowType || 'Standard'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Floor Preference</span>
                      <span>{guest.preferences?.floorPreference || 'Any'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bed Type</span>
                      <span>{guest.preferences?.bedType || 'Any'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Smoking</span>
                      <span>{guest.preferences?.smokingPreference || 'Non-smoking'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Service Preferences</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Early Check-in</span>
                      <span>{guest.preferences?.earlyCheckIn ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Late Check-out</span>
                      <span>{guest.preferences?.lateCheckOut ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Special Diet</span>
                      <span>{guest.preferences?.specialDiet || 'None'}</span>
                    </div>
                    {guest.preferences?.accessibility && guest.preferences.accessibility.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Accessibility</span>
                        <span>{guest.preferences.accessibility.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Identity Documents
              </CardTitle>
              <CardDescription>
                Verified identification on file
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!guest.idType ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No documents on file</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 border rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {guest.idType === 'passport' ? 'Passport' 
                            : guest.idType === 'drivers_license' ? "Driver's License"
                            : guest.idType === 'national_id' ? 'National ID'
                            : 'Other ID'}
                        </p>
                        <Badge className="bg-green-100 text-green-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {guest.idNumber ? `***${guest.idNumber.slice(-4)}` : 'On file'}
                      </p>
                      {guest.nationality && (
                        <p className="text-sm text-muted-foreground">
                          Nationality: {guest.nationality}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Special Notes
              </CardTitle>
              <CardDescription>
                Important information about this guest
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!guest.specialNotes ? (
                <div className="py-8 text-center text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No notes recorded</p>
                  {onAddNote && (
                    <Button variant="outline" className="mt-4" onClick={onAddNote}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Note
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="whitespace-pre-wrap">{guest.specialNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Address Card */}
      {(guest.address1 || guest.city) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <address className="not-italic text-sm">
              {guest.address1 && <p>{guest.address1}</p>}
              {guest.address2 && <p>{guest.address2}</p>}
              {(guest.city || guest.state || guest.postalCode) && (
                <p>
                  {guest.city}{guest.city && guest.state && ', '}{guest.state} {guest.postalCode}
                </p>
              )}
              {guest.country && <p>{guest.country}</p>}
            </address>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BookingCard({ booking }: { booking: GuestBooking }) {
  const nights = differenceInDays(parseISO(booking.checkOutDate), parseISO(booking.checkInDate));
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{booking.confirmationNumber}</span>
              {getStatusBadge(booking.status)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                {format(parseISO(booking.checkInDate), 'MMM d')} - {format(parseISO(booking.checkOutDate), 'MMM d, yyyy')}
              </span>
              <span>{nights} night{nights !== 1 ? 's' : ''}</span>
              {booking.roomType && <span>{booking.roomType}</span>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-semibold">
              {formatCurrency(booking.totalAmount || 0)}
            </span>
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/dashboard/Booking/${booking.id}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        {booking.specialRequests && (
          <div className="mt-2 text-sm text-muted-foreground border-t pt-2">
            <span className="font-medium">Requests:</span> {booking.specialRequests}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default GuestProfile;
