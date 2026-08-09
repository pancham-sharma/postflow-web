import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PostFlow" },
      {
        name: "description",
        content:
          "How PostFlow collects, uses, stores and deletes your account data, connected social accounts and uploaded media.",
      },
      { property: "og:title", content: "Privacy Policy — PostFlow" },
      {
        property: "og:description",
        content:
          "How PostFlow handles your account data, connected social accounts, uploaded media and deletion requests.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/privacy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "3 August 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <main className="mesh-vanilla min-h-screen px-4 py-14">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm font-semibold text-primary hover:underline">
          ← Back to PostFlow
        </Link>

        <h1 className="mt-6 text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This page is maintained by the PostFlow app owner to explain what PostFlow collects and how
          it is used. PostFlow is a publishing tool: you upload media once and publish or schedule it
          to the social accounts you connect yourself.
        </p>

        <Section title="Information we collect">
          <p>
            <strong className="text-foreground">Account information.</strong> Your email address,
            display name and optional avatar, provided when you register or sign in with Google.
          </p>
          <p>
            <strong className="text-foreground">Connected social accounts.</strong> When you connect
            Instagram, Facebook, Pinterest, YouTube or Snapchat, we store the account id,
            account name/username and the access and refresh tokens the provider issues.
          </p>
          <p>
            <strong className="text-foreground">Content you upload.</strong> Images, videos, captions,
            hashtags, schedules and per-platform settings you create in the composer.
          </p>
          <p>
            <strong className="text-foreground">Operational records.</strong> Publishing job status,
            attempt history and error messages, plus workspace preferences such as timezone and
            language.
          </p>
        </Section>

        <Section title="How we use it">
          <p>
            We use your data only to operate the product: to publish or schedule your content to the
            accounts you connected, to show status and history in your dashboard, to send the
            notifications you enable, and to keep the service secure and working. We do not sell your
            data and we do not use your content to advertise to you.
          </p>
        </Section>

        <Section title="Connected platforms and subprocessors">
          <p>
            When you publish, your media, caption and metadata are sent to the platform APIs you
            selected (Meta for Instagram and Facebook, Pinterest, YouTube/Google, Snapchat).
            Their own privacy policies apply to what happens after delivery. PostFlow also relies on
            its hosting and database provider to run the app and store your data.
          </p>
        </Section>

        <Section title="Access tokens and security">
          <p>
            Social account tokens are encrypted before they are stored and are never returned to the
            browser, exposed in URLs, or written to logs. Access is scoped to your workspace at the
            database level, so members of one workspace cannot read another workspace&apos;s accounts,
            media or jobs. This description covers controls implemented in the app; it is not an
            independent audit or certification.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            Your data is kept while your account is active. Disconnecting a social account removes its
            stored tokens. From{" "}
            <span className="font-medium text-foreground">Settings</span> you can export your data as
            JSON at any time, or delete your account — which revokes stored provider tokens and
            removes your login. Content already published to an external platform must be removed on
            that platform.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            PostFlow uses only the storage needed to keep you signed in and to remember composer
            drafts and interface preferences in your browser. No advertising cookies are set by the
            app.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can update your profile and notification preferences, connect or disconnect any
            platform, export your data, and delete your account from inside the app. For any other
            privacy or data request, contact the app owner using the address below.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Privacy and security questions: reach the PostFlow app owner through the contact address
            published on this deployment. Suspected vulnerabilities should be reported privately
            rather than disclosed publicly.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy as the product changes. The date at the top of the page always
            reflects the current version.
          </p>
        </Section>
      </div>
    </main>
  );
}
