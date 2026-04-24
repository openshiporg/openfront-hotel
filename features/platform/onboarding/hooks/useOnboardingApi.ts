import { GraphQLClient, gql } from 'graphql-request';
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import { SECTION_DEFINITIONS } from '../config/templates';
import { TemplateType, OnboardingStep } from './useOnboardingState';
import { getItemsFromJsonData } from '../utils/dataUtils';

const GRAPHQL_ENDPOINT = '/api/graphql';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: any;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: string, item: string) => void;
  setItemCompleted: (type: string, item: string) => void;
  setItemError: (type: string, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

interface CreateResultMap {
  roomTypes: Record<string, string>;
  rooms: Record<string, string>;
  guests: Record<string, string>;
}

function getErrorMessage(error: any) {
  if (error?.response?.errors?.length) {
    return error.response.errors.map((err: any) => err.message || 'Unknown GraphQL error').join('\n');
  }
  return error?.message || 'Unknown error';
}

export function useOnboardingApi({
  selectedTemplate,
  currentJsonData,
  completedItems,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setIsLoading,
  resetOnboardingState,
}: OnboardingApiProps) {
  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Starting hotel onboarding...');

    try {
      await startOnboarding();
    } catch (error) {
      console.error('Error marking onboarding as started:', error);
    }

    try {
      const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
        headers: { 'Content-Type': 'application/json' },
      });

      const ids: CreateResultMap = {
        roomTypes: {},
        rooms: {},
        guests: {},
      };

      ids.roomTypes = await createRoomTypes(client, currentJsonData);
      ids.rooms = await createRooms(client, currentJsonData, ids.roomTypes);
      await createRatePlans(client, currentJsonData, ids.roomTypes);
      await createSeasonalRates(client, currentJsonData, ids.roomTypes);
      ids.guests = await createGuests(client, currentJsonData);
      await createBookings(client, currentJsonData, ids);
      await createInventory(client, currentJsonData, ids.roomTypes);
      await createDailyMetrics(client, currentJsonData);

      setProgress('Hotel onboarding complete!');

      try {
        await completeOnboarding();
      } catch (error) {
        console.error('Error marking onboarding as completed:', error);
      }

      setStep('done');
    } catch (error: any) {
      handleOnboardingError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const createRoomTypes = async (client: GraphQLClient, data: any) => {
    setProgress('Creating room types...');
    const createdRoomTypes: Record<string, string> = {};

    for (const roomType of data.roomTypes || []) {
      const itemName = roomType.name || 'Unknown Room Type';
      setItemLoading('roomTypes', itemName);

      try {
        const existing = await client.request(
          gql`
            query ExistingRoomType($name: String!) {
              roomTypes(where: { name: { equals: $name } }) {
                id
                name
              }
            }
          `,
          { name: roomType.name }
        ) as { roomTypes: Array<{ id: string; name: string }> };

        if (existing.roomTypes[0]) {
          createdRoomTypes[roomType.name] = existing.roomTypes[0].id;
          setItemCompleted('roomTypes', itemName);
          continue;
        }

        const result = await client.request(
          gql`
            mutation CreateRoomType($data: RoomTypeCreateInput!) {
              createRoomType(data: $data) {
                id
                name
              }
            }
          `,
          {
            data: {
              name: roomType.name,
              baseRate: roomType.baseRate,
              maxOccupancy: roomType.maxOccupancy,
              bedConfiguration: roomType.bedConfiguration,
              amenities: roomType.amenities,
              squareFeet: roomType.squareFeet,
            },
          }
        ) as { createRoomType: { id: string; name: string } };

        createdRoomTypes[roomType.name] = result.createRoomType.id;
        setItemCompleted('roomTypes', itemName);
      } catch (error) {
        setItemError('roomTypes', itemName, getErrorMessage(error));
        throw error;
      }
    }

    return createdRoomTypes;
  };

  const createRooms = async (
    client: GraphQLClient,
    data: any,
    createdRoomTypes: Record<string, string>
  ) => {
    setProgress('Creating rooms...');
    const createdRooms: Record<string, string> = {};

    for (const room of data.rooms || []) {
      const itemName = `Room ${room.roomNumber}`;
      setItemLoading('rooms', itemName);

      try {
        const existing = await client.request(
          gql`
            query ExistingRoom($roomNumber: String!) {
              rooms(where: { roomNumber: { equals: $roomNumber } }) {
                id
                roomNumber
              }
            }
          `,
          { roomNumber: room.roomNumber }
        ) as { rooms: Array<{ id: string; roomNumber: string }> };

        if (existing.rooms[0]) {
          createdRooms[room.roomNumber] = existing.rooms[0].id;
          setItemCompleted('rooms', itemName);
          continue;
        }

        const result = await client.request(
          gql`
            mutation CreateRoom($data: RoomCreateInput!) {
              createRoom(data: $data) {
                id
                roomNumber
              }
            }
          `,
          {
            data: {
              roomNumber: room.roomNumber,
              floor: room.floor,
              status: room.status,
              notes: room.notes,
              roomType: createdRoomTypes[room.roomType]
                ? { connect: { id: createdRoomTypes[room.roomType] } }
                : undefined,
            },
          }
        ) as { createRoom: { id: string; roomNumber: string } };

        createdRooms[room.roomNumber] = result.createRoom.id;
        setItemCompleted('rooms', itemName);
      } catch (error) {
        setItemError('rooms', itemName, getErrorMessage(error));
        throw error;
      }
    }

    return createdRooms;
  };

  const createRatePlans = async (
    client: GraphQLClient,
    data: any,
    createdRoomTypes: Record<string, string>
  ) => {
    setProgress('Creating rate plans...');

    for (const ratePlan of data.ratePlans || []) {
      const itemName = ratePlan.name || 'Unknown Rate Plan';
      setItemLoading('ratePlans', itemName);

      try {
        const existing = await client.request(
          gql`
            query ExistingRatePlan($name: String!) {
              ratePlans(where: { name: { equals: $name } }) {
                id
                name
              }
            }
          `,
          { name: ratePlan.name }
        ) as { ratePlans: Array<{ id: string; name: string }> };

        if (existing.ratePlans[0]) {
          setItemCompleted('ratePlans', itemName);
          continue;
        }

        await client.request(
          gql`
            mutation CreateRatePlan($data: RatePlanCreateInput!) {
              createRatePlan(data: $data) {
                id
              }
            }
          `,
          {
            data: {
              name: ratePlan.name,
              description: ratePlan.description,
              roomType: createdRoomTypes[ratePlan.roomType]
                ? { connect: { id: createdRoomTypes[ratePlan.roomType] } }
                : undefined,
              baseRate: ratePlan.baseRate,
              minimumStay: ratePlan.minimumStay,
              maximumStay: ratePlan.maximumStay,
              advanceBookingMin: ratePlan.advanceBookingMin,
              advanceBookingMax: ratePlan.advanceBookingMax,
              cancellationPolicy: ratePlan.cancellationPolicy,
              mealPlan: ratePlan.mealPlan,
              status: ratePlan.status,
              isPublic: ratePlan.isPublic,
              isPromotional: ratePlan.isPromotional,
              priority: ratePlan.priority,
            },
          }
        );

        setItemCompleted('ratePlans', itemName);
      } catch (error) {
        setItemError('ratePlans', itemName, getErrorMessage(error));
        throw error;
      }
    }
  };

  const createSeasonalRates = async (
    client: GraphQLClient,
    data: any,
    createdRoomTypes: Record<string, string>
  ) => {
    setProgress('Creating seasonal rates...');

    for (const seasonalRate of data.seasonalRates || []) {
      const itemName = seasonalRate.name || 'Unknown Seasonal Rate';
      setItemLoading('seasonalRates', itemName);

      try {
        const existing = await client.request(
          gql`
            query ExistingSeasonalRate($name: String!) {
              seasonalRates(where: { name: { equals: $name } }) {
                id
                name
              }
            }
          `,
          { name: seasonalRate.name }
        ) as { seasonalRates: Array<{ id: string; name: string }> };

        if (existing.seasonalRates[0]) {
          setItemCompleted('seasonalRates', itemName);
          continue;
        }

        await client.request(
          gql`
            mutation CreateSeasonalRate($data: SeasonalRateCreateInput!) {
              createSeasonalRate(data: $data) {
                id
              }
            }
          `,
          {
            data: {
              name: seasonalRate.name,
              startDate: seasonalRate.startDate,
              endDate: seasonalRate.endDate,
              roomType: createdRoomTypes[seasonalRate.roomType]
                ? { connect: { id: createdRoomTypes[seasonalRate.roomType] } }
                : undefined,
              priceMultiplier: seasonalRate.priceMultiplier,
              minimumStay: seasonalRate.minimumStay,
              priority: seasonalRate.priority,
              isActive: seasonalRate.isActive,
            },
          }
        );

        setItemCompleted('seasonalRates', itemName);
      } catch (error) {
        setItemError('seasonalRates', itemName, getErrorMessage(error));
        throw error;
      }
    }
  };

  const createGuests = async (client: GraphQLClient, data: any) => {
    setProgress('Creating guest profiles...');
    const createdGuests: Record<string, string> = {};

    for (const guest of data.guests || []) {
      const itemName = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || guest.email || 'Unknown Guest';
      setItemLoading('guests', itemName);

      try {
        const existing = await client.request(
          gql`
            query ExistingGuest($email: String!) {
              guests(where: { email: { equals: $email } }) {
                id
                email
              }
            }
          `,
          { email: guest.email }
        ) as { guests: Array<{ id: string; email: string }> };

        if (existing.guests[0]) {
          createdGuests[guest.email] = existing.guests[0].id;
          setItemCompleted('guests', itemName);
          continue;
        }

        const result = await client.request(
          gql`
            mutation CreateGuest($data: GuestCreateInput!) {
              createGuest(data: $data) {
                id
                email
              }
            }
          `,
          {
            data: {
              firstName: guest.firstName,
              lastName: guest.lastName,
              email: guest.email,
              phone: guest.phone,
              preferences: guest.preferences,
              loyaltyNumber: guest.loyaltyNumber,
              loyaltyTier: guest.loyaltyTier,
              communicationPreferences: guest.communicationPreferences,
              company: guest.company,
              specialNotes: guest.specialNotes,
              isVip: guest.isVip,
              totalStays: guest.totalStays,
              totalSpent: guest.totalSpent,
            },
          }
        ) as { createGuest: { id: string; email: string } };

        createdGuests[guest.email] = result.createGuest.id;
        setItemCompleted('guests', itemName);
      } catch (error) {
        setItemError('guests', itemName, getErrorMessage(error));
        throw error;
      }
    }

    return createdGuests;
  };

  const createBookings = async (
    client: GraphQLClient,
    data: any,
    ids: CreateResultMap
  ) => {
    setProgress('Creating sample reservations...');

    for (const booking of data.bookings || []) {
      const itemName = booking.label || booking.key || booking.guestName || 'Sample Reservation';
      setItemLoading('bookings', itemName);

      try {
        const marker = `seed:${booking.key}`;
        const existing = await client.request(
          gql`
            query ExistingBooking($internalNotes: String!) {
              bookings(where: { internalNotes: { equals: $internalNotes } }) {
                id
              }
            }
          `,
          { internalNotes: marker }
        ) as { bookings: Array<{ id: string }> };

        if (existing.bookings[0]) {
          setItemCompleted('bookings', itemName);
          continue;
        }

        await client.request(
          gql`
            mutation CreateBooking($data: BookingCreateInput!) {
              createBooking(data: $data) {
                id
              }
            }
          `,
          {
            data: {
              guestName: booking.guestName,
              guestEmail: booking.guestEmail,
              checkInDate: booking.checkInDate,
              checkOutDate: booking.checkOutDate,
              numberOfGuests: booking.numberOfGuests,
              numberOfAdults: booking.numberOfAdults,
              numberOfChildren: booking.numberOfChildren,
              roomRate: booking.roomRate,
              taxAmount: booking.taxAmount,
              feesAmount: booking.feesAmount,
              totalAmount: booking.totalAmount,
              depositAmount: booking.depositAmount,
              balanceDue: booking.balanceDue,
              status: booking.status,
              paymentStatus: booking.paymentStatus,
              source: booking.source,
              specialRequests: booking.specialRequests,
              internalNotes: marker,
              guestProfile: ids.guests[booking.guestEmail]
                ? { connect: { id: ids.guests[booking.guestEmail] } }
                : undefined,
              roomAssignments: {
                create: [
                  {
                    room: ids.rooms[booking.roomNumber]
                      ? { connect: { id: ids.rooms[booking.roomNumber] } }
                      : undefined,
                    roomType: ids.roomTypes[booking.roomType]
                      ? { connect: { id: ids.roomTypes[booking.roomType] } }
                      : undefined,
                    guestName: booking.guestName,
                    ratePerNight: booking.roomRate,
                    specialRequests: booking.specialRequests,
                  },
                ],
              },
            },
          }
        );

        setItemCompleted('bookings', itemName);
      } catch (error) {
        setItemError('bookings', itemName, getErrorMessage(error));
        throw error;
      }
    }
  };

  const createInventory = async (
    client: GraphQLClient,
    data: any,
    createdRoomTypes: Record<string, string>
  ) => {
    setProgress('Creating availability snapshots...');

    for (const inventory of data.inventory || []) {
      const itemName = inventory.label || inventory.key || `${inventory.roomType} inventory`;
      setItemLoading('inventory', itemName);

      try {
        const roomTypeId = createdRoomTypes[inventory.roomType];
        const existing = await client.request(
          gql`
            query ExistingInventory($date: DateTime!, $roomTypeId: ID!) {
              roomInventories(
                where: {
                  date: { equals: $date }
                  roomType: { id: { equals: $roomTypeId } }
                }
              ) {
                id
              }
            }
          `,
          { date: inventory.date, roomTypeId }
        ) as { roomInventories: Array<{ id: string }> };

        if (existing.roomInventories[0]) {
          setItemCompleted('inventory', itemName);
          continue;
        }

        await client.request(
          gql`
            mutation CreateInventory($data: RoomInventoryCreateInput!) {
              createRoomInventory(data: $data) {
                id
              }
            }
          `,
          {
            data: {
              date: inventory.date,
              roomType: roomTypeId ? { connect: { id: roomTypeId } } : undefined,
              totalRooms: inventory.totalRooms,
              bookedRooms: inventory.bookedRooms,
              blockedRooms: inventory.blockedRooms,
            },
          }
        );

        setItemCompleted('inventory', itemName);
      } catch (error) {
        setItemError('inventory', itemName, getErrorMessage(error));
        throw error;
      }
    }
  };

  const createDailyMetrics = async (client: GraphQLClient, data: any) => {
    setProgress('Creating daily metrics...');

    for (const metric of data.dailyMetrics || []) {
      const itemName = `Metrics · ${new Date(metric.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })}`;
      setItemLoading('dailyMetrics', itemName);

      try {
        const existing = await client.request(
          gql`
            query ExistingMetric($date: DateTime!) {
              DailyMetricsRecords(where: { date: { equals: $date } }) {
                id
              }
            }
          `,
          { date: metric.date }
        ) as { DailyMetricsRecords: Array<{ id: string }> };

        if (existing.DailyMetricsRecords[0]) {
          setItemCompleted('dailyMetrics', itemName);
          continue;
        }

        await client.request(
          gql`
            mutation CreateDailyMetrics($data: DailyMetricsCreateInput!) {
              createDailyMetrics(data: $data) {
                id
              }
            }
          `,
          {
            data: {
              date: metric.date,
              totalRooms: metric.totalRooms,
              occupiedRooms: metric.occupiedRooms,
              occupancyRate: metric.occupancyRate,
              averageDailyRate: metric.averageDailyRate,
              revenuePerAvailableRoom: metric.revenuePerAvailableRoom,
              totalRevenue: metric.totalRevenue,
              channelRevenue: metric.channelRevenue,
              newReservations: metric.newReservations,
              cancellations: metric.cancellations,
              checkIns: metric.checkIns,
              checkOuts: metric.checkOuts,
            },
          }
        );

        setItemCompleted('dailyMetrics', itemName);
      } catch (error) {
        setItemError('dailyMetrics', itemName, getErrorMessage(error));
        throw error;
      }
    }
  };

  const handleOnboardingError = (error: any) => {
    const errorMessage = getErrorMessage(error);
    setError(errorMessage);
    console.error('Error during onboarding:', error);

    for (const section of SECTION_DEFINITIONS) {
      const sectionItems = getItemsFromJsonData(currentJsonData, section.type);
      const completedSectionItems = completedItems[section.type] || [];
      const failedItem = sectionItems.find((item) => !completedSectionItems.includes(item));

      if (failedItem) {
        setItemError(section.type, failedItem, errorMessage);
        break;
      }
    }
  };

  return { runOnboarding };
}
