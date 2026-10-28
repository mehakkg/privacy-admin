import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/** S3 — Sign in. */
export default function LoginPage() {
  return <AuthShell><LoginForm /></AuthShell>;
}
