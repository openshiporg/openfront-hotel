'use client';
import { graphqlClient } from '@/lib/graphql-client';
/** Browser GraphQL includes both signed guest-access and operator session cookies. */
export async function getLoyaltyAccount(bookingId: string) {
  const result = await graphqlClient.request<any>('query($bookingId:ID!){hotelLoyaltyAccount(bookingId:$bookingId)}', { bookingId });
  return JSON.parse(result.hotelLoyaltyAccount);
}
export async function redeemLoyaltyPoints(bookingId: string, points: number, idempotencyKey: string) {
  const result = await graphqlClient.request<any>('mutation($bookingId:ID!,$points:Int!,$idempotencyKey:String!){redeemHotelLoyalty(bookingId:$bookingId,points:$points,idempotencyKey:$idempotencyKey)}', { bookingId, points, idempotencyKey });
  return JSON.parse(result.redeemHotelLoyalty);
}
