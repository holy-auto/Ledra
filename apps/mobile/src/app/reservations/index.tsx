import { Redirect } from "expo-router";

// ponytail: redirect to tab route — single source for reservation list
export default function ReservationsIndex() {
  return <Redirect href="/(tabs)/reservations" />;
}
