'use server';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { requireActionData } from '@/features/platform/lib/actionResult';
export async function getStayServices(input: { bookingId?: string; roomId?: string }) {
  const result = await keystoneClient<any>('query($bookingId:ID,$roomId:ID){hotelStayServices(bookingId:$bookingId,roomId:$roomId)}', input);
  return JSON.parse(requireActionData(result).hotelStayServices);
}
export async function saveStayService(input: { serviceId?: string; bookingId?: string; roomId?: string; category?: string; title?: string; description?: string; priority?: string; dueAt?: string; status: string; expectedStatus?: string; assignedToId?: string; resolution?: string; idempotencyKey: string }) {
  const result = await keystoneClient<any>('mutation($serviceId:ID,$bookingId:ID,$roomId:ID,$category:String,$title:String,$description:String,$priority:String,$dueAt:DateTime,$status:String!,$expectedStatus:String,$assignedToId:ID,$resolution:String,$idempotencyKey:String!){updateHotelStayService(serviceId:$serviceId,bookingId:$bookingId,roomId:$roomId,category:$category,title:$title,description:$description,priority:$priority,dueAt:$dueAt,status:$status,expectedStatus:$expectedStatus,assignedToId:$assignedToId,resolution:$resolution,idempotencyKey:$idempotencyKey)}', input);
  return JSON.parse(requireActionData(result).updateHotelStayService);
}
