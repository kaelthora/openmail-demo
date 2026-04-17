import { apiUrl } from "@/lib/config";

export async function checkBackend() {
  try {
    const res = await fetch(apiUrl("health"), {
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
