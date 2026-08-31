"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLE_COOKIE, VALID_ROLES } from "@/lib/session";
import type { ActorRole } from "@/lib/domain";

export async function switchRole(role: ActorRole) {
  if (!VALID_ROLES.includes(role)) return;
  const store = await cookies();
  store.set(ROLE_COOKIE, role, { path: "/", httpOnly: false, sameSite: "lax" });
  revalidatePath("/", "layout");
}
