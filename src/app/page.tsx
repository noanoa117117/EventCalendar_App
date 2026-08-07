import { redirect } from "next/navigation";

export default function Home() {
  // Screen 1 (shared event calendar) is Phase 3; for now the app opens
  // straight into Screen 2 (personal availability).
  redirect("/availability");
}
