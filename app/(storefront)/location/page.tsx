import { MapPin, Navigation, Train, Plane, Coffee, Building2, Landmark, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const nearbyAttractions = [
  { name: 'City Museum', distance: '0.3 miles', icon: Landmark },
  { name: 'Shopping District', distance: '0.5 miles', icon: ShoppingBag },
  { name: 'Business Center', distance: '0.8 miles', icon: Building2 },
  { name: 'Central Station', distance: '1.2 miles', icon: Train },
  { name: 'International Airport', distance: '12 miles', icon: Plane },
  { name: 'Artisan Coffee Row', distance: '0.2 miles', icon: Coffee },
];

const directions = [
  {
    title: 'From Airport',
    steps: [
      'Take Airport Express Line to Central Station (20 minutes)',
      'Transfer to Metro Line 2 towards Downtown',
      'Exit at Grand Plaza Station (5 minutes)',
      'Hotel is 2 blocks north on Main Street'
    ]
  },
  {
    title: 'By Car',
    steps: [
      'From Interstate 95, take Exit 42',
      'Follow signs to Downtown/City Center',
      'Turn right on Main Street',
      'Hotel entrance is on the left after 3 blocks',
      'Valet parking available at main entrance'
    ]
  }
];

export default function LocationPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Location & Directions</h1>
            <p className="text-xl text-muted-foreground">
              Conveniently located in the heart of the city
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-medium">Grand Hotel</p>
                  <p className="text-muted-foreground">123 Main Street</p>
                  <p className="text-muted-foreground">Downtown, Metropolitan City</p>
                  <p className="text-muted-foreground">MC 10001, United States</p>
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Phone: <a href="tel:+15551234567" className="text-blue-600 hover:underline">+1 (555) 123-4567</a>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Email: <a href="mailto:info@grandhotel.com" className="text-blue-600 hover:underline">info@grandhotel.com</a>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-100 dark:bg-slate-900 h-96">
                <CardContent className="p-0 h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MapPin className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Interactive map would be displayed here</p>
                    <p className="text-sm mt-2">Coordinates: 40.7589° N, 73.9851° W</p>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {directions.map((direction) => (
                  <Card key={direction.title}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Navigation className="h-5 w-5" />
                        {direction.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-2">
                        {direction.steps.map((step, index) => (
                          <li key={index} className="flex gap-3 text-sm">
                            <span className="font-semibold text-blue-600 dark:text-blue-400 min-w-[1.5rem]">
                              {index + 1}.
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Nearby Attractions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-4">
                    {nearbyAttractions.map((attraction) => {
                      const Icon = attraction.icon;
                      return (
                        <li key={attraction.name} className="flex items-start gap-3">
                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex-shrink-0 mt-0.5">
                            <Icon className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{attraction.name}</p>
                            <p className="text-sm text-muted-foreground">{attraction.distance}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Parking Information</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>• Valet parking: $35/day</p>
                  <p>• Self-parking: $25/day</p>
                  <p>• EV charging available</p>
                  <p>• Oversized vehicle parking</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
