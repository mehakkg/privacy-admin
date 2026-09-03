import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/platform/sign-in" title={"Sign-in methods"}>
      <Placeholder
        title={"Sign-in methods"}
        tip={"How Admin, DPO, CISO and Legal authenticate into this product itself — SSO, MFA."}
        what={"This is about how your internal governance users sign in to the platform — distinct from anything about Data Principals or connected systems. SSO and MFA configuration will live here."}
      />
    </Shell>
  );
}
