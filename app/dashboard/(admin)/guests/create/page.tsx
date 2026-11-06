import { CreatePage } from "@/features/dashboard/screens/CreatePage";

// guests/[id] serves the guest profile; this static segment keeps Models > Guests > Create on the shared create form.
export default function GuestCreatePage() {
  return <CreatePage params={Promise.resolve({ listKey: 'guests' })} />;
}
