"use server";

import { revalidatePath } from "next/cache";
import { setDlpState, syncDlpNow, type DlpState } from "@/lib/engines/dlp";

/** DLP connection controls (demo). Revalidate everything so the nav warning updates. */
export async function setDlpStateAction(state: DlpState): Promise<{ ok: boolean }> {
  await setDlpState(state);
  revalidatePath("/", "layout");
  return { ok: true };
}
export async function syncDlpAction(): Promise<{ ok: boolean }> {
  await syncDlpNow();
  revalidatePath("/", "layout");
  return { ok: true };
}
