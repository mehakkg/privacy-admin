import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** [route, active, title, tip, what] */
const pages = [
  [
    "discovery/ropa",
    "/discovery/ropa",
    "ROPA Recommendations",
    "AI-suggested entries for your formal Record of Processing Activities register, generated from what Discovery has already scanned and classified.",
    "Recommendations are generated from discovery and classification output — distinct from Processing Activities, which is the manual/CSV table for entries you add directly. Each suggestion will be reviewable, editable, and either accepted into the ROPA register or dismissed.",
  ],
  [
    "data-flow/integrity",
    "/data-flow/integrity",
    "Data Integrity",
    "The Section 8(3) obligation: completeness, accuracy and consistency of data used in a decision affecting a Data Principal, or disclosed to another Fiduciary.",
    "Sits alongside Protection Rules because both safeguard data in a way that is not about deletion or access. This screen will track and evidence the accuracy and consistency checks that s.8(3) requires before personal data drives a decision or leaves for another Fiduciary.",
  ],
  [
    "notifications/channels",
    "/notifications/channels",
    "Notification channels",
    "Configure the actual delivery mechanisms — email, SMS, Slack.",
    "Channels are the setup layer that Onboarding's Notification Routing step assumes already exists. This screen will let you add, test, and manage each delivery mechanism the platform can send through.",
  ],
  [
    "notifications/templates",
    "/notifications/templates",
    "Notification templates",
    "The message content sent for each event type.",
    "Templates define what each notification says. Paired with Channels (how it is delivered) and Routing (who receives it), they complete the notification setup that until now lived only inside Onboarding.",
  ],
  [
    "notifications/routing",
    "/notifications/routing",
    "Notification routing",
    "Per-event-type recipient assignment — the routing Onboarding configures once, given a permanent home.",
    "Onboarding sets routing once; nothing currently lets you revisit or adjust it afterwards. This screen is that permanent home — which role or person receives each event type, editable at any time.",
  ],
  [
    "platform/api-keys",
    "/platform/api-keys",
    "API keys",
    "Keys for a customer's own systems to call this platform programmatically.",
    "Distinct from Connected Systems (which are targets this platform reaches out to). API keys are inbound credentials your own systems use to call this platform. This screen will issue, scope, rotate, and revoke them.",
  ],
  [
    "platform/sign-in",
    "/platform/sign-in",
    "Sign-in methods",
    "How Admin, DPO, CISO and Legal authenticate into this product itself — SSO, MFA.",
    "This is about how your internal governance users sign in to the platform — distinct from anything about Data Principals or connected systems. SSO and MFA configuration will live here.",
  ],
  [
    "platform/branding",
    "/platform/branding",
    "Branding",
    "Platform-wide branding — the single source the Consent Platform's Preference Center styling should reference.",
    "Branding is platform-wide, not Consent-Platform-scoped. The Preference Center should read this same setting rather than keep a separate copy, so a logo or colour change is made once and applies everywhere the organisation is shown.",
  ],
  [
    "audit/violations",
    "/audit/violations",
    "Policy violation dashboard",
    "A proactive, system-detected violations feed — problems the system found on its own.",
    "Broader than Cookie & Website Compliance Monitoring (which only catches undisclosed scripts), and distinct from Escalations (conflicts a person raised) and Analytics (which scores posture rather than listing specific violations). This is the missing “the system found a problem on its own” category.",
  ],
  [
    "directory",
    "/directory",
    "User directory",
    "A searchable registry of known Data Principals and their consent and data status, independent of any single active request.",
    "For the “look up this specific person's full record” case, which nothing currently covers outside the context of an open Request. Searchable by identifier, showing consent state, data held, and request history at a glance.",
  ],
];

for (const [route, active, title, tip, what] of pages) {
  const file = join(root, "src/app", route, "page.tsx");
  mkdirSync(dirname(file), { recursive: true });
  const body = `import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active=${JSON.stringify(active)} title={${JSON.stringify(title)}}>
      <Placeholder
        title={${JSON.stringify(title)}}
        tip={${JSON.stringify(tip)}}
        what={${JSON.stringify(what)}}
      />
    </Shell>
  );
}
`;
  writeFileSync(file, body);
  console.log("wrote", route);
}
console.log("done");
